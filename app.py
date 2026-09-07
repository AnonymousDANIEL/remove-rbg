import io
import os
from flask import Flask, jsonify, render_template, request, send_file
from PIL import Image, UnidentifiedImageError
from rembg import new_session, remove

app = Flask(__name__)

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
MAX_PIXELS = int(os.getenv("MAX_PIXELS", "30000000"))
MODEL = os.getenv("REMBG_MODEL", "u2net")

app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

# Load once and reuse for much faster repeat requests.
SESSION = new_session(MODEL)


@app.get("/")
def index():
    return render_template(
        "index.html",
        max_upload_mb=MAX_UPLOAD_MB,
        model=MODEL,
    )


@app.get("/health")
def health():
    return jsonify({"ok": True, "model": MODEL})


@app.post("/api/remove")
def remove_background():
    uploaded = request.files.get("image")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Please upload or paste an image."}), 400

    raw = uploaded.read()
    if not raw:
        return jsonify({"error": "The image is empty."}), 400

    try:
        # Validate that the payload is actually an image before inference.
        with Image.open(io.BytesIO(raw)) as img:
            img.verify()

        with Image.open(io.BytesIO(raw)) as img:
            width, height = img.size
            if width * height > MAX_PIXELS:
                return jsonify({"error": "Image resolution is too large."}), 413
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        return jsonify({"error": "Unsupported or invalid image file."}), 400

    try:
        output = remove(raw, session=SESSION, force_return_bytes=True)
        return send_file(
            io.BytesIO(output),
            mimetype="image/png",
            as_attachment=False,
            download_name="removed-background.png",
            max_age=0,
        )
    except Exception as exc:
        app.logger.exception("Background removal failed")
        return jsonify({"error": f"Background removal failed: {exc}"}), 500


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": f"File is too large. Maximum {MAX_UPLOAD_MB} MB."}), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")), debug=False)
