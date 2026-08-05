import base64
import re

from email.mime.text import MIMEText

from gmail_service import get_service


def send_reply(to, subject, body):

    service = get_service()

    message = MIMEText(body)

    match = re.search(r"<(.+?)>", to)

    if match:
        to = match.group(1)

    message["to"] = to

    message["subject"] = "Re: " + subject

    raw = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode()

    service.users().messages().send(

        userId="me",

        body={

            "raw": raw

        }

    ).execute()

    return True
