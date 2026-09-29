import io
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import requests
from flask import Flask, jsonify, request, send_file, send_from_directory
from requests.adapters import HTTPAdapter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None)

REMOVE_BG_API_KEY = os.getenv("REMOVE_BG_API_KEY", "").strip()
REMOVE_BG_ENDPOINT = os.getenv("REMOVE_BG_ENDPOINT", "https://api.remove.bg/v1.0/removebg").strip()
REMOVE_BG_ACCOUNT_ENDPOINT = os.getenv("REMOVE_BG_ACCOUNT_ENDPOINT", "https://api.remove.bg/v1.0/account").strip()
MAX_UPLOAD_MB = min(22, int(os.getenv("MAX_UPLOAD_MB", "22")))
JOB_TTL_SECONDS = int(os.getenv("JOB_TTL_SECONDS", "1800"))
JOB_WORKERS = max(1, min(8, int(os.getenv("JOB_WORKERS", "4"))))
API_TIMEOUT_SECONDS = int(os.getenv("API_TIMEOUT_SECONDS", "90"))

app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

_jobs = {}
_jobs_lock = threading.RLock()
_executor = ThreadPoolExecutor(max_workers=JOB_WORKERS, thread_name_prefix="remove-bg-api")
_http = requests.Session()
_adapter = HTTPAdapter(pool_connections=16, pool_maxsize=32, max_retries=1)
_http.mount("https://", _adapter)
_http.mount("http://", _adapter)

ALLOWED_SIZES = {"auto", "preview"}
ALLOWED_TYPES = {"auto", "graphic", "person", "product", "animal", "car", "transportation"}


def static_file(name, mimetype=None):
    return send_from_directory(BASE_DIR, name, mimetype=mimetype)


def require_api_key():
    if not REMOVE_BG_API_KEY:
        raise RuntimeError("REMOVE_BG_API_KEY is not configured. Add it in Railway → Variables.")


def normalize_size(value):
    value = (value or "auto").strip().lower()
    return value if value in ALLOWED_SIZES else "auto"


def normalize_type(value):
    value = (value or "auto").strip().lower()
    return value if value in ALLOWED_TYPES else "auto"


def parse_api_error(resp):
    try:
        payload = resp.json()
        errors = payload.get("errors") or []
        titles = []
        for item in errors:
            if isinstance(item, dict):
                title = item.get("title") or item.get("detail") or item.get("code")
                if title:
                    titles.append(str(title))
        if titles:
            return " / ".join(titles)
    except Exception:
        pass
    text = (resp.text or "").strip()
    if text and len(text) < 500:
        return text
    return f"remove.bg API returned HTTP {resp.status_code}."


def response_metadata(resp):
    def h(name):
        return resp.headers.get(name)
    return {
        "detectedType": h("X-Type"),
        "width": int(h("X-Width")) if (h("X-Width") or "").isdigit() else None,
        "height": int(h("X-Height")) if (h("X-Height") or "").isdigit() else None,
        "creditsCharged": h("X-Credits-Charged"),
        "rateLimitRemaining": h("X-RateLimit-Remaining"),
        "rateLimitLimit": h("X-RateLimit-Limit"),
        "rateLimitReset": h("X-RateLimit-Reset"),
    }


def remove_file(raw, filename, mimetype, size, subject_type):
    require_api_key()
    resp = _http.post(
        REMOVE_BG_ENDPOINT,
        headers={"X-Api-Key": REMOVE_BG_API_KEY, "Accept": "image/png"},
        files={"image_file": (filename or "image.png", io.BytesIO(raw), mimetype or "application/octet-stream")},
        data={"size": size, "type": subject_type, "type_level": "2", "format": "png"},
        timeout=API_TIMEOUT_SECONDS,
    )
    if resp.status_code != 200:
        raise RuntimeError(parse_api_error(resp))
    return resp.content, response_metadata(resp)


def remove_url(url, size, subject_type):
    require_api_key()
    resp = _http.post(
        REMOVE_BG_ENDPOINT,
        headers={"X-Api-Key": REMOVE_BG_API_KEY, "Accept": "image/png"},
        data={"image_url": url, "size": size, "type": subject_type, "type_level": "2", "format": "png"},
        timeout=API_TIMEOUT_SECONDS,
    )
    if resp.status_code != 200:
        raise RuntimeError(parse_api_error(resp))
    return resp.content, response_metadata(resp)


def prune_jobs():
    cutoff = time.time() - JOB_TTL_SECONDS
    with _jobs_lock:
        for job_id in [k for k, v in _jobs.items() if v["createdAt"] < cutoff]:
            _jobs.pop(job_id, None)


def create_job(*, source, name, size, subject_type, raw=None, mimetype=None, url=None):
    prune_jobs()
    job_id = uuid.uuid4().hex
    job = {
        "id": job_id, "source": source, "name": name or "image.png",
        "size": normalize_size(size), "subjectType": normalize_type(subject_type),
        "createdAt": time.time(), "startedAt": None, "finishedAt": None,
        "status": "queued", "error": None, "raw": raw, "mimetype": mimetype,
        "url": url, "result": None, "meta": {},
    }
    with _jobs_lock:
        _jobs[job_id] = job
    _executor.submit(run_job, job_id)
    return job


def run_job(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job["status"] = "processing"
        job["startedAt"] = time.time()
        source, raw, mimetype, url = job["source"], job["raw"], job["mimetype"], job["url"]
        name, size, subject_type = job["name"], job["size"], job["subjectType"]
    try:
        if source == "url":
            result, meta = remove_url(url, size, subject_type)
        else:
            result, meta = remove_file(raw, name, mimetype, size, subject_type)
        with _jobs_lock:
            job = _jobs.get(job_id)
            if job:
                job["result"], job["meta"], job["status"], job["finishedAt"] = result, meta, "done", time.time()
    except Exception as exc:
        app.logger.exception("remove.bg job failed: %s", job_id)
        with _jobs_lock:
            job = _jobs.get(job_id)
            if job:
                job["status"], job["error"], job["finishedAt"] = "error", str(exc) or "Background removal failed.", time.time()


def public_job(job):
    now = time.time()
    started, finished = job["startedAt"], job["finishedAt"]
    return {
        "id": job["id"], "source": job["source"], "name": job["name"],
        "size": job["size"], "subjectType": job["subjectType"], "status": job["status"],
        "error": job["error"], "originalUrl": job["url"] if job["source"] == "url" else None,
        "queuedMs": int(((started or now) - job["createdAt"]) * 1000),
        "processingMs": int((((finished or now) - started) if started else 0) * 1000),
        **(job.get("meta") or {}),
    }


@app.get("/")
def home(): return static_file("index.html")
@app.get("/processing")
def processing_page(): return static_file("processing.html")
@app.get("/result")
def result_page(): return static_file("result.html")
@app.get("/samples")
def samples_page(): return static_file("samples.html")
@app.get("/style.css")
def style(): return static_file("style.css", "text/css")
@app.get("/common.js")
def common(): return static_file("common.js", "application/javascript")
@app.get("/home.js")
def home_js(): return static_file("home.js", "application/javascript")
@app.get("/processing.js")
def processing_js(): return static_file("processing.js", "application/javascript")
@app.get("/result.js")
def result_js(): return static_file("result.js", "application/javascript")
@app.get("/samples.js")
def samples_js(): return static_file("samples.js", "application/javascript")


@app.get("/health")
def health():
    return jsonify({"ok": True, "provider": "remove.bg", "apiConfigured": bool(REMOVE_BG_API_KEY)})


@app.get("/api/account")
def api_account():
    if not REMOVE_BG_API_KEY:
        return jsonify({"configured": False, "error": "API key not configured."}), 503
    try:
        resp = _http.get(REMOVE_BG_ACCOUNT_ENDPOINT, headers={"X-Api-Key": REMOVE_BG_API_KEY}, timeout=20)
        if resp.status_code != 200:
            return jsonify({"error": parse_api_error(resp)}), resp.status_code
        attrs = ((resp.json().get("data") or {}).get("attributes") or {})
        return jsonify({"configured": True, "credits": attrs.get("credits") or {}, "freeCalls": (attrs.get("api") or {}).get("free_calls")})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502


@app.post("/api/jobs")
def api_create_file_job():
    if not REMOVE_BG_API_KEY:
        return jsonify({"error": "REMOVE_BG_API_KEY is missing. Add it in Railway → Variables."}), 503
    uploaded = request.files.get("image")
    if uploaded is None:
        return jsonify({"error": "Please upload or paste an image."}), 400
    raw = uploaded.read()
    if not raw:
        return jsonify({"error": "The uploaded image is empty."}), 400
    job = create_job(
        source="file", name=uploaded.filename or "pasted-image.png", raw=raw,
        mimetype=uploaded.mimetype or "application/octet-stream",
        size=request.form.get("size", "auto"), subject_type=request.form.get("type", "auto"),
    )
    return jsonify(public_job(job)), 202


@app.post("/api/jobs-url")
def api_create_url_job():
    if not REMOVE_BG_API_KEY:
        return jsonify({"error": "REMOVE_BG_API_KEY is missing. Add it in Railway → Variables."}), 503
    payload = request.get_json(silent=True) or {}
    url = (payload.get("url") or "").strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        return jsonify({"error": "Please enter a valid http/https image URL."}), 400
    name = (url.split("?")[0].rstrip("/").split("/")[-1] or "url-image.jpg")[:180]
    job = create_job(source="url", name=name, url=url, size=payload.get("size", "auto"), subject_type=payload.get("type", "auto"))
    return jsonify(public_job(job)), 202


@app.get("/api/jobs/<job_id>")
def api_job(job_id):
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
    return send_file(io.BytesIO(result), mimetype="image/png", as_attachment=False, download_name="removed-background.png", max_age=0)


@app.get("/api/jobs/<job_id>/original")
def api_job_original(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return jsonify({"error": "This processing job has expired."}), 404
        if job["source"] != "file":
            return jsonify({"error": "Original is a remote URL."}), 400
        raw, mimetype = job["raw"], job["mimetype"] or "application/octet-stream"
    return send_file(io.BytesIO(raw), mimetype=mimetype, max_age=0)


@app.errorhandler(413)
def too_large(_):
    return jsonify({"error": f"Image is too large. remove.bg API supports files up to {MAX_UPLOAD_MB} MB."}), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")), threaded=True)
