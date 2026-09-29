FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --upgrade pip && pip install -r requirements.txt
COPY app.py common.js home.js processing.js result.js samples.js index.html processing.html result.html samples.html style.css ./
CMD ["sh","-c","gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 16 --timeout 180 --keep-alive 10 --access-logfile - --error-logfile - app:app"]
