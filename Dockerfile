FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py index.html processing.html result.html samples.html README.md LICENSE-NOTICE.txt ./
COPY src ./src
CMD ["sh","-c","gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 2 --threads 4 --timeout 120 --keep-alive 10 --access-logfile - --error-logfile - server:app"]
