from gmail_service import get_service, get_email_body, html_to_text
from email_repository import save_email
from database import get_connection


def get_all_accounts():

    conn = get_connection()

    rows = conn.execute("""
        SELECT *
        FROM gmail_accounts
        WHERE active=1
        ORDER BY added_on
    """).fetchall()

    conn.close()

    return [dict(row) for row in rows]


def process_email(service, gmail_id, account_email):

    email = service.users().messages().get(
        userId="me",
        id=gmail_id,
        format="full",
        metadataHeaders=["From", "Subject", "Date"]
    ).execute()

    body = get_email_body(email)
    clean_body = html_to_text(body)

    thread_id = email["threadId"]
    snippet = email["snippet"]
    labels = email.get("labelIds", [])

    sender = ""
    subject = ""
    date = ""

    headers = email["payload"]["headers"]

    for header in headers:

        if header["name"] == "From":
            sender = header["value"]

        elif header["name"] == "Subject":
            subject = header["value"]

        elif header["name"] == "Date":
            date = header["value"]

    return save_email(
        gmail_id,
        account_email,
        thread_id,
        sender,
        subject,
        snippet,
        clean_body,
        date,
        ",".join(labels),
        0 if "UNREAD" in labels else 1
    )


def sync_account(account, max_results=20):

    token_path = account["token_file"]

    service = get_service(token_path)

    results = service.users().messages().list(
        userId="me",
        maxResults=max_results
    ).execute()

    messages = results.get("messages", [])

    processed = 0
    new_saved = 0

    for msg in messages:

        try:

            inserted = process_email(
                service,
                msg["id"],
                account["email"]
            )

            processed += 1

            if inserted:
                new_saved += 1

        except Exception as e:
            print(e)
            continue

    return {
        "processed": processed,
        "new_saved": new_saved
    }


def sync_all_accounts(max_results=10):

    accounts = get_all_accounts()

    if not accounts:
        return {"processed": 0, "new_saved": 0, "accounts_synced": 0}

    processed = 0
    new_saved = 0

    for account in accounts:

        result = sync_account(account, max_results)

        processed += result["processed"]
        new_saved += result["new_saved"]

    return {
        "processed": processed,
        "new_saved": new_saved,
        "accounts_synced": len(accounts)
    }


if __name__ == "__main__":

    result = sync_all_accounts()

    print(result)
