from openai import OpenAI

from config import OPENROUTER_API_KEY, OPENROUTER_MODEL
from database import get_connection

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY
)

# ---------------------------------------------------------------------------
# System prompt — no reasoning, no narration, direct answers only
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are an AI Email Copilot.

Answer ONLY using the emails provided to you.

Rules:
- Never say "Let me scan...", "I searched...", "Based on...", "Looking at..."
- Never explain your process or reasoning
- Never make up emails that were not provided
- Be direct and concise

Format for listing emails:
1. [Subject]
   Sender: [sender]
   Account: [account]
   Summary: [one line]

If no emails were provided, reply exactly:
I couldn't find any emails related to that."""

# Conversation history per session (resets on server restart)
conversation_history = [
    {"role": "system", "content": SYSTEM_PROMPT}
]

# ---------------------------------------------------------------------------
# Stop words — stripped before keyword search
# ---------------------------------------------------------------------------
STOP_WORDS = {
    "show", "me", "email", "emails", "for", "about", "related",
    "find", "the", "is", "to", "my", "which", "are", "in", "on",
    "from", "what", "all", "any", "some", "can", "you", "please",
    "could", "would", "give", "list", "display", "get", "fetch",
    "search", "with", "and", "or", "have", "has", "do", "does",
    "did", "a", "an", "that", "this", "there", "how", "many",
    "much", "tell", "i", "latest", "recent", "new", "old"
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_keyword(question: str) -> str:
    """Strip stop words, return the meaningful search term."""
    words = [
        w for w in question.lower().split()
        if w not in STOP_WORDS and len(w) > 1
    ]
    return " ".join(words) if words else question.lower().strip()


def detect_mentioned_account(question: str) -> str | None:
    """Return the Gmail account if the user explicitly named one."""
    conn = get_connection()
    accounts = conn.execute("SELECT email FROM gmail_accounts").fetchall()
    conn.close()
    q = question.lower()
    for row in accounts:
        if row["email"].lower() in q:
            return row["email"]
    return None


def detect_intent(question: str) -> str:
    """
    Route the question to the right SQL strategy.

    Intents
    -------
    reply       → high-priority or deadline emails  (what to reply to first)
    deadline    → emails with a deadline
    high        → high priority emails
    job         → category = Job
    internship  → category = Internship
    promotion   → category = Promotion
    sender      → search by sender name/domain
    summary     → general keyword search
    stats       → counts / statistics
    """
    q = question.lower()

    # Reply-priority intent
    if any(w in q for w in ["reply", "respond", "answer", "should i"]):
        return "reply"

    # Deadline intent
    if any(w in q for w in ["deadline", "due", "expire", "expiring", "urgent"]):
        return "deadline"

    # High priority intent
    if any(w in q for w in ["high priority", "important", "critical", "priority"]):
        return "high"

    # Job intent
    if any(w in q for w in ["job", "jobs", "placement", "hiring", "hire",
                             "full time", "full-time", "position", "role",
                             "opening", "vacancy"]):
        return "job"

    # Internship intent
    if any(w in q for w in ["intern", "internship", "internships", "trainee",
                             "training program"]):
        return "internship"

    # Promotion intent
    if any(w in q for w in ["promo", "promotion", "offer", "discount", "sale",
                             "deal", "newsletter"]):
        return "promotion"

    # Stats intent
    if any(w in q for w in ["how many", "count", "total", "statistics",
                             "summary", "overview", "breakdown"]):
        return "stats"

    # Default: keyword search
    return "keyword"


# ---------------------------------------------------------------------------
# Per-intent SQL queries
# ---------------------------------------------------------------------------

def fetch_by_intent(intent: str, keyword: str,
                    account: str | None, limit: int = 8) -> list:
    """
    Run the correct SQL query for the detected intent.
    SQLite does the searching — LLM only explains.
    """
    conn = get_connection()
    kw = f"%{keyword}%"
    acc_filter = "AND account_email = ?" if account else ""
    acc_param  = [account] if account else []

    # ---- reply: what should I reply to first? ----
    if intent == "reply":
        query = f"""
            SELECT account_email, subject, sender, summary,
                   category, priority, deadline
            FROM emails
            WHERE (priority = 'High' OR deadline IS NOT NULL)
            {acc_filter}
            ORDER BY
                CASE priority
                    WHEN 'High'   THEN 1
                    WHEN 'Medium' THEN 2
                    ELSE 3
                END,
                deadline ASC
            LIMIT ?
        """
        params = acc_param + [limit]

    # ---- deadline ----
    elif intent == "deadline":
        query = f"""
            SELECT account_email, subject, sender, summary,
                   category, priority, deadline
            FROM emails
            WHERE deadline IS NOT NULL
              AND deadline != ''
            {acc_filter}
            ORDER BY deadline ASC
            LIMIT ?
        """
        params = acc_param + [limit]

    # ---- high priority ----
    elif intent == "high":
        query = f"""
            SELECT account_email, subject, sender, summary,
                   category, priority, deadline
            FROM emails
            WHERE priority = 'High'
            {acc_filter}
            ORDER BY id DESC
            LIMIT ?
        """
        params = acc_param + [limit]

    # ---- job ----
    elif intent == "job":
        query = f"""
            SELECT account_email, subject, sender, summary,
                   category, priority, deadline
            FROM emails
            WHERE LOWER(category) = 'job'
            {acc_filter}
            ORDER BY id DESC
            LIMIT ?
        """
        params = acc_param + [limit]

    # ---- internship ----
    elif intent == "internship":
        query = f"""
            SELECT account_email, subject, sender, summary,
                   category, priority, deadline
            FROM emails
            WHERE LOWER(category) = 'internship'
            {acc_filter}
            ORDER BY id DESC
            LIMIT ?
        """
        params = acc_param + [limit]

    # ---- promotion ----
    elif intent == "promotion":
        query = f"""
            SELECT account_email, subject, sender, summary,
                   category, priority, deadline
            FROM emails
            WHERE LOWER(category) = 'promotion'
            {acc_filter}
            ORDER BY id DESC
            LIMIT ?
        """
        params = acc_param + [limit]

    # ---- stats ----
    elif intent == "stats":
        # For stats we return aggregate rows, not individual emails
        query = f"""
            SELECT category,
                   COUNT(*) AS total,
                   SUM(CASE WHEN priority='High' THEN 1 ELSE 0 END) AS high_count
            FROM emails
            {"WHERE account_email = ?" if account else ""}
            GROUP BY category
            ORDER BY total DESC
        """
        params = acc_param

    # ---- keyword / general ----
    else:
        query = f"""
            SELECT account_email, subject, sender, summary,
                   category, priority, deadline
            FROM emails
            WHERE (
                LOWER(subject) LIKE LOWER(?)
             OR LOWER(sender)  LIKE LOWER(?)
             OR LOWER(summary) LIKE LOWER(?)
             OR LOWER(body)    LIKE LOWER(?)
            )
            {acc_filter}
            ORDER BY id DESC
            LIMIT ?
        """
        params = [kw, kw, kw, kw] + acc_param + [limit]

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return rows


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

def build_context(rows: list, intent: str) -> str:
    if not rows:
        return ""

    lines = []

    if intent == "stats":
        lines.append("Email breakdown by category:\n")
        for row in rows:
            lines.append(
                f"  {row['category'] or 'Other'}: "
                f"{row['total']} total, {row['high_count']} high priority"
            )
        return "\n".join(lines)

    for i, email in enumerate(rows, 1):
        summary  = email["summary"]  or "No summary"
        deadline = email["deadline"] or "None"
        lines.append(
            f"Email {i}:\n"
            f"  Account:  {email['account_email']}\n"
            f"  Subject:  {email['subject']}\n"
            f"  From:     {email['sender']}\n"
            f"  Category: {email['category']} | "
            f"Priority: {email['priority']} | "
            f"Deadline: {deadline}\n"
            f"  Summary:  {summary}"
        )

    return "\n\n".join(lines)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def ask_database(question: str) -> str:
    """
    Correct workflow:
    1. Detect intent          (what does the user want?)
    2. Detect mentioned account
    3. Extract keyword        (strip stop words)
    4. Run the right SQL      (SQLite searches, not LLM)
    5. Build a small context  (max 8 emails)
    6. Ask LLM to explain     (natural language only)
    """

    # 1. Intent
    intent = detect_intent(question)

    # 2. Account filter
    account = detect_mentioned_account(question)

    # 3. Keyword (used by keyword / sender intents)
    keyword = extract_keyword(question)

    # 4. Database search
    rows = fetch_by_intent(intent, keyword, account, limit=8)

    # 5. Build context
    context = build_context(rows, intent)

    # 6. Compose prompt
    if context:
        prompt = (
            f"Emails retrieved ({len(rows)} result(s)):\n\n"
            f"{context}\n\n"
            f"User question: {question}"
        )
    else:
        prompt = (
            f"No emails were found for: \"{keyword}\" "
            f"(intent: {intent}"
            + (f", account: {account}" if account else "")
            + f")\n\nUser question: {question}"
        )

    # Maintain conversation history
    conversation_history.append({"role": "user", "content": prompt})

    # Keep the system prompt + last 9 exchanges
    if len(conversation_history) > 10:
        conversation_history[:] = (
            [conversation_history[0]] + conversation_history[-9:]
        )

    # 7. LLM — natural language response only
    try:
        response = client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=conversation_history,
            temperature=0.3,
            max_tokens=600,
        )

        if getattr(response, "error", None):
            return (
                "The AI provider is temporarily unavailable. "
                f"Details: {response.error.get('message')}"
            )

        if not response.choices:
            return "The AI provider returned an empty response."

        answer = response.choices[0].message.content.strip()

        conversation_history.append({"role": "assistant", "content": answer})

        return answer

    except Exception as e:
        return f"AI Error: {str(e)}"
