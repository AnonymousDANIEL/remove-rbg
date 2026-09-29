import io
import ipaddress
import os
import socket
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse

import numpy as np
import requests
from flask import Flask, Response, jsonify, request, send_file, send_from_directory, redirect
from PIL import Image, ImageOps, UnidentifiedImageError
from rembg import new_session, remove

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None)

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
MAX_PIXELS = int(os.getenv("MAX_PIXELS", "50000000"))
JOB_TTL = int(os.getenv("JOB_TTL_SECONDS", "1800"))
URL_TIMEOUT = int(os.getenv("URL_TIMEOUT", "20"))

FAST_MODEL = os.getenv("FAST_MODEL", "u2netp")
HD_MODEL = os.getenv("HD_MODEL", "birefnet-general-lite")

app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

jobs = {}
jobs_lock = threading.RLock()
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="bg-worker")
sessions = {}
session_locks = {"fast": threading.Lock(), "hd": threading.Lock()}
infer_lock = threading.Lock()


def static(name, mimetype=None):
    return send_from_directory(BASE_DIR, name, mimetype=mimetype)


def normalize_image(raw):
    if not raw:
        raise ValueError("Image is empty.")
    try:
        with Image.open(io.BytesIO(raw)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(raw)) as im:
            im = ImageOps.exif_transpose(im)
            if im.width * im.height > MAX_PIXELS:
                raise ValueError("Image is too large.")
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "transparency" in im.info else "RGB")
            return im.copy()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Unsupported or damaged image.") from exc


def get_session(quality):
    quality = "fast" if quality == "fast" else "hd"
    if quality not in sessions:
        with session_locks[quality]:
            if quality not in sessions:
                model = FAST_MODEL if quality == "fast" else HD_MODEL
                app.logger.info("Loading local AI model: %s", model)
                sessions[quality] = new_session(model)
    return sessions[quality]


def border_analysis(im):
    sample = im.convert("RGB")
    max_side = 512
    scale = min(1.0, max_side / max(sample.width, sample.height))
    if scale < 1:
        sample = sample.resize((max(2, int(sample.width*scale)), max(2, int(sample.height*scale))))
    a = np.asarray(sample, dtype=np.float32)
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:,0], a[:,-1]], axis=0)
    bg = np.median(border, axis=0)
    noise = float(np.linalg.norm(border - bg, axis=1).mean())
    lum = float(bg.mean())
    return {
        "bg": bg,
        "borderNoise": noise,
        "nearlyBlack": lum < 42,
        "nearlyWhite": lum > 215,
        "solid": noise < 23,
    }


def graphic_remove(im, analysis=None):
    analysis = analysis or border_analysis(im)
    rgba = np.array(im.convert("RGBA"), dtype=np.float32)
    rgb = rgba[:, :, :3]
    bg = analysis["bg"].reshape(1,1,3)
    dist = np.linalg.norm(rgb - bg, axis=2)

    tight = analysis["nearlyBlack"] or analysis["nearlyWhite"]
    low, high = (7.0, 48.0) if tight else (12.0, 62.0)
    t = np.clip((dist - low) / max(1.0, high-low), 0, 1)
    alpha_factor = t*t*(3 - 2*t)
    rgba[:, :, 3] = rgba[:, :, 3] * alpha_factor
    rgba = np.clip(rgba, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def remove_background(raw, mode, quality):
    im = normalize_image(raw)
    analysis = border_analysis(im)

    use_graphic = mode == "graphic" or (
        mode == "smart"
        and analysis["solid"]
        and (analysis["nearlyBlack"] or analysis["nearlyWhite"])
    )

    if use_graphic:
        output = graphic_remove(im, analysis)
        engine = "Smart Graphic" if mode == "smart" else "Graphic"
    else:
        session = get_session(quality)
        with infer_lock:
            output = remove(
                im,
                session=session,
                post_process_mask=True,
                decontaminate=(quality != "fast"),
            )
        engine = f"Local AI · {FAST_MODEL if quality == 'fast' else HD_MODEL}"

    out = io.BytesIO()
    if isinstance(output, (bytes, bytearray)):
        png = bytes(output)
    else:
        output.save(out, "PNG", optimize=False, compress_level=1)
        png = out.getvalue()
    with Image.open(io.BytesIO(png)) as verify:
        verify.verify()
    return png, engine, analysis


def validate_url(value):
    url = (value or "").strip()
    p = urlparse(url)
    if p.scheme not in {"http","https"} or not p.hostname:
        raise ValueError("Please enter a valid http/https image URL.")
    host = p.hostname.lower()
    if host in {"localhost","localhost.localdomain"}:
        raise ValueError("This URL is not allowed.")
    try:
        infos = socket.getaddrinfo(host, p.port or (443 if p.scheme=="https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("Image host could not be resolved.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise ValueError("This URL is not allowed.")
    return url


def fetch_remote(url):
    current = validate_url(url)
    headers = {"User-Agent":"Mozilla/5.0 FreeBackgroundRemover/4.0","Accept":"image/*,*/*;q=.8"}
    for _ in range(4):
        with requests.get(current, headers=headers, stream=True, timeout=URL_TIMEOUT, allow_redirects=False) as r:
            if 300 <= r.status_code < 400 and r.headers.get("Location"):
                current = validate_url(urljoin(current, r.headers["Location"]))
                continue
            r.raise_for_status()
            ctype = (r.headers.get("Content-Type") or "").lower()
            if ctype and not ctype.startswith("image/"):
                raise ValueError("URL does not point to an image.")
            limit = MAX_UPLOAD_MB * 1024 * 1024
            data = bytearray()
            for chunk in r.iter_content(128*1024):
                if chunk:
                    data.extend(chunk)
                    if len(data) > limit:
                        raise ValueError(f"Image is larger than {MAX_UPLOAD_MB} MB.")
            return bytes(data), ctype or "application/octet-stream"
    raise ValueError("Too many redirects.")


def prune():
    cutoff = time.time() - JOB_TTL
    with jobs_lock:
        for jid in [k for k,v in jobs.items() if v["createdAt"] < cutoff]:
            jobs.pop(jid, None)


def create_job(raw, name, mimetype, mode, quality):
    prune()
    jid = uuid.uuid4().hex
    job = {
        "id":jid, "name":name or "image.png", "mimetype":mimetype or "application/octet-stream",
        "mode":mode if mode in {"smart","graphic","portrait"} else "smart",
        "quality":"fast" if quality=="fast" else "hd",
        "status":"queued", "error":None, "createdAt":time.time(), "startedAt":None, "finishedAt":None,
        "original":raw, "result":None, "engine":None, "analysis":None,
    }
    with jobs_lock:
        jobs[jid]=job
    executor.submit(run_job, jid)
    return job


def run_job(jid):
    with jobs_lock:
        job=jobs.get(jid)
        if not job: return
        job["status"]="processing"; job["startedAt"]=time.time()
        raw, mode, quality = job["original"], job["mode"], job["quality"]
    try:
        result, engine, analysis = remove_background(raw, mode, quality)
        with jobs_lock:
            job=jobs.get(jid)
            if job:
                job.update(status="done", result=result, engine=engine, analysis=analysis, finishedAt=time.time())
    except Exception as exc:
        app.logger.exception("job failed %s", jid)
        with jobs_lock:
            job=jobs.get(jid)
            if job:
                job.update(status="error", error=str(exc) or "Background removal failed.", finishedAt=time.time())


def public_job(job):
    now=time.time()
    started=job["startedAt"]; finished=job["finishedAt"]
    analysis=job.get("analysis") or {}
    return {
        "id":job["id"], "name":job["name"], "mode":job["mode"], "quality":job["quality"],
        "status":job["status"], "error":job["error"], "engine":job.get("engine"),
        "queuedMs":int(((started or now)-job["createdAt"])*1000),
        "processingMs":int((((finished or now)-started) if started else 0)*1000),
        "analysis": {
            "borderNoise": round(float(analysis.get("borderNoise",0)),1) if analysis else None,
            "nearlyBlack": bool(analysis.get("nearlyBlack")) if analysis else None,
            "nearlyWhite": bool(analysis.get("nearlyWhite")) if analysis else None,
            "solid": bool(analysis.get("solid")) if analysis else None,
        } if analysis else None,
    }


@app.after_request
def cache_headers(resp):
    if request.path.endswith((".js",".css",".html")) or request.path in {"/","/processing","/result","/samples"}:
        resp.headers["Cache-Control"]="no-cache, no-store, must-revalidate"
    return resp


@app.get("/")
def home(): return static("index.html")
@app.get("/processing")
def processing():
    return redirect("/", code=302)
@app.get("/result")
def result(): return static("result.html")
@app.get("/samples")
def samples(): return static("samples.html")

@app.get("/health")
def health():
    return jsonify({
        "ok":True,
        "engine":"railway-local-ai-v6",
        "externalPaidApi":False,
        "paidApiKeyRequired":False,
        "fastModel":FAST_MODEL,
        "hdModel":HD_MODEL,
    })

@app.post("/api/jobs")
def api_jobs():
    f=request.files.get("image")
    if not f: return jsonify({"error":"Please upload or paste an image."}),400
    raw=f.read()
    if not raw: return jsonify({"error":"Image is empty."}),400
    job=create_job(raw, f.filename, f.mimetype, request.form.get("mode","smart"), request.form.get("quality","hd"))
    return jsonify(public_job(job)),202

@app.post("/api/jobs-url")
def api_jobs_url():
    payload=request.get_json(silent=True) or {}
    try:
        raw, ctype=fetch_remote(payload.get("url",""))
        name=(urlparse(payload.get("url","")).path.split("/")[-1] or "url-image.jpg")[:180]
        job=create_job(raw, name, ctype, payload.get("mode","smart"), payload.get("quality","hd"))
        return jsonify(public_job(job)),202
    except ValueError as exc:
        return jsonify({"error":str(exc)}),400
    except requests.RequestException:
        return jsonify({"error":"Could not download that image URL."}),400

@app.get("/api/jobs/<jid>")
def api_job(jid):
    prune()
    with jobs_lock:
        job=jobs.get(jid)
        if not job: return jsonify({"error":"This job expired."}),404
        return jsonify(public_job(job))

@app.get("/api/jobs/<jid>/result")
def api_result(jid):
    with jobs_lock:
        job=jobs.get(jid)
        if not job: return jsonify({"error":"This job expired."}),404
        if job["status"]!="done" or not job["result"]: return jsonify({"error":"Result not ready."}),409
        data=job["result"]
    return Response(
        data,
        status=200,
        mimetype="image/png",
        headers={"Content-Length": str(len(data)), "Cache-Control": "no-store"}
    )

@app.get("/api/jobs/<jid>/original")
def api_original(jid):
    with jobs_lock:
        job=jobs.get(jid)
        if not job: return jsonify({"error":"This job expired."}),404
        data, ctype = job["original"], job["mimetype"]
    return Response(
        data,
        status=200,
        mimetype=ctype,
        headers={"Content-Length": str(len(data)), "Cache-Control": "no-store"}
    )

@app.errorhandler(413)
def too_large(_):
    return jsonify({"error":f"Image is larger than {MAX_UPLOAD_MB} MB."}),413

@app.get("/<path:path>")
def files(path): return send_from_directory(BASE_DIR, path)

if __name__=="__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT","8080")), threaded=True)
