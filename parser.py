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

    # 1. Convert to grayscale and isolate high-contrast lines
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    sharpen_filter = np.array([[-1, -1, -1], 
                               [-1,  9, -1], 
                               [-1, -1, -1]])
    sharp_gray = cv2.filter2D(gray, -1, sharpen_filter)

    # 2. SPEED-BOOST: Run a blazing fast, crisp Tesseract pass first
    _, thresh_otsu = cv2.threshold(sharp_gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    tesseract_text = pytesseract.image_to_string(thresh_otsu, config='--psm 6').strip()

    # 🎯 IF THE ACCURATE TEXT PATHWAY IS CLEAR, RETURN IMMEDIATELY (Takes < 0.5 seconds!)
    # We check if it caught any numeric fractions or scores right away
    if re.search(r'\d+', tesseract_text) and len(tesseract_text) > 2:
        print("High-Speed Tesseract pipeline successful.", file=sys.stderr)
        return tesseract_text

    if os.environ.get("SCORELYTICS_HOSTED") == "1" and os.environ.get("SCORELYTICS_ENABLE_EASYOCR") != "1":
        print("Tesseract found no score and hosted EasyOCR is disabled.", file=sys.stderr)
        return tesseract_text

    # 3. SLOW FALLBACK: Only engage the heavy EasyOCR model if Tesseract reads pure noise
    print("Tesseract found no readable score; initializing CPU EasyOCR fallback.", file=sys.stderr)
    import easyocr

    with redirect_stdout(sys.stderr):
        ocr_reader = easyocr.Reader(['en'], gpu=False, download_enabled=True)
        easyocr_results = ocr_reader.readtext(image, detail=0)
    easyocr_text = " ".join(easyocr_results).strip()

    if easyocr_text:
        return easyocr_text
        
    return tesseract_text

# ============================================
# PATTERN MATCH LAYOUT PARSER
# ============================================

def regex_extract(text):
    patterns = [
        r'(\d+)\s*/\s*(\d+)',
        r'(\d+)\s+out\s+of\s+(\d+)',
        r'(\d+)\s+of\s+(\d+)'
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return {"score": int(match.group(1)), "total": int(match.group(2))}
    return None

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
        ai_data = None if os.environ.get("SCORELYTICS_HOSTED") == "1" else ask_ollama(text)

        if ai_data:
            print(json.dumps(ai_data))
            return

        if regex_data:
            print(json.dumps({
                "subject": "Unknown Subject",
                "score": regex_data["score"],
                "total": regex_data["total"]
            }))
            return

        print(json.dumps({"error": "Unable to detect score.", "debug_text": text}))

    except Exception as error:
        print(json.dumps({"error": str(error)}))

if __name__ == "__main__":
    main()
