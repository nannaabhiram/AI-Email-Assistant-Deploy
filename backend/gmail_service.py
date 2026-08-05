from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from bs4 import BeautifulSoup
import base64
import re
from pathlib import Path

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send"
]

BASE_DIR = Path(__file__).resolve().parent.parent
TOKENS_DIR = BASE_DIR / "tokens"


def resolve_token_path(token_file=None):

    if token_file:
        token_path = Path(token_file)
    else:
        token_path = TOKENS_DIR / "token_1.json"

    if not token_path.is_absolute():
        # If the token_file already includes "tokens/" prefix, don't add it again
        if "tokens" in token_path.parts:
            token_path = BASE_DIR / token_path
        else:
            token_path = TOKENS_DIR / token_path.name

    return token_path


def get_service(token_file=None):
    """
    Creates and returns an authenticated Gmail service.
    """

    token_path = resolve_token_path(token_file)

    print(f"Using Token: {token_path}")

    creds = Credentials.from_authorized_user_file(
        str(token_path),
        SCOPES
    )

    service = build(
        "gmail",
        "v1",
        credentials=creds
    )

    return service


def get_authenticated_email_from_creds(creds):

    service = build(
        "gmail",
        "v1",
        credentials=creds
    )

    profile = service.users().getProfile(userId="me").execute()

    return profile.get("emailAddress", "")


def get_recent_emails(max_results=10, token_file=None):
    """
    Fetches recent emails from Gmail.
    Returns the list of message IDs.
    """

    service = get_service(token_file)

    results = service.users().messages().list(
        userId="me",
        maxResults=max_results
    ).execute()

    messages = results.get("messages", [])

    return messages


def get_email_details(message_id, token_file=None):
    """
    Fetch complete details of one email.
    """

    service = get_service(token_file)

    email = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full",
        metadataHeaders=[
            "From",
            "Subject",
            "Date"
        ]
    ).execute()

    return email

def get_email_body(email):
    """
    Extract the email body from the Gmail API response.
    """

    payload = email["payload"]

    # Case 1: Simple email
    if payload.get("body", {}).get("data"):

        data = payload["body"]["data"]

        decoded = base64.urlsafe_b64decode(
            data + "=" * (-len(data) % 4)
        )

        return decoded.decode("utf-8", errors="ignore")

    # Case 2: Multipart email
    if "parts" in payload:

        for part in payload["parts"]:

            # HTML
            if part["mimeType"] == "text/html":

                data = part["body"].get("data")

                if data:

                    decoded = base64.urlsafe_b64decode(
                        data + "=" * (-len(data) % 4)
                    )

                    return decoded.decode("utf-8", errors="ignore")

            # Plain Text
            if part["mimeType"] == "text/plain":

                data = part["body"].get("data")

                if data:

                    decoded = base64.urlsafe_b64decode(
                        data + "=" * (-len(data) % 4)
                    )

                    return decoded.decode("utf-8", errors="ignore")

            # Nested multipart
            if "parts" in part:

                for subpart in part["parts"]:

                    if subpart["mimeType"] in ["text/html", "text/plain"]:

                        data = subpart["body"].get("data")

                        if data:

                            decoded = base64.urlsafe_b64decode(
                                data + "=" * (-len(data) % 4)
                            )

                            return decoded.decode("utf-8", errors="ignore")

    return ""


def html_to_text(html):

    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style", "noscript", "svg", "img", "meta", "head"]):
        tag.decompose()

    text = soup.get_text(separator="\n")

    text = re.sub(r"https?://\S+", "", text)

    text = re.sub(r"www\.\S+", "", text)

    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if len(line) > 2]

    return "\n".join(lines)
