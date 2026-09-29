import ipaddress
import os
import socket
from urllib.parse import urljoin, urlparse

import requests
from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None)

MAX_PROXY_MB = int(os.getenv("MAX_PROXY_MB", "20"))
PROXY_TIMEOUT = int(os.getenv("PROXY_TIMEOUT", "30"))
IMGLY_BASE = "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/"


def validate_remote_url(value: str) -> str:
    url = (value or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Please enter a valid http/https image URL.")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"}:
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


def fetch_image(url: str):
    current = validate_remote_url(url)
    headers = {
        "User-Agent": "Mozilla/5.0 FreeBackgroundRemover/1.0",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }

    for _ in range(4):
        with requests.get(
            current,
            headers=headers,
            stream=True,
            timeout=PROXY_TIMEOUT,
            allow_redirects=False,
        ) as resp:
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
def headers(resp):
    # All AI JavaScript is bundled into this Railway deployment.
    # Model/WASM resources are proxied through the same origin below.
    resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    resp.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
    resp.headers["Cross-Origin-Resource-Policy"] = "same-origin"

    if request.path.startswith("/dist/"):
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif request.path.endswith((".css", ".html")) or request.path in {"/", "/processing", "/result", "/samples"}:
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
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


@app.get("/imgly-assets/<path:asset_path>")
def imgly_assets(asset_path):
    # Proxy the free model/WASM asset CDN through Railway so the browser only
    # talks to this same origin. The browser can cache immutable model chunks.
    if ".." in asset_path or asset_path.startswith("/"):
        return jsonify({"error": "Invalid asset path."}), 400

    upstream_url = IMGLY_BASE + asset_path
    try:
        upstream = requests.get(
            upstream_url,
            stream=True,
            timeout=60,
            headers={"User-Agent": "Mozilla/5.0 FreeBackgroundRemover/2.0"},
        )
        if upstream.status_code != 200:
            status = upstream.status_code
            upstream.close()
            return jsonify({"error": f"AI asset unavailable ({status})."}), 502

        content_type = upstream.headers.get("Content-Type") or "application/octet-stream"
        content_length = upstream.headers.get("Content-Length")

        def generate():
            try:
                for chunk in upstream.iter_content(256 * 1024):
                    if chunk:
                        yield chunk
            finally:
                upstream.close()

        response = Response(stream_with_context(generate()), mimetype=content_type)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        if content_length:
            response.headers["Content-Length"] = content_length
        return response
    except requests.RequestException:
        return jsonify({"error": "Could not load the free local AI model asset."}), 502


@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "engine": "browser-local-bundled",
        "externalPaidApi": False,
        "paidApiKeyRequired": False,
        "uiScripts": "bundled-v3",
    })


@app.get("/<path:path>")
def static_files(path):
    return send_from_directory(BASE_DIR, path)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, threaded=True)
