from flask import Blueprint, request, jsonify

login_bp = Blueprint("login", __name__)

USERNAME = "abhiram25"
PASSWORD = "Abhiram@25"


@login_bp.route("/login", methods=["POST"])
def login():

    data = request.get_json()

    username = data.get("username", "")
    password = data.get("password", "")

    if username == USERNAME and password == PASSWORD:

        return jsonify({
            "success": True
        })

    return jsonify({
        "success": False,
        "message": "Invalid username or password."
    }), 401