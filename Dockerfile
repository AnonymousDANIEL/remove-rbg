FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    U2NET_HOME=/models \
    REMBG_MODEL=birefnet-general-lite

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt

# Pre-download the default quality model so the first image is faster.
RUN mkdir -p /models \
    && python -c "from rembg import new_session; new_session('birefnet-general-lite')"

COPY app.py index.html style.css app.js ./

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 2 --timeout 180 --access-logfile - --error-logfile - app:app"]
