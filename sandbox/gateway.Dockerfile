FROM python:3.12.11-slim-bookworm
COPY sandbox/gateway.py /app/gateway.py
USER 65534:65534
ENTRYPOINT ["python3", "/app/gateway.py"]
