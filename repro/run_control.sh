#!/usr/bin/env bash
# Scenario C (control): APInox MITM proxy ON + HTTPS_PROXY set, but the update
# target is REAL api.github.com (webpki-trusted) and direct egress WORKS.
# Direct-first succeeds WITHOUT touching the proxy -> bug does NOT surface when
# direct egress works. Contrasts with A (direct blocked -> fallback MITM fails).
set -u
PROXY=http://repro-proxy:18888
# clean slate
docker rm -f repro-proxy repro-client >/dev/null 2>&1
docker network rm repro-up >/dev/null 2>&1 || true
docker network create repro-up >/dev/null 2>&1
# APInox proxy on the EGRESS (non-internal) network so the client can reach it
docker run -d --name repro-proxy --network repro-up --restart no \
  -e REPRO_LOG=/logs/agent.log \
  -e REPRO_CA_DIR=/var/lib/repro-ca \
  apinox-repro /opt/bin/repro_proxy_server --port 18888 --upstream $PROXY >/dev/null
sleep 2
echo "proxy: $(docker ps --filter name=repro-proxy --format '{{.Names}} ({{.Status}})' | head -1)"
echo
echo "=== C: HTTPS_PROXY set, direct egress WORKS, target = real api.github.com ==="
docker run --rm --name repro-client --network repro-up \
  -e HTTPS_PROXY=$PROXY \
  -e REPRO_PROXY=$PROXY \
  -e REPRO_GITHU...[truncated]
