import json
from openai import OpenAI
from config import OPENROUTER_API_KEY, OPENROUTER_MODEL

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY
)


def analyze_email(email_body):

    if not email_body.strip():
        return {
            "summary": "No content",
            "category": "Other",
            "priority": "Low",
            "deadline": "None",
            "recommended_action": "Read Email",
            "reason": "AI recommendation unavailable.",
            "confidence": "60%"
        }

    prompt = f"""
Analyze the email.

Return ONLY VALID JSON.

Example:

{{
    "summary":"...",
    "category":"Internship",
    "priority":"High",
    "deadline":"2026-08-10",
    "recommended_action":"Apply Immediately",
    "reason":"The application deadline is approaching.",
    "confidence":"96%"
}}

Categories:
Internship
Job
Course
Promotion
Security
Social
Other

Priorities:
High
Medium
Low

Email:

{email_body}
"""

    try:

        response = client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "Return ONLY JSON. Never use markdown."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0
        )

        text = response.choices[0].message.content.strip()

        text = text.replace("```json", "")
        text = text.replace("```", "")
        text = text.strip()

        data = json.loads(text)

        return data

    except Exception:

        return {
            "summary": email_body[:250],
            "category": "Other",
            "priority": "Low",
            "deadline": "None",
            "recommended_action": "Read Email",
            "reason": "AI recommendation unavailable.",
            "confidence": "60%"
        }
