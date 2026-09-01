#!/usr/bin/env python3
"""Minimal corporate forward proxy for the APInox update-failure repro.

Accepts CONNECT api.github.com:443 and tunnels bytes to the target resolved
via the container's own /etc/hosts (pointing api.github.com at the fake
GitHub container). This models a corporate proxy that is the ONLY egress
path: the client container has no route to the outside.
"""
import socket
import sys
import threading


def tunnel(a, b):
    for src, dst in ((a, b), (b, a)):
        try:
            while True:
                d = src.recv(65536)
                if not d:
                    break
                dst.sendall(d)
        except OSError:
            pass
    try:
        a.close()
    except OSError:
        pass
    try:
        b.close()
    except OSError:
        pass


def handle(conn):
    try:
        conn.settimeout(15)
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = conn.recv(4096)
            if not chunk:
                return
            data += chunk
        first = data.split(b"\r\n", 1)[0].decode(errors="replace")
        sys.stderr.write("CORPPROXY %s\n" % first)
        if not first.startswith("CONNECT"):
            conn.sendall(b"HTTP/1.1 501 Not Implemented\r\n\r\n")
            conn.close()
            return
        hostport = first.split()[1]
        host, _, port = hostport.partition(":")
        try:
            up = socket.create_connection((host, int(port or "443")), timeout=15)
        except OSError as e:
            sys.stderr.write("CORPPROXY upstream connect %s:%s failed: %s\n" % (host, port, e))
            conn.sendall(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
            conn.close()
            return
        sys.stderr.write("CORPPROXY tunneling %s:%s\n" % (host, port))
        conn.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        threading.Thread(target=tunnel, args=(conn, up), daemon=True).start()
    except OSError:
        pass


def main():
    srv = socket.socket()
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", 3128))
    srv.listen(64)
    sys.stderr.write("CORPPROXY listening on 0.0.0.0:3128\n")
    while True:
        c, _ = srv.accept()
        threading.Thread(target=handle, args=(c,), daemon=True).start()


if __name__ == "__main__":
    main()
