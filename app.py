import io
import ipaddress
import os
import socket
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse

import requests
from flask import Flask, jsonify, request, send_file, send_from_directory
from PIL import Image, ImageOps, UnidentifiedImageError
from rembg import new_session, remove

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None)

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))
MAX_PIXELS = int(os.getenv("MAX_PIXELS", "60000000"))
FAST_MODEL = os.getenv("FAST_MODEL", "birefnet-general-lite")
HD_MODEL = os.getenv("HD_MODEL", "birefnet-general")
URL_TIMEOUT = int(os.getenv("URL_TIMEOUT", "20"))
JOB_TTL_SECONDS = int(os.getenv("JOB_TTL_SECONDS", "1800"))
JOB_WORKERS = max(1, int(os.getenv("JOB_WORKERS", "1")))
WARM_MODEL = os.getenv("WARM_MODEL", "1") == "1"

app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

_executor = ThreadPoolExecutor(max_workers=JOB_WORKERS, thread_name_prefix="remove-bg")
_jobs = {}
_jobs_lock = threading.RLock()
_sessions = {}
_session_locks = {"fast": threading.Lock(), "hd": threading.Lock()}
_infer_locks = {"fast": threading.Lock(), "hd": threading.Lock()}


def static_file(name, mimetype=None):
    return send_from_directory(BASE_DIR, name, mimetype=mimetype)


def model_for(mode: str) -> str:
    return HD_MODEL if mode == "hd" else FAST_MODEL


def get_session(mode: str):
    mode = "hd" if mode == "hd" else "fast"
    if mode not in _sessions:
        with _session_locks[mode]:
            if mode not in _sessions:
                model = model_for(mode)
                app.logger.info("Loading rembg model: %s (%s)", model, mode)
                _sessions[mode] = new_session(model)
    return _sessions[mode]


def normalize_image(raw: bytes) -> Image.Image:
    if not raw:
        raise ValueError("The image is empty.")
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(raw)) as image:
            image = ImageOps.exif_transpose(image)
            if image.width * image.height > MAX_PIXELS:
                raise ValueError(f"Image is too large. Maximum is {MAX_PIXELS:,} pixels.")
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "transparency" in image.info else "RGB")
            return image.copy()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Unsupported or damaged image file.") from exc


def remove_background(raw: bytes, mode: str) -> bytes:
    image = normalize_image(raw)
    session = get_session(mode)
    mode = "hd" if mode == "hd" else "fast"

    # Do NOT binary-threshold the mask: soft alpha keeps text glow, hair and soft edges.
    # Decontamination is useful on HD; Fast skips it for lower latency and color fidelity.
    with _infer_locks[mode]:
        output = remove(
            image,
            session=session,
            decontaminate=(mode == "hd"),
            post_process_mask=False,
        )

    out = io.BytesIO()
    output.save(out, format="PNG", optimize=False, compress_level=1)
    return out.getvalue()


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
        "User-Agent": "Mozilla/5.0 RemoveBG-SelfHosted/3.0",
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
            for chunk in resp.iter_content(128 * 1024):
                if not chunk:
                    continue
                buf.extend(chunk)
                if len(buf) > limit:
                    raise ValueError(f"Image is larger than {MAX_UPLOAD_MB} MB.")
            return bytes(buf)

    raise ValueError("Too many redirects while fetching the image.")


def prune_jobs():
    cutoff = time.time() - JOB_TTL_SECONDS
    with _jobs_lock:
        stale = [job_id for job_id, job in _jobs.items() if job["created_at"] < cutoff]
        for job_id in stale:
            _jobs.pop(job_id, None)


def create_job(raw: bytes, name: str, mode: str):
    prune_jobs()
    mode = "hd" if mode == "hd" else "fast"
    job_id = uuid.uuid4().hex
    job = {
        "id": job_id,
        "name": name or "image.png",
        "mode": mode,
        "status": "queued",
        "created_at": time.time(),
        "started_at": None,
        "finished_at": None,
        "original": raw,
        "result": None,
        "error": None,
    }
    with _jobs_lock:
        _jobs[job_id] = job
    _executor.submit(run_job, job_id)
    return job


def run_job(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job["status"] = "processing"
        job["started_at"] = time.time()
        raw = job["original"]
        mode = job["mode"]

    try:
        result = remove_background(raw, mode)
        with _jobs_lock:
            job = _jobs.get(job_id)
            if job:
                job["result"] = result
                job["status"] = "done"
                job["finished_at"] = time.time()
    except Exception as exc:
        app.logger.exception("Background removal failed for job %s", job_id)
        with _jobs_lock:
            job = _jobs.get(job_id)
            if job:
                job["status"] = "error"
                job["error"] = str(exc) or "Background removal failed."
                job["finished_at"] = time.time()


def public_job(job):
    now = time.time()
    created = job["created_at"]
    started = job["started_at"]
    finished = job["finished_at"]
    return {
        "id": job["id"],
        "name": job["name"],
        "mode": job["mode"],
        "status": job["status"],
        "error": job["error"],
        "queuedMs": int(((started or now) - created) * 1000),
        "processingMs": int((((finished or now) - started) if started else 0) * 1000),
    }


@app.get("/")
def home_page():
    return static_file("index.html")


@app.get("/processing")
def processing_page():
    return static_file("processing.html")


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


@app.get("/processing.js")
def processing_script():
    return static_file("processing.js", "application/javascript")


@app.get("/result.js")
def result_script():
    return static_file("result.js", "application/javascript")


@app.get("/samples.js")
def samples_script():
    return static_file("samples.js", "application/javascript")


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "fastModel": FAST_MODEL,
            "fastReady": "fast" in _sessions,
            "hdModel": HD_MODEL,
            "hdReady": "hd" in _sessions,
        }
    )


@app.post("/api/jobs")
def api_create_job():
    uploaded = request.files.get("image")
    if uploaded is None:
        return jsonify({"error": "Please upload or paste an image."}), 400

    mode = request.form.get("mode", "fast")
    raw = uploaded.read()
    if not raw:
        return jsonify({"error": "The uploaded image is empty."}), 400

    name = uploaded.filename or "pasted-image.png"
    job = create_job(raw, name, mode)
    return jsonify(public_job(job)), 202


@app.post("/api/jobs-url")
def api_create_url_job():
    payload = request.get_json(silent=True) or {}
    mode = payload.get("mode", "fast")
    try:
        raw = fetch_remote_image(payload.get("url", ""))
        parsed = urlparse(payload.get("url", ""))
        name = os.path.basename(parsed.path) or "url-image.jpg"
        job = create_job(raw, name, mode)
        return jsonify(public_job(job)), 202
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except requests.RequestException:
        return jsonify({"error": "Could not download that image URL."}), 400


@app.get("/api/jobs/<job_id>")
def api_job_status(job_id):
    prune_jobs()
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return jsonify({"error": "This processing job has expired."}), 404
        return jsonify(public_job(job))


@app.get("/api/jobs/<job_id>/result")
def api_job_result(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return jsonify({"error": "This processing job has expired."}), 404
        if job["status"] != "done" or not job["result"]:
            return jsonify({"error": "Result is not ready yet."}), 409
        result = job["result"]

    return send_file(
        io.BytesIO(result),
        mimetype="image/png",
        as_attachment=False,
        download_name="removed-background.png",
        max_age=0,
    )


@app.get("/api/jobs/<job_id>/original")
def api_job_original(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return jsonify({"error": "This processing job has expired."}), 404
        raw = job["original"]

    # Let the browser sniff common image formats; this endpoint is only for the user's own upload.
    return send_file(io.BytesIO(raw), mimetype="application/octet-stream", max_age=0)


@app.errorhandler(413)
def too_large(_):
    return jsonify({"error": f"Image is too large. Maximum upload is {MAX_UPLOAD_MB} MB."}), 413


def warm_fast_model():
    try:
        get_session("fast")
        app.logger.info("Fast model is ready")
    except Exception:
        app.logger.exception("Fast model warm-up failed; first job will retry")


if WARM_MODEL:
    threading.Thread(target=warm_fast_model, daemon=True, name="model-warmup").start()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, threaded=True)
