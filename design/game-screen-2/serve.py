"""Serve the prototype locally with caching off, so edits show on reload.

    python3 serve.py [port]   # default 8791, then open http://localhost:8791
"""
import functools
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
handler = functools.partial(NoCache, directory=os.path.dirname(os.path.abspath(__file__)))
print(f"Serving on http://localhost:{port}")
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
