#!/usr/bin/env python3
"""Loopback-only native-client QA fixture, not a deployable media server.

Disposable credentials: reviewer / prism-test. Serves only the bundled original clip.
Request logs intentionally omit queries, bodies and authorization headers.
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

SAMPLE = Path(__file__).resolve().parents[1] / 'Prism/Resources/PrismSample.mp4'
TOKEN = 'local-test-session'
MOVIE = {'id': 'sample', 'name': 'Independent server sample', 'type': 'Movie',
         'overview': 'Local QA fixture. This is not the publisher’s media server.', 'runTimeTicks': 300000000}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != '/Users/AuthenticateByName':
            return self.respond(404, {})
        try:
            data = json.loads(self.rfile.read(min(int(self.headers.get('Content-Length', '0')), 4096)))
        except (ValueError, TypeError):
            return self.respond(400, {})
        if data != {'Username': 'reviewer', 'Pw': 'prism-test'}:
            return self.respond(401, {})
        self.respond(200, {'accessToken': TOKEN, 'user': {'id': 'localuser'}})

    def do_GET(self):
        from urllib.parse import parse_qs
        url = urlsplit(self.path)
        if url.path == '/Videos/sample/stream':
            if parse_qs(url.query).get('api_key') != [TOKEN]:
                return self.respond(401, {})
            data = SAMPLE.read_bytes()
            start, end = 0, len(data)-1
            if self.headers.get('Range'):
                try:
                    bounds = self.headers['Range'].removeprefix('bytes=').split('-')
                    start = int(bounds[0]); end = int(bounds[1]) if bounds[1] else end
                    if start < 0 or end < start or end >= len(data): raise ValueError()
                except (ValueError, IndexError):
                    return self.respond(416, {})
            self.send_response(206 if self.headers.get('Range') else 200)
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(end-start+1))
            if self.headers.get('Range'): self.send_header('Content-Range', f'bytes {start}-{end}/{len(data)}')
            self.end_headers()
            self.wfile.write(data[start:end+1])
            return
        if self.headers.get('X-Emby-Token') != TOKEN:
            return self.respond(401, {})
        if url.path == '/Users/localuser/Items':
            return self.respond(200, {'items': [MOVIE]})
        self.respond(404, {})

if __name__ == '__main__':
    print('QA fixture: http://localhost:18765 — reviewer / prism-test', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 18765), Handler).serve_forever()
