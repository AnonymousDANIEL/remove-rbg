FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    REMBG_HOME=/models \
    FAST_MODEL=birefnet-general-lite \
    HD_MODEL=birefnet-general \
    WARM_MODEL=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt

# Pre-download the FAST model so normal requests never wait for a model download.
RUN mkdir -p /models \
    && python -c "from rembg import new_session; new_session('birefnet-general-lite')"

COPY app.py common.js home.js processing.js result.js samples.js \
     index.html processing.html result.html samples.html style.css ./

CMD ["sh","-c","gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 8 --timeout 300 --keep-alive 10 --access-logfile - --error-logfile - app:app"]
