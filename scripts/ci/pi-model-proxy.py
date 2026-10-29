#!/usr/bin/env python3
"""Loopback-only, fixed-destination model proxy for the isolated Pi repair worker."""
from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

MAX_REQUEST_BYTES = 2 * 1024 * 1024
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
CHAT_PATHS = {"/chat/completions", "/v1/chat/completions"}
MODEL_PATHS = {"/models", "/v1/models"}
ALLOWED_PATHS = CHAT_PATHS | MODEL_PATHS


def validate_base_url(value: str) -> str:
    parsed = urlsplit(value)
    local_test = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
    if parsed.scheme != "https" and not local_test:
        raise ValueError("model base URL must use HTTPS")
    if not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("invalid model base URL")
    return value.rstrip("/")


def make_server(base_url: str, api_key: str, host: str = "127.0.0.1", port: int = 8765):
    upstream = validate_base_url(base_url)
    if not api_key or len(api_key) > 8192:
        raise ValueError("model API key is missing or invalid")

    class ProxyHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, _format, *_args):
            # Never log request bodies, authorization headers, or upstream error bodies.
            return

        def _reply(self, status: int, payload: bytes, content_type: str = "application/json"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(payload)
            self.close_connection = True

        def _forward(self, method: str):
            parsed = urlsplit(self.path)
            if parsed.path not in ALLOWED_PATHS or parsed.query or parsed.fragment:
                self._reply(404, b'{"error":"path not allowed"}')
                return
            if method == "POST" and parsed.path not in CHAT_PATHS:
                self._reply(405, b'{"error":"method not allowed"}')
                return
            if method == "GET" and parsed.path not in MODEL_PATHS:
                self._reply(405, b'{"error":"method not allowed"}')
                return

            body = None
            if method == "POST":
                try:
                    size = int(self.headers.get("Content-Length", "0"))
                except ValueError:
                    self._reply(400, b'{"error":"invalid content length"}')
                    return
                if size < 1 or size > MAX_REQUEST_BYTES:
                    self._reply(413, b'{"error":"request size rejected"}')
                    return
                body = self.rfile.read(size)
                if len(body) != size:
                    self._reply(400, b'{"error":"incomplete request"}')
                    return

            headers = {
                "Authorization": "Bearer " + api_key,
                "Accept": self.headers.get("Accept", "application/json"),
            }
            if method == "POST":
                headers["Content-Type"] = self.headers.get("Content-Type", "application/json")
            request = Request(upstream + parsed.path, data=body, headers=headers, method=method)
            try:
                with urlopen(request, timeout=300) as response:
                    status = response.status
                    content_type = response.headers.get("Content-Type", "application/json")
                    payload = response.read(MAX_RESPONSE_BYTES + 1)
            except HTTPError as error:
                status = error.code
                content_type = error.headers.get("Content-Type", "application/json")
                payload = error.read(MAX_RESPONSE_BYTES + 1)
            except (URLError, TimeoutError, OSError):
                self._reply(502, b'{"error":"model provider unavailable"}')
                return

            if len(payload) > MAX_RESPONSE_BYTES:
                self._reply(502, b'{"error":"model response exceeded size limit"}')
                return
            self._reply(status, payload, content_type)

        def do_GET(self):
            self._forward("GET")

        def do_POST(self):
            self._forward("POST")

    server = ThreadingHTTPServer((host, port), ProxyHandler)
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        raise SystemExit("invalid proxy port")
    base_url = validate_base_url(os.environ.get("PI_AUTOFIX_BASE_URL", "https://api.deepseek.com"))
    api_key = os.environ.get("PI_AUTOFIX_API_KEY", "")
    server = make_server(base_url, api_key, port=args.port)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
