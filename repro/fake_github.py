#!/usr/bin/env python3
"""Fake GitHub API server for the APInox update-failure repro (t_b6c2aed3).

Presents a self-signed cert for api.github.com (CN/SAN) and serves the real
release JSON fixture captured from api.github.com. No internet access needed.
"""
import http.server
import os
import ssl
import sys


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        # NOTE: os.path.join("/www", "/repos/..") would DROP /www (absolute
        # second arg); concatenate instead.
        full = "/www" + path
        if os.path.isfile(full):
            data = open(full, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            sys.stderr.write("FAKEGITHUB GET %s -> 200 (%d bytes)\n" % (path, len(data)))
        else:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            sys.stderr.write("FAKEGITHUB GET %s -> 404\n" % path)

    def log_message(self, fmt, *args):
        pass


def main():
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain("/ssl/cert.pem", "/ssl/key.pem")
    srv = http.server.ThreadingHTTPServer(("0.0.0.0", 443), Handler)
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    sys.stderr.write("FAKEGITHUB listening on 0.0.0.0:443 (self-signed api.github.com)\n")
    srv.serve_forever()


if __name__ == "__main__":
    main()
