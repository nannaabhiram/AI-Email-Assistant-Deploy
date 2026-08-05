from flask import Flask, jsonify, request
from flask_socketio import SocketIO
from flask_cors import CORS
import sqlite3
from chatbot.chatbot import ask_database
from email_repository import get_email_by_id
from services.reply_service import generate_reply
from services.send_email_service import send_reply
from process_emails import process_new_emails
from login import login_bp
from openpyxl import Workbook
from reportlab.platypus import SimpleDocTemplate, Table
from flask import send_file
import io
from pathlib import Path

from database import create_tables
from authenticate import authenticate_gmail
from gmail_service import get_authenticated_email_from_creds
from sync_emails import sync_all_accounts

create_tables()

app = Flask(__name__)
CORS(app)
app.register_blueprint(login_bp)

socketio = SocketIO(
    app,
    cors_allowed_origins="*"
)

from background_sync import start_background_sync

DB_PATH = "../database/emails.db"
BASE_DIR = Path(__file__).resolve().parent.parent
TOKENS_DIR = BASE_DIR / "tokens"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.route("/")
def home():
    return jsonify({
        "message": "AI Email Assistant Backend Running"
    })


@app.route("/emails", methods=["GET"])
def get_emails():

    search = request.args.get("search", "")
    category = request.args.get("category", "")
    priority = request.args.get("priority", "")
    account = request.args.get("account", "")

    conn = get_connection()

    query = """
        SELECT
            COALESCE(gmail_id, id) AS id,
            account_email,
            sender,
            subject,
            summary,
            category,
            priority,
            deadline
        FROM emails
    """

    params = []

    clauses = []

    if account:
        clauses.append("account_email=?")
        params.append(account)

    if search:
        clauses.append("""
        (
            subject LIKE ?
            OR sender LIKE ?
            OR summary LIKE ?
        )""")
        keyword = f"%{search}%"
        params.extend([keyword, keyword, keyword])

    if category:
        clauses.append("category=?")
        params.append(category)

    if priority:
        clauses.append("priority=?")
        params.append(priority)

    if clauses:
        query += " WHERE " + " AND ".join(clauses)

    query += " ORDER BY date DESC"

    rows = conn.execute(query, params).fetchall()

    conn.close()

    return jsonify([dict(row) for row in rows])


@app.route("/emails/high-priority", methods=["GET"])
def high_priority():

    conn = get_connection()

    rows = conn.execute("""
        SELECT *
        FROM emails
        WHERE priority='High'
        ORDER BY date DESC
    """).fetchall()

    conn.close()

    return jsonify([dict(row) for row in rows])


@app.route("/emails/category/<category>", methods=["GET"])
def category(category):

    conn = get_connection()

    rows = conn.execute("""
        SELECT *
        FROM emails
        WHERE category=?
        ORDER BY date DESC
    """, (category,)).fetchall()

    conn.close()

    return jsonify([dict(row) for row in rows])


@app.route("/dashboard", methods=["GET"])
def dashboard():

    conn = get_connection()

    total = conn.execute("SELECT COUNT(*) FROM emails").fetchone()[0]

    high = conn.execute("SELECT COUNT(*) FROM emails WHERE priority='High'").fetchone()[0]

    internships = conn.execute(
        "SELECT COUNT(*) FROM emails WHERE category='Internship'"
    ).fetchone()[0]

    jobs = conn.execute("SELECT COUNT(*) FROM emails WHERE category='Job'").fetchone()[0]

    connected_accounts = conn.execute(
        "SELECT COUNT(*) FROM gmail_accounts WHERE active=1"
    ).fetchone()[0]

    accounts = conn.execute("""
        SELECT
            ga.id,
            ga.email AS account_email,
            COUNT(e.gmail_id) AS total
        FROM gmail_accounts ga
        LEFT JOIN emails e
            ON e.account_email = ga.email
        WHERE ga.active=1
        GROUP BY ga.id, ga.email
        ORDER BY ga.added_on
    """).fetchall()

    conn.close()

    return jsonify({
        "total_emails": total,
        "high_priority": high,
        "internships": internships,
        "jobs": jobs,
        "connected_accounts": connected_accounts,
        "accounts": [dict(i) for i in accounts]
    })


@app.route("/settings", methods=["GET"])
def get_settings():

    conn = get_connection()

    row = conn.execute(
        "SELECT * FROM settings WHERE id=1"
    ).fetchone()

    conn.close()

    return jsonify(dict(row))


@app.route("/settings", methods=["POST"])
def update_settings():

    data = request.json

    conn = get_connection()

    conn.execute("""

    UPDATE settings

    SET

    user_name=?,

    theme=?,

    show_analytics=?,

    show_categories=?,

    show_ai=?,

    show_deadlines=?

    WHERE id=1

    """,

    (

        data["user_name"],

        data["theme"],

        data.get("show_analytics", 1),

        data.get("show_categories", 1),

        data.get("show_ai", 1),

        data.get("show_deadlines", 1)

    ))

    conn.commit()

    conn.close()

    return jsonify({"success": True})


@app.route("/gmail/accounts")
def gmail_accounts():

    conn = get_connection()

    rows = conn.execute("""
    SELECT
        ga.id,
        ga.email,
        ga.token_file,
        ga.active,
        ga.added_on,
        COUNT(e.gmail_id) AS total_emails
    FROM gmail_accounts ga
    LEFT JOIN emails e
        ON e.account_email = ga.email
    GROUP BY ga.id, ga.email, ga.token_file, ga.active, ga.added_on
    ORDER BY ga.added_on

    """).fetchall()

    conn.close()

    return jsonify([dict(i) for i in rows])


@app.route("/gmail/remove/<int:id>", methods=["DELETE"])
def remove_account(id):

    conn = get_connection()

    row = conn.execute(
        "SELECT token_file FROM gmail_accounts WHERE id=?",
        (id,)
    ).fetchone()

    conn.execute(

    "DELETE FROM gmail_accounts WHERE id=?",

    (id,)

    )

    conn.commit()

    conn.close()

    if row and row["token_file"]:

        token_path = Path(row["token_file"])

        if not token_path.is_absolute():

            token_path = TOKENS_DIR / token_path

        if token_path.exists():

            token_path.unlink()

    return jsonify({"success": True})


@app.route("/gmail/add", methods=["POST"])
def add_account():

    TOKENS_DIR.mkdir(parents=True, exist_ok=True)

    creds = authenticate_gmail(force_new=True)

    email = get_authenticated_email_from_creds(creds)

    conn = get_connection()
    cursor = conn.cursor()

    existing = cursor.execute(
        "SELECT id FROM gmail_accounts WHERE email=?",
        (email,)
    ).fetchone()

    if existing:
        account_id = existing["id"]
    else:
        cursor.execute(
            "INSERT INTO gmail_accounts(email, token_file, active) VALUES(?, ?, 1)",
            (email, "")
        )
        account_id = cursor.lastrowid

    token_path = TOKENS_DIR / f"token_{account_id}.json"

    with open(token_path, "w") as token_file:
        token_file.write(creds.to_json())

    cursor.execute(
        "UPDATE gmail_accounts SET token_file=?, active=1 WHERE id=?",
        (f"tokens/{token_path.name}", account_id)
    )

    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "email": email,
        "token_file": token_path.name
    })


@app.route("/insights", methods=["GET"])
def insights():

    conn = get_connection()

    most_sender = conn.execute("""
        SELECT sender, COUNT(*) as total
        FROM emails
        GROUP BY sender
        ORDER BY total DESC
        LIMIT 1
    """).fetchone()

    most_category = conn.execute("""
        SELECT category, COUNT(*) as total
        FROM emails
        GROUP BY category
        ORDER BY total DESC
        LIMIT 1
    """).fetchone()

    high_priority = conn.execute("""
        SELECT COUNT(*)
        FROM emails
        WHERE priority='High'
    """).fetchone()[0]

    upcoming = conn.execute("""
        SELECT subject, deadline
        FROM emails
        WHERE deadline IS NOT NULL
        AND deadline!='None'
        ORDER BY deadline
        LIMIT 1
    """).fetchone()

    conn.close()

    return jsonify({
        "top_sender": most_sender["sender"] if most_sender else "N/A",
        "top_category": most_category["category"] if most_category else "N/A",
        "high_priority": high_priority,
        "next_deadline": dict(upcoming) if upcoming else None
    })


@app.route("/email/<email_id>", methods=["GET"])
def get_email(email_id):

    email = get_email_by_id(email_id)

    if not email:
        return jsonify({"success": False}), 404

    return jsonify({
        "success": True,
        "email": email
    })


@app.route("/chat", methods=["POST"])
def chat():

    try:

        data = request.get_json()

        question = data.get("question", "")

        answer = ask_database(question)

        return jsonify({
            "success": True,
            "question": question,
            "answer": answer
        })

    except Exception as e:

        return jsonify({
            "success": False,
            "answer": f"AI Error: {str(e)}"
        }), 200


@app.route("/ai/search", methods=["POST"])
def ai_search():

    data = request.get_json()

    question = data.get("question", "").lower()

    conn = get_connection()

    query = """
    SELECT
        account_email,
        sender,
        subject,
        category,
        priority,
        deadline
    FROM emails
    WHERE 1=1
    """

    params = []

    if "internship" in question:
        query += " AND category='Internship'"

    elif "job" in question:
        query += " AND category='Job'"

    elif "high" in question:
        query += " AND priority='High'"

    accounts = conn.execute(
        "SELECT email FROM gmail_accounts"
    ).fetchall()

    for acc in accounts:

        if acc["email"].lower() in question:

            query += " AND account_email=?"

            params.append(acc["email"])

    rows = conn.execute(query, params).fetchall()

    conn.close()

    return jsonify([dict(i) for i in rows])


@app.route("/reply", methods=["POST"])
def reply():

    data = request.get_json()

    body = data["body"]

    tone = data.get("tone", "Professional")

    reply = generate_reply(
        body,
        tone
    )

    return jsonify({

        "reply": reply

    })


@app.route("/send-reply", methods=["POST"])
def send_reply_api():

    data = request.get_json()

    send_reply(

        data["to"],

        data["subject"],

        data["body"]

    )

    return jsonify({

        "success": True,

        "message": "Reply Sent Successfully."

    })


@app.route("/sync", methods=["POST"])
def sync():

    try:

        sync_result = sync_all_accounts()

        analyzed = process_new_emails(sync_result["new_saved"])

        return jsonify({

            "success": True,

            "processed": sync_result["processed"],

            "new_saved": sync_result["new_saved"],

            "accounts_synced": sync_result["accounts_synced"],

            "analyzed": analyzed,

            "message": "Synchronization completed."

        })

    except Exception as e:

        return jsonify({

            "success": False,

            "message": str(e)

        }), 500


@app.route("/export/excel")
def export_excel():

    conn = get_connection()

    rows = conn.execute("""
        SELECT subject,sender,category,priority,deadline
        FROM emails
    """).fetchall()

    conn.close()

    wb = Workbook()
    ws = wb.active
    ws.title = "Emails"

    ws.append([
        "Subject",
        "Sender",
        "Category",
        "Priority",
        "Deadline"
    ])

    for row in rows:
        ws.append([
            row["subject"],
            row["sender"],
            row["category"],
            row["priority"],
            row["deadline"]
        ])

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return send_file(
        output,
        as_attachment=True,
        download_name="emails.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@app.route("/export/pdf")
def export_pdf():

    conn = get_connection()

    rows = conn.execute("""
        SELECT subject,category,priority
        FROM emails
    """).fetchall()

    conn.close()

    output = io.BytesIO()

    pdf = SimpleDocTemplate(output)

    data = [["Subject", "Category", "Priority"]]

    for row in rows:
        data.append([
            row["subject"],
            row["category"],
            row["priority"]
        ])

    table = Table(data)

    pdf.build([table])

    output.seek(0)

    return send_file(
        output,
        as_attachment=True,
        download_name="emails.pdf",
        mimetype="application/pdf"
    )


if __name__ == "__main__":

    start_background_sync(socketio)

    socketio.run(
        app,
        debug=True
    )
