"""Trusted Responses API proxy. Upstream credentials never enter agent containers."""
import hmac
import json
import os
from pathlib import Path
import ssl
import threading
import time
from http.client import HTTPSConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = os.environ.get("ATLAS_MODEL", "")
MAX_BODY = 16 * 1024 * 1024


class Quota:
    def __init__(self, requests, seconds):
        self.requests = requests
        self.deadline = time.monotonic() + seconds
        self.lock = threading.Lock()

    def take(self):
        with self.lock:
            if time.monotonic() >= self.deadline or self.requests <= 0:
                return False
            self.requests -= 1
            return True


def proxy_handler(key, token, model, quota):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Never log bearer tokens or model prompts.

        def respond(self, status, body):
            encoded = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def authorize(self):
            return hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token)

        def do_GET(self):
            if self.path == "/health":
                self.respond(200, {"ok": True})
            elif self.path == "/v1/models" and self.authorize():
                self.respond(200, {"object": "list", "data": [{"id": model, "object": "model"}]})
            else:
                self.respond(403, {"error": "Not authorized or unsupported route"})

        def do_POST(self):
            if not self.authorize():
                self.respond(401, {"error": "Invalid session token"})
                return
            if self.path != "/v1/responses":
                self.respond(404, {"error": "Only Responses API is enabled"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BODY:
                    self.respond(413, {"error": "Request size limit"})
                    return
                data = json.loads(self.rfile.read(size))
                if data.get("model") != model:
                    self.respond(403, {"error": "Model is not permitted"})
                    return
                if not quota.take():
                    self.respond(429, {"error": "Sandbox request/time budget exhausted"})
                    return
                data["max_output_tokens"] = min(int(data.get("max_output_tokens", 16384)), 16384)
                payload = json.dumps(data).encode()
            except (ValueError, TypeError, AttributeError):
                self.respond(400, {"error": "Invalid request"})
                return
            upstream = HTTPSConnection("api.openai.com", timeout=180, context=ssl.create_default_context())
            try:
                upstream.request("POST", "/v1/responses", payload, {
                    "Authorization": "Bearer " + key, "Content-Type": "application/json",
                    "Content-Length": str(len(payload)),
                })
                response = upstream.getresponse()
                self.send_response(response.status)
                self.send_header("Content-Type", response.getheader("Content-Type", "application/json"))
                self.send_header("Connection", "close")
                self.end_headers()
                while chunk := response.read1(16384):
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except (OSError, TimeoutError):
                self.close_connection = True
            finally:
                upstream.close()
    return Handler


if __name__ == "__main__":
    if not MODEL:
        raise SystemExit("ATLAS_MODEL must be configured")
    key = Path("/run/secrets/openai-key").read_text().strip()
    token = Path("/run/secrets/gateway-token").read_text().strip()
    if not key or not token:
        raise SystemExit("Missing gateway credentials")
    quota = Quota(int(os.getenv("GATEWAY_MAX_REQUESTS", "200")), int(os.getenv("GATEWAY_MAX_SECONDS", "7200")))
    server = ThreadingHTTPServer(("0.0.0.0", 8080), proxy_handler(key, token, MODEL, quota))
    server.daemon_threads = True
    print("Responses gateway ready", flush=True)
    server.serve_forever()
