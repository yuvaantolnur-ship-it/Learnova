def generate_weekly_schedule(weakest_subject, readiness):
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    schedule = {}
    
    # Logic: Lower readiness means more intensive review sessions are needed
    study_hours = 2 if readiness >= 80 else 3 if readiness >= 60 else 4
    
    for day in days:
        if day in ["Saturday", "Sunday"]:
            # Weekends focus heavily on recovery and targeting weak zones
            schedule[day] = f"Focus 100% on {weakest_subject} review ({study_hours} hrs) + Weekly Self-Test 📝"
        elif day in ["Tuesday", "Thursday"]:
            # Mid-week deep dives
            schedule[day] = f"Core Study: {weakest_subject} concepts ({study_hours - 1} hrs) + General Homework 📚"
        else:
            # Standard study maintenance
            schedule[day] = f"General Review: Review other core subjects (1.5 hrs) + Homework ✏️"
            
    return schedule