import io
import ipaddress
import os
import socket
import threading
from urllib.parse import urljoin, urlparse

import requests
from flask import Flask, jsonify, request, send_file, send_from_directory
from PIL import Image, ImageOps, UnidentifiedImageError
from rembg import new_session, remove

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None)

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))
MAX_PIXELS = int(os.getenv("MAX_PIXELS", "60000000"))
MODEL = os.getenv("REMBG_MODEL", "birefnet-general")
URL_TIMEOUT = int(os.getenv("URL_TIMEOUT", "20"))

app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

_session = None
_session_lock = threading.Lock()
_infer_lock = threading.Lock()


def get_session():
    global _session
    if _session is None:
        with _session_lock:
            if _session is None:
                app.logger.info("Loading rembg model: %s", MODEL)
                _session = new_session(MODEL)
    return _session


def _validate_remote_url(url: str) -> str:
    if not isinstance(url, str) or not url.strip():
        raise ValueError("Please enter an image URL.")
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only http/https image URLs are supported.")
    host = parsed.hostname
    if host.lower() in {"localhost", "localhost.localdomain"}:
        raise ValueError("This URL is not allowed.")
    try:
        infos = socket.getaddrinfo(
            host,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as exc:
        raise ValueError("The image host could not be resolved.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError("This URL is not allowed.")
    return url


def fetch_remote_image(url: str) -> bytes:
    current = _validate_remote_url(url)
    headers = {
        "User-Agent": "Mozilla/5.0 RemoveBG-SelfHosted/2.0",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    for _ in range(4):
        with requests.get(
            current,
            headers=headers,
            stream=True,
            timeout=URL_TIMEOUT,
            allow_redirects=False,
        ) as resp:
            if 300 <= resp.status_code < 400 and resp.headers.get("Location"):
                current = _validate_remote_url(urljoin(current, resp.headers["Location"]))
                continue
            resp.raise_for_status()
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if ctype and not ctype.startswith("image/"):
                raise ValueError("The URL does not point to an image.")
            limit = MAX_UPLOAD_MB * 1024 * 1024
            buf = bytearray()
            for chunk in resp.iter_content(1024 * 128):
                if not chunk:
                    continue
                buf.extend(chunk)
                if len(buf) > limit:
                    raise ValueError(f"Image is larger than {MAX_UPLOAD_MB} MB.")
            return bytes(buf)
    raise ValueError("Too many redirects while fetching the image.")


def normalize_image(raw: bytes) -> Image.Image:
    if not raw:
        raise ValueError("The image is empty.")
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(raw)) as image:
            image = ImageOps.exif_transpose(image)
            if image.width * image.height > MAX_PIXELS:
                raise ValueError(
                    f"Image is too large. Maximum is {MAX_PIXELS:,} pixels."
                )
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert(
                    "RGBA" if "transparency" in image.info else "RGB"
                )
            return image.copy()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Unsupported or damaged image file.") from exc


def remove_background(raw: bytes) -> bytes:
    image = normalize_image(raw)
    session = get_session()
    # One warmed full-quality session. Serial inference avoids CPU/RAM spikes on Railway,
    # while the browser queue stays fully non-blocking and accepts new pasted images.
    with _infer_lock:
        output = remove(
            image,
            session=session,
            decontaminate=True,
            post_process_mask=False,
        )
    out = io.BytesIO()
    # Low compression is much faster than optimize=True and keeps the RGBA result lossless.
    output.save(out, format="PNG", optimize=False, compress_level=1)
    return out.getvalue()


def static_file(name, mimetype=None):
    return send_from_directory(BASE_DIR, name, mimetype=mimetype)


@app.get("/")
def index():
    return static_file("index.html")


@app.get("/result")
def result_page():
    return static_file("result.html")


@app.get("/samples")
def samples_page():
    return static_file("samples.html")


@app.get("/style.css")
def styles():
    return static_file("style.css", "text/css")


@app.get("/common.js")
def common_script():
    return static_file("common.js", "application/javascript")


@app.get("/home.js")
def home_script():
    return static_file("home.js", "application/javascript")


@app.get("/result.js")
def result_script():
    return static_file("result.js", "application/javascript")


@app.get("/samples.js")
def samples_script():
    return static_file("samples.js", "application/javascript")


@app.get("/health")
def health():
    return jsonify({"ok": True, "model": MODEL, "modelReady": _session is not None})


@app.post("/api/remove")
def api_remove():
    uploaded = request.files.get("image")
    if uploaded is None:
        return jsonify({"error": "Please upload or paste an image."}), 400
    try:
        result = remove_background(uploaded.read())
        return send_file(
            io.BytesIO(result),
            mimetype="image/png",
            as_attachment=False,
            download_name="removed-background.png",
            max_age=0,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("Background removal failed")
        return jsonify({"error": "Background removal failed. Please try another image."}), 500


@app.post("/api/remove-url")
def api_remove_url():
    payload = request.get_json(silent=True) or {}
    try:
        raw = fetch_remote_image(payload.get("url", ""))
        result = remove_background(raw)
        return send_file(
            io.BytesIO(result),
            mimetype="image/png",
            as_attachment=False,
            download_name="removed-background.png",
            max_age=0,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except requests.RequestException:
        return jsonify({"error": "Could not download that image URL."}), 400
    except Exception:
        app.logger.exception("URL background removal failed")
        return jsonify({"error": "Background removal failed. Please try another image."}), 500


@app.errorhandler(413)
def too_large(_):
    return jsonify(
        {"error": f"Image is too large. Maximum upload is {MAX_UPLOAD_MB} MB."}
    ), 413


# Warm the model when the Railway service starts, not when the first customer image arrives.
# If loading fails, the request path retries lazily and Railway logs the actual reason.
try:
    get_session()
except Exception:
    app.logger.exception("Model warm-up failed; first request will retry")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
