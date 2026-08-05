from openai import OpenAI
from config import OPENROUTER_API_KEY, OPENROUTER_MODEL

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY
)

def generate_reply(email_body, tone="Professional"):

    prompt = f"""
Write a {tone} email reply.

Reply ONLY with the email.

Email:

{email_body}
"""

    response = client.chat.completions.create(
        model=OPENROUTER_MODEL,
        messages=[
            {
                "role":"system",
                "content":"You are an expert email writer."
            },
            {
                "role":"user",
                "content":prompt
            }
        ],
        temperature=0.4
    )

    return response.choices[0].message.content.strip()