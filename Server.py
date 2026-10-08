import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Allow your native JS website to talk to this Python server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# This calculates the score movement trend
def calculate_trend(scores):
    if len(scores) < 2:
        return "neutral", 0
    
    # Take the last 3 test scores to find recent momentum
    recent_scores = scores[-3:]
    total_change = 0
    
    for i in range(1, len(recent_scores)):
        total_change += (recent_scores[i] - recent_scores[i-1])
        
    average_change = total_change / (len(recent_scores) - 1)
    
    if average_change > 1.5:
        return "improving", average_change
    elif average_change < -1.5:
        return "dropping", average_change
    else:
        return "stable", average_change

@app.get("/api/studybot")
def analyze_scores_and_chat(user_message: str):
    # 1. Read your existing ScoreLytics .json file
    try:
        with open("user_data.json", "r") as file:
            data = json.load(file)
            tests = data.get("tests", [])
    except FileNotFoundError:
        return {"reply": "I can help once you add a test score. Add one first, then ask me again!"}

    # 2. Group the scores by subject dynamically
    subject_map = {}
    for test in tests:
        sub = test["subject"].lower()
        score = float(test["score"])
        if sub not in subject_map:
            subject_map[sub] = []
        subject_map[sub].append(score)

    message_lower = user_message.lower()
    
    # 3. Pure Python AI Logic: Match message intent with calculated trends
    for subject, scores in subject_map.items():
        if subject in message_lower:
            current_average = sum(scores) / len(scores)
            trend, velocity = calculate_trend(scores)
            last_score = scores[-1]

            if trend == "dropping":
                return {
                    "reply": f"📊 Your average in {subject.title()} is {current_average:.1f}%. Your recent scores have gone down a little. Your last score was {last_score}%. Try reviewing your notes for 15 minutes today, then practise a few questions."
                }
            elif trend == "improving":
                return {
                    "reply": f"Awesome work! 🚀 Your {subject.title()} scores are going up. Your latest score was {last_score}%. Keep practising and be proud of your progress!"
                }
            else:
                return {
                    "reply": f"🎯 Your {subject.title()} score is staying steady, with an average of {current_average:.1f}%. Your last score was {last_score}%. Try a few extra practice questions this week and see if you can beat your last score!"
                }

    # Default overview analysis if no specific subject was named
    return {
        "reply": "Hi! I’m StudyBot. Ask me about a subject, your test scores, or how to make a study plan."
    }