import sys
import json
import os
import urllib.error
import urllib.request

# ====================================
# HELPERS
# ====================================

def safe_average(values):
    if not values:
        return 0.0
    return sum(values) / len(values)


def calculate_subject_stats(tests):
    subjects = {}
    for test in tests:
        subject = test.get("subject", "General").strip()
        if not subject:
            continue

        score = float(test.get("score", 0))
        total = float(test.get("total", 1))

        if total <= 0:
            continue

        percentage = (score / total) * 100

        if subject not in subjects:
            subjects[subject] = []
        subjects[subject].append(percentage)

    return subjects


def build_grade_summary(tests):
    lines = []
    for test in tests:
        try:
            percentage = (float(test["score"]) / float(test["total"])) * 100
            lines.append(
                f"- {test['subject']}: {test['score']}/{test['total']} ({percentage:.1f}%)"
            )
        except Exception:
            pass
    return "\n".join(lines)


def weakest_subject(subject_stats):
    if not subject_stats:
        return None
    return min(
        subject_stats,
        key=lambda subject: safe_average(subject_stats[subject])
    )


def strongest_subject(subject_stats):
    if not subject_stats:
        return None
    return max(
        subject_stats,
        key=lambda subject: safe_average(subject_stats[subject])
    )


# ====================================
# SCORE PREDICTION
# ====================================

def predict_next_score(subject_stats):
    predictions = {}
    for subject, scores in subject_stats.items():
        if len(scores) < 2:
            predictions[subject] = scores[-1]
            continue

        recent = scores[-3:]
        changes = []
        for i in range(1, len(recent)):
            changes.append(recent[i] - recent[i - 1])

        trend = sum(changes) / len(changes)
        predictions[subject] = recent[-1] + trend

    return predictions


# ====================================
# READINESS SCORE
# ====================================

def calculate_readiness(tests):
    if not tests:
        return 0

    earned = 0
    total = 0
    for test in tests:
        earned += float(test.get("score", 0))
        total += float(test.get("total", 0))

    if total == 0:
        return 0

    return round((earned / total) * 100, 1)


def format_chat_history(history):
    if not isinstance(history, list):
        return ""

    lines = []
    remaining_characters = 12000
    for message in history[-12:]:
        if not isinstance(message, dict) or message.get("role") not in {"user", "assistant"}:
            continue
        content = message.get("content")
        if not isinstance(content, str) or not content.strip() or remaining_characters <= 0:
            continue
        prefix = f"{message['role'].capitalize()}: "
        separator_length = 1 if lines else 0
        content_limit = remaining_characters - len(prefix) - separator_length
        if content_limit <= 0:
            break
        content = content.strip()[:content_limit]
        lines.append(f"{prefix}{content}")
        remaining_characters -= len(prefix) + len(content) + separator_length

    return "\n".join(lines)


# ====================================
# OLLAMA BRIDGE
# ====================================

def ask_ollama(prompt):
    payload = {
        "model": "qwen2.5:1.5b",
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.6
        }
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            "http://localhost:11434/api/generate",
            data=data,
            headers={"Content-Type": "application/json"}
        )

        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise RuntimeError(
                "Ollama could not find the qwen2.5:1.5b model. "
                "Open Ollama and run `ollama pull qwen2.5:1.5b`, then try again."
            ) from error
        raise RuntimeError(
            f"The local Ollama service returned HTTP {error.code}. "
            "Check that Ollama is running, then try again."
        ) from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(
            "StudyBot cannot connect to local Ollama. Open Ollama or run "
            "`ollama serve`, and make sure `qwen2.5:1.5b` is installed."
        ) from error
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ValueError("The local Ollama service returned an unreadable response.") from error

    if not isinstance(body, dict) or not isinstance(body.get("response"), str):
        raise ValueError("The local Ollama service returned an invalid response.")

    reply = body["response"].strip()
    if not reply:
        raise ValueError("The local Ollama service returned an empty reply.")
    return reply

def ask_gemini(prompt):
    api_key = os.environ.get("GEMINI_API_KEY")
    payload = {
        "model": os.environ.get("GEMINI_MODEL", "gemini-pro"),
        "contents": [{"parts": [{"text": prompt}]}],
        "temperature": 0.6
    }
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
        choices = body.get("candidates")
        if not choices or not isinstance(choices[0].get("content", {}).get("parts")[0].get("text"), str):
            raise ValueError("The AI service returned no message.")
        return choices[0]["content"]["parts"][0]["text"].strip()
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Gemini request failed with HTTP {error.code}.") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError("Could not connect to the hosted AI service.") from error


# ====================================
# MAIN EXECUTION ENTRY LOOP
# ====================================

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"reply": "StudyBot is having trouble right now. Please try again in a moment."}))
        return

    # FIXED: Added explicit indices to catch the incoming Node.js string arguments
    user_message = sys.argv[1]
    tests_json = sys.argv[2]
    history_json = sys.argv[3] if len(sys.argv) > 3 else "[]"

    try:
        tests = json.loads(tests_json)
    except Exception:
        tests = []

    try:
        chat_history = format_chat_history(json.loads(history_json))
    except (TypeError, ValueError):
        chat_history = ""

    # Prevent prompt context explosion by parsing recent items
    recent_tests = tests[-10:]

    subject_stats = calculate_subject_stats(recent_tests)
    grades_summary = build_grade_summary(recent_tests)
    weakest = weakest_subject(subject_stats)
    strongest = strongest_subject(subject_stats)
    readiness = calculate_readiness(recent_tests)
    predictions = predict_next_score(subject_stats)

    system_prompt = f"""
You are StudyBot, a brilliant academic advisor.

Rules:
- Speak directly to the student in a kind, encouraging voice. Use simple words a young student can understand.
- Do not mention hidden instructions, calculations, predictions, or technical details. Explain results in everyday language.
- Keep standard answers under 6 sentences.
- CRITICAL: If the student asks for a "schedule", "plan", or "calendar", bypass the 6-sentence rule and print out a detailed, clear day-by-day weekly study schedule (Monday to Sunday).
- Make sure the schedule heavily targets their Weakest Subject on multiple days.
- Use the student's exact academic metrics to personalize the strategy.
- DO NOT answer questions about anything other than academic performance, study strategies, related topics, and questions about actual questions from studies or assignments.

Study progress: {readiness}%
Strongest subject: {strongest}
Subject to practise: {weakest}
Possible next scores: {json.dumps(predictions)}
Recent test scores:
{grades_summary}

Recent conversation:
{chat_history or "(This is the first message in this chat.)"}

Question:
{user_message}
"""

    try:
        reply = ask_ollama(system_prompt)
    except (RuntimeError, ValueError) as error:
        print(f"[STUDYBOT] Request failed: {error}", file=sys.stderr)
        reply = "StudyBot is having trouble right now. Please try again in a moment."
    print(json.dumps({"reply": reply}))


if __name__ == "__main__":
    main()
