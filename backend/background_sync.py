import threading
import time

from sync_emails import sync_all_accounts
from process_emails import process_new_emails
from email_repository import get_latest_email


def auto_sync(socketio):

    while True:

        try:

            print("\nChecking Gmail...")

            result = sync_all_accounts()

            print(
                f"Accounts: {result['accounts_synced']} | "
                f"New Emails: {result['new_saved']} | "
                f"Processed: {result['processed']}"
            )

            if result["new_saved"] > 0:

                analyzed = process_new_emails(
                    result["new_saved"]
                )

                latest = get_latest_email()

                socketio.emit(
                    "gmail_update",
                    {
                        "new_saved": result["new_saved"],
                        "email": latest
                    }
                )

            else:

                print("No new emails.")

        except Exception as e:

            print("Background Sync Error:", e)

        time.sleep(30)


def start_background_sync(socketio):

    thread = threading.Thread(
        target=auto_sync,
        args=(socketio,),
        daemon=True
    )

    thread.start()
