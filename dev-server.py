#!/usr/bin/env python3
"""Servidor local para desarrollo: como python3 -m http.server, pero manda
Cache-Control: no-store en todas las respuestas para que el navegador nunca
sirva una versión vieja de app.js/index.html/styles.css al recargar."""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
HTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
