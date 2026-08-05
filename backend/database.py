import sqlite3
from pathlib import Path

# Project root directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Database directory
DATABASE_DIR = BASE_DIR / "database"

# Create the database directory if it doesn't exist
DATABASE_DIR.mkdir(exist_ok=True)

# Database file
DATABASE = DATABASE_DIR / "emails.db"


def get_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def create_tables():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        gmail_id TEXT,
        account_email TEXT,
        thread_id TEXT,
        sender TEXT,
        subject TEXT,
        snippet TEXT,
        body TEXT,
        date TEXT,
        labels TEXT,
        category TEXT,
        priority TEXT,
        summary TEXT,
        deadline TEXT,
        is_read INTEGER,
        synced_at TEXT
    )
    """)

    for column_name in ["gmail_id", "account_email"]:
        try:
            cursor.execute(f"ALTER TABLE emails ADD COLUMN {column_name} TEXT")
        except sqlite3.OperationalError as exc:
            if "duplicate column name" not in str(exc).lower():
                raise

    cursor.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_gmail_id
    ON emails(gmail_id)
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings(

        id INTEGER PRIMARY KEY,

        user_name TEXT DEFAULT 'Abhiram',

        theme TEXT DEFAULT 'dark',

        show_analytics INTEGER DEFAULT 1,

        show_categories INTEGER DEFAULT 1,

        show_ai INTEGER DEFAULT 1,

        show_deadlines INTEGER DEFAULT 1

    )
    """)

    cursor.execute("""
    INSERT OR IGNORE INTO settings(
        id
    )
    VALUES(1)
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gmail_accounts(

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        email TEXT UNIQUE,

        token_file TEXT,

        active INTEGER DEFAULT 1,

        added_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    )
    """)

    conn.commit()
    conn.close()

    print(f"✅ Database Ready! ({DATABASE})")
