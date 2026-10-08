import sys
import json
import io
import re
import os
from contextlib import redirect_stdout
import cv2
import numpy as np
import pytesseract
import urllib.request

# ============================================
# SYSTEM PIPELINE TERMINAL SETTINGS
# ============================================

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

tesseract_command = os.environ.get("TESSERACT_CMD")
if tesseract_command:
    pytesseract.pytesseract.tesseract_cmd = tesseract_command
elif sys.platform == "win32":
    windows_tesseract = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.isfile(windows_tesseract):
        pytesseract.pytesseract.tesseract_cmd = windows_tesseract

# Initialize the official reader once in memory (English track)
# download_enabled=True pulls official model weights directly via secure SSL channels


# ============================================
# THE HYBRID OCR ENSEMBLE ENGINE
# ============================================

def advanced_hybrid_ocr(path):
    image = cv2.imread(path)
    if image is None:
        raise Exception("Source captured frames could not be read.")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape
    scale = min(2.5, 1800 / max(height, width))
    if scale > 1:
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    adaptive = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )
    variants = (gray, otsu, adaptive)
    tesseract_texts = []
    tesseract_available = True

    try:
        pytesseract.get_tesseract_version()
    except pytesseract.pytesseract.TesseractNotFoundError as error:
        tesseract_available = False
        print(f"Tesseract is unavailable; trying the OCR fallback: {error}", file=sys.stderr)

    if tesseract_available:
        for variant in variants:
            for page_mode in (6, 11, 12):
                try:
                    text = pytesseract.image_to_string(
                        variant, config=f"--psm {page_mode}"
                    ).strip()
                except pytesseract.pytesseract.TesseractError as error:
                    tesseract_available = False
                    print(f"Tesseract could not process the image: {error}", file=sys.stderr)
                    break
                if not text:
                    continue
                tesseract_texts.append(text)
                if regex_extract(text):
                    print(
                        f"Tesseract recognized a score using page mode {page_mode}.",
                        file=sys.stderr
                    )
                    return text
            if not tesseract_available:
                break

    tesseract_text = max(tesseract_texts, key=len, default="")

    if os.environ.get("SCORELYTICS_HOSTED") == "1" and os.environ.get("SCORELYTICS_ENABLE_EASYOCR") != "1":
        print("Tesseract found no score; hosted EasyOCR is disabled.", file=sys.stderr)
        return tesseract_text

    print("Tesseract found no score; initializing CPU EasyOCR fallback.", file=sys.stderr)
    import easyocr

    with redirect_stdout(sys.stderr):
        ocr_reader = easyocr.Reader(['en'], gpu=False, download_enabled=True)
        easyocr_results = ocr_reader.readtext(image, detail=0)
    easyocr_text = " ".join(easyocr_results).strip()

    if regex_extract(easyocr_text):
        return easyocr_text
    return easyocr_text or tesseract_text

# ============================================
# PATTERN MATCH LAYOUT PARSER
# ============================================

def regex_extract(text):
    normalized_text = re.sub(r"\s+", " ", text)
    patterns = [
        r'(\d{1,4})\s*/\s*(\d{1,4})',
        r'(\d{1,4})\s+out\s+of\s+(\d{1,4})',
        r'(\d{1,4})\s+of\s+(\d{1,4})',
        r'(\d{1,4})\s*[|¦:]\s*(\d{1,4})'
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, normalized_text, re.IGNORECASE):
            score = int(match.group(1))
            total = int(match.group(2))
            if total > 0 and score <= total:
                return {"score": score, "total": total}

    score_pattern = re.compile(
        r'\b(?:score|marks?\s*(?:obtained|earned|scored)|obtained|earned)\b'
        r'\s*(?:was|is|:|=|-)?\s*(\d{1,4})\b',
        re.IGNORECASE
    )
    total_pattern = re.compile(
        r'\b(?:total|maximum|max|possible)\s*(?:marks?|score|points?)?\b'
        r'\s*(?:was|is|:|=|-)?\s*(\d{1,4})\b',
        re.IGNORECASE
    )
    scores = [(int(match.group(1)), match.start()) for match in score_pattern.finditer(normalized_text)]
    totals = [(int(match.group(1)), match.start()) for match in total_pattern.finditer(normalized_text)]
    for score, score_position in scores:
        for total, total_position in totals:
            if abs(total_position - score_position) <= 100 and total > 0 and score <= total:
                return {"score": score, "total": total}
    return None


def validate_ai_extraction(data):
    if not isinstance(data, dict):
        return None
    try:
        score = float(data.get("score"))
        total = float(data.get("total"))
    except (TypeError, ValueError):
        return None
    if (
        not score.is_integer()
        or not total.is_integer()
        or total <= 0
        or score < 0
        or score > total
    ):
        return None

    subject = str(data.get("subject") or "Unknown Subject").strip()
    if not subject:
        subject = "Unknown Subject"
    if subject.isdigit():
        subject = f"Subject {subject}"
    return {"subject": subject, "score": int(score), "total": int(total)}


# ============================================
# LOCAL AI PARSING INTERFACE
# ============================================

def ask_ollama(text):
    prompt = f"Extract:\nsubject\nscore\ntotal\n\nReturn ONLY valid JSON format.\n\nText:\n{text}"
    payload = {
        "model": "qwen2.5:0.5b",
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.0}
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            "http://localhost:11434/api/generate",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
            output = body.get("response", "").strip()
            json_match = re.search(r'(\{.*\})', output, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1).strip())
            return None
    except Exception:
        return None


# ============================================
# CONTROL LOOP LOOP ENTRY
# ============================================

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided."}))
        return

    image_path = sys.argv[1]

    try:
        # Run our smart hybrid extraction loop
        text = advanced_hybrid_ocr(image_path)

        if not text:
            print(json.dumps({"error": "No readable text isolated."}))
            return

        regex_data = regex_extract(text)
        ai_data = None
        if os.environ.get("SCORELYTICS_HOSTED") != "1":
            ai_data = validate_ai_extraction(ask_ollama(text))

        if regex_data:
            # Trust the OCR's verified fraction; use AI only to enrich its subject.
            if (
                ai_data
                and ai_data["score"] == regex_data["score"]
                and ai_data["total"] == regex_data["total"]
            ):
                print(json.dumps(ai_data))
                return
            print(json.dumps({
                "subject": "Unknown Subject",
                "score": regex_data["score"],
                "total": regex_data["total"]
            }))
            return

        if ai_data:
            print(json.dumps(ai_data))
            return

        print(json.dumps({"error": "Unable to detect score.", "debug_text": text}))

    except Exception as error:
        print(json.dumps({"error": str(error)}))

if __name__ == "__main__":
    main()
