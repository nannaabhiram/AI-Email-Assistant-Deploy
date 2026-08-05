from email_repository import (
    get_unprocessed_emails,
    update_email_analysis
)

from services.ai_service import analyze_email


def process_new_emails(max_emails=5):

    emails = get_unprocessed_emails(max_emails)

    processed = 0

    for email in emails:

        gmail_id = email[0]
        account_email = email[1]
        subject = email[2]
        body = email[3]

        try:

            result = analyze_email(body)

            update_email_analysis(

                gmail_id,
                account_email,

                result["summary"],

                result["category"],

                result["priority"],

                result["deadline"],

                result["recommended_action"],

                result["reason"],

                result["confidence"]

            )

            processed += 1

        except Exception as e:

            print(e)

    return processed


if __name__ == "__main__":

    total = process_new_emails()

    print(f"Processed {total} email(s)")
