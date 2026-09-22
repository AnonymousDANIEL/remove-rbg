FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    REMBG_HOME=/models \
    REMBG_MODEL=birefnet-general

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt

# Download the full quality model during build so user requests do not wait for a model download.
RUN mkdir -p /models \
    && python -c "from rembg import new_session; new_session('birefnet-general')"

COPY app.py index.html result.html samples.html style.css common.js home.js result.js samples.js ./

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 4 --timeout 300 --keep-alive 5 --access-logfile - --error-logfile - app:app"]
