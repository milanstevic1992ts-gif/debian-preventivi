FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 GE360_DATA_DIR=/data
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY frontend ./frontend
COPY config ./config
RUN useradd --system --uid 10001 --home /app ge360 && mkdir -p /data && chown ge360:ge360 /data
USER ge360
EXPOSE 8095
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8095", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
