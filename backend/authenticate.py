from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from pathlib import Path

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send"
]

BASE_DIR = Path(__file__).resolve().parent.parent
CREDENTIALS_PATH = BASE_DIR / "credentials" / "credentials.json"
DEFAULT_TOKEN_PATH = BASE_DIR / "credentials" / "token.json"


def authenticate_gmail(token_path=None, force_new=False):
    resolved_token_path = Path(token_path) if token_path else DEFAULT_TOKEN_PATH
    if not resolved_token_path.is_absolute():
        resolved_token_path = BASE_DIR / resolved_token_path

    creds = None

    if resolved_token_path.exists() and not force_new:
        creds = Credentials.from_authorized_user_file(
            str(resolved_token_path),
            SCOPES
        )

    if not creds or not creds.valid:

        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                str(CREDENTIALS_PATH),
                SCOPES
            )

            creds = flow.run_local_server(port=0)

    return creds


if __name__ == "__main__":
    creds = authenticate_gmail(DEFAULT_TOKEN_PATH)

    DEFAULT_TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)

    with open(DEFAULT_TOKEN_PATH, "w") as token:
        token.write(creds.to_json())

    print("✅ Authentication Successful!")
