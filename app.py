from flask import Flask, render_template, request, jsonify
import secrets
import string

app = Flask(__name__)

SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?/"


def _as_nonneg_int(value, field_name):
    """
    Convert to a non-negative int; raise ValueError with a friendly message.
    """
    try:
        iv = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{field_name}' must be an integer.")
    if iv < 0:
        raise ValueError(f"'{field_name}' must be a non-negative integer.")
    return iv


def validate_payload(data):
    """
    Validate incoming JSON payload and return normalized values.
    Expected:
      strength: easy|medium|hard (optional but recommended)
      total_length, uppercase_count, lowercase_count, digit_count: ints
    """
    if not isinstance(data, dict):
        raise ValueError("Invalid request body. Please send JSON.")

    strength = (data.get("strength") or "medium").strip().lower()
    if strength not in ("easy", "medium", "hard"):
        raise ValueError("Strength must be one of: easy, medium, hard.")

    total_length = _as_nonneg_int(
        data.get("total_length"), "Total number of characters")
    uppercase_count = _as_nonneg_int(
        data.get("uppercase_count"), "Number of uppercase letters")
    lowercase_count = _as_nonneg_int(
        data.get("lowercase_count"), "Number of lowercase letters")
    digit_count = _as_nonneg_int(data.get("digit_count"), "Number of digits")
    special_count = _as_nonneg_int(
        data.get("special_count", 0), "Number of special characters")

    if total_length == 0:
        raise ValueError("Total number of characters must be greater than 0.")

    if uppercase_count > total_length:
        raise ValueError("Uppercase letter count cannot exceed total length.")
    if lowercase_count > total_length:
        raise ValueError("Lowercase letter count cannot exceed total length.")
    if digit_count > total_length:
        raise ValueError("Digit count cannot exceed total length.")
    if special_count > total_length:
        raise ValueError("Special character count cannot exceed total length.")

    if uppercase_count + lowercase_count + digit_count + special_count > total_length:
        raise ValueError(
            "The sum of uppercase + lowercase + digits + special cannot exceed total length.")

    return strength, total_length, uppercase_count, lowercase_count, digit_count, special_count


def generate_password(strength, total_length, uppercase_count, lowercase_count, digit_count, special_count=0):
    """
    Generate a password using cryptographically secure randomness.
    The remaining characters (if any) are filled using sets based on strength.
    """
    rng = secrets.SystemRandom()

    chars = []

    # Add exact required counts
    for _ in range(uppercase_count):
        chars.append(secrets.choice(string.ascii_uppercase))
    for _ in range(lowercase_count):
        chars.append(secrets.choice(string.ascii_lowercase))
    for _ in range(digit_count):
        chars.append(secrets.choice(string.digits))
    for _ in range(special_count):
        chars.append(secrets.choice(SYMBOLS))

    remaining = total_length - len(chars)

    if remaining > 0:
        if strength == "easy":
            pool = string.ascii_lowercase + string.digits
        elif strength == "medium":
            pool = string.ascii_lowercase + string.ascii_uppercase + string.digits
        else:  # hard
            pool = string.ascii_lowercase + string.ascii_uppercase + string.digits + SYMBOLS

        for _ in range(remaining):
            chars.append(secrets.choice(pool))

    rng.shuffle(chars)
    return "".join(chars)


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/generate-password")
def api_generate_password():
    try:
        data = request.get_json(silent=True)
        strength, total_length, uc, lc, dc, sc = validate_payload(data)
        password = generate_password(strength, total_length, uc, lc, dc, sc)
        return jsonify({"password": password})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        # Keep errors friendly for local use
        return jsonify({"error": "Something went wrong while forging your password. Please try again."}), 400


if __name__ == "__main__":
    # Local-only friendly defaults
    app.run(host="127.0.0.1", port=5000, debug=True)
