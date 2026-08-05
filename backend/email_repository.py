import sqlite3

from database import get_connection


def save_email(
    gmail_id,
    account_email,
    thread_id,
    sender,
    subject,
    snippet,
    body,
    date,
    labels,
    is_read
):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR IGNORE INTO emails
        (
            gmail_id,
            account_email,
            thread_id,
            sender,
            subject,
            snippet,
            body,
            date,
            labels,
            is_read
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        gmail_id,
        account_email,
        thread_id,
        sender,
        subject,
        snippet,
        body,
        date,
        labels,
        is_read
    ))

    conn.commit()
    inserted = cursor.rowcount
    conn.close()

    return inserted


def update_email_analysis(
    gmail_id,
    account_email,
    summary,
    category,
    priority,
    deadline,
    recommended_action,
    reason,
    confidence
):

    conn = get_connection()

    cursor = conn.cursor()

    cursor.execute("""

        UPDATE emails

        SET

        summary=?,

        category=?,

        priority=?,

        deadline=?,

        recommended_action=?,

        reason=?,

        confidence=?

        WHERE gmail_id=?
        AND account_email=?

    """,

    (

        summary,

        category,

        priority,

        deadline,

        recommended_action,

        reason,

        confidence,

        gmail_id,
        account_email

    ))

    conn.commit()

    conn.close()


def get_unprocessed_emails(limit=5):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            gmail_id,
            account_email,
            subject,
            body
        FROM emails
        WHERE summary IS NULL
        LIMIT ?
    """, (limit,))

    emails = cursor.fetchall()

    conn.close()

    return emails


def get_all_emails():
    conn = get_connection()
    conn.row_factory = None

    cursor = conn.cursor()

    cursor.execute("""
        SELECT *
        FROM emails
        ORDER BY date DESC
    """)

    emails = cursor.fetchall()

    conn.close()

    return emails


def get_email_by_id(email_id):

    conn = get_connection()

    cursor = conn.cursor()

    cursor.execute(
        "SELECT * FROM emails WHERE gmail_id=? OR id=?",
        (email_id, email_id)
    )

    row = cursor.fetchone()

    conn.close()

    if not row:
        return None

    email = dict(row)
    if "gmail_id" in email and email.get("gmail_id"):
        email["id"] = email["gmail_id"]
    return email


def search_emails(question, limit=8):

    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    lowered = question.lower()
    words = lowered.split()

    account_email = None

    import re

    email_matches = re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", question)
    if email_matches:
        account_email = email_matches[0]
    else:
        account_rows = conn.execute("""
            SELECT email
            FROM gmail_accounts
            WHERE active=1
        """).fetchall()

        for row in account_rows:
            candidate = row["email"]
            candidate_root = candidate.split("@")[0].lower()
            if candidate_root and candidate_root in lowered:
                account_email = candidate
                break

    category = None
    if "internship" in lowered:
        category = "Internship"
    elif "job" in lowered:
        category = "Job"
    elif "promotion" in lowered:
        category = "Promotion"
    elif "other" in lowered:
        category = "Other"

    params = []

    if account_email or category:
        sql = "SELECT * FROM emails WHERE 1=1"

        if account_email:
            sql += " AND account_email=?"
            params.append(account_email)

        if category:
            sql += " AND category=?"
            params.append(category)

        sql += " ORDER BY date DESC LIMIT ?"
        params.append(limit)
        cursor.execute(sql, params)

    else:
        if not words:
            conn.close()
            return []

        where = []

        for word in words:

            pattern = f"%{word}%"

            where.append("""
                subject LIKE ?
                OR body LIKE ?
                OR summary LIKE ?
                OR category LIKE ?
                OR priority LIKE ?
            """)

            params.extend([
                pattern,
                pattern,
                pattern,
                pattern,
                pattern
            ])

        sql = f"""
            SELECT *
            FROM emails
            WHERE {' OR '.join(where)}
            ORDER BY date DESC
            LIMIT ?
        """

        params.append(limit)

        cursor.execute(sql, params)

    rows = cursor.fetchall()

    conn.close()

    return rows


def get_latest_email():

    conn = get_connection()

    conn.row_factory = sqlite3.Row

    cursor = conn.cursor()

    row = cursor.execute("""

        SELECT *

        FROM emails

        ORDER BY synced_at DESC

        LIMIT 1

    """).fetchone()

    conn.close()

    if row:

        email = dict(row)
        if email.get("gmail_id"):
            email["id"] = email["gmail_id"]
        return email

    return None
