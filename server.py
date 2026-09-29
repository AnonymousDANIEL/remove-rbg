import ipaddress
import os
import socket
from urllib.parse import urljoin, urlparse

import requests
from flask import Flask, Response, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None)

MAX_PROXY_MB = int(os.getenv("MAX_PROXY_MB", "20"))
PROXY_TIMEOUT = int(os.getenv("PROXY_TIMEOUT", "20"))


def validate_remote_url(value: str) -> str:
    url = (value or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Please enter a valid http/https image URL.")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"}:
        raise ValueError("This URL is not allowed.")
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("The image host could not be resolved.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise ValueError("This URL is not allowed.")
    return url


def fetch_image(url: str):
    current = validate_remote_url(url)
    headers = {
        "User-Agent": "Mozilla/5.0 FreeBackgroundRemover/1.0",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    for _ in range(4):
        with requests.get(current, headers=headers, stream=True, timeout=PROXY_TIMEOUT, allow_redirects=False) as resp:
            if 300 <= resp.status_code < 400 and resp.headers.get("Location"):
                current = validate_remote_url(urljoin(current, resp.headers["Location"]))
                continue
            resp.raise_for_status()
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if ctype and not ctype.startswith("image/"):
                raise ValueError("The URL does not point to an image.")
            limit = MAX_PROXY_MB * 1024 * 1024
            chunks, size = [], 0
            for chunk in resp.iter_content(128 * 1024):
                if not chunk:
                    continue
                size += len(chunk)
                if size > limit:
                    raise ValueError(f"Image is larger than {MAX_PROXY_MB} MB.")
                chunks.append(chunk)
            return b"".join(chunks), ctype or "application/octet-stream"
    raise ValueError("Too many redirects.")


@app.after_request
def security_headers(resp):
    # IMG.LY recommends cross-origin isolation for SharedArrayBuffer / faster WASM threading.
    resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    resp.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
    resp.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    return resp


@app.get("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/processing")
def processing():
    return send_from_directory(BASE_DIR, "processing.html")


@app.get("/result")
def result():
    return send_from_directory(BASE_DIR, "result.html")


@app.get("/samples")
def samples():
    return send_from_directory(BASE_DIR, "samples.html")


@app.get("/proxy-image")
def proxy_image():
    try:
        raw, ctype = fetch_image(request.args.get("url", ""))
        return Response(raw, mimetype=ctype, headers={"Cache-Control": "no-store"})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except requests.RequestException:
        return jsonify({"error": "Could not download that image URL."}), 400


@app.get("/health")
def health():
    return jsonify({"ok": True, "engine": "browser-local", "externalPaidApi": False})


@app.get("/<path:path>")
def static_files(path):
    return send_from_directory(BASE_DIR, path)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, threaded=True)
