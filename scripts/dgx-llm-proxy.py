#!/usr/bin/env python3
"""Bearer-token gate in front of the DGX's local OpenAI-compatible server (Ollama/vLLM).

Run on the DGX, then expose ONLY this port through the tunnel:
    LLM_PROXY_TOKEN=<secret> python3 dgx-llm-proxy.py            # listens on 127.0.0.1:18080
    cloudflared tunnel --url http://127.0.0.1:18080
Env: LLM_PROXY_TOKEN (required), LLM_UPSTREAM (default http://127.0.0.1:11434), LLM_PROXY_PORT (default 18080).
"""
import hmac
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ["LLM_PROXY_TOKEN"].encode()
UPSTREAM = os.environ.get("LLM_UPSTREAM", "http://127.0.0.1:11434").rstrip("/")
PORT = int(os.environ.get("LLM_PROXY_PORT", "18080"))
ALLOWED = ("/v1/models", "/v1/chat/completions", "/v1/completions", "/v1/embeddings")
FORWARD = ("Content-Type", "Accept", "X-Request-ID")


class Proxy(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _reply(self, status: int, body: bytes, ctype: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle(self) -> None:
        auth = self.headers.get("Authorization", "").encode()
        if not hmac.compare_digest(auth, b"Bearer " + TOKEN):
            return self._reply(401, b'{"error":"unauthorized"}')
        if not self.path.split("?")[0].startswith(ALLOWED):
            return self._reply(404, b'{"error":"not found"}')
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(UPSTREAM + self.path, data=body, method=self.command,
                                     headers={h: self.headers[h] for h in FORWARD if self.headers.get(h)})
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                self._reply(resp.status, resp.read(), resp.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as exc:
            self._reply(exc.code, exc.read(), exc.headers.get("Content-Type", "application/json"))
        except OSError:
            self._reply(502, b'{"error":"upstream unavailable"}')

    do_GET = do_POST = _handle

    def log_message(self, fmt: str, *args: object) -> None:  # no request bodies or tokens in logs
        print(f"{self.address_string()} {self.command} {self.path.split('?')[0]} -> {args[1] if len(args) > 1 else ''}")


if __name__ == "__main__":
    print(f"dgx-llm-proxy on 127.0.0.1:{PORT} -> {UPSTREAM}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Proxy).serve_forever()
