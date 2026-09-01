#!/usr/bin/env bash
# Controlled reproduction of the APInox update failure (kanban t_b6c2aed3).
#
# Topology (mirrors the real-world case where, while APInox is "reading calls",
# its TLS-MITM proxy is the ONLY egress path for update traffic — e.g. a
# corporate network where direct GitHub access is blocked):
#
#   repro-corp (INTERNAL — no internet, no DNS egress):
#     repro-client   — runs the real apinox_lib::updater client construction
#     repro-proxy    — runs the REAL APInox MITM proxy (CertManager CA +
#                      SniResolver leaf signing), NIC #1 here
#
#   repro-up (regular bridge, has internet + local reachability):
#     repro-gh       — fake api.github.com (self-signed cert, real release JSON)
#     repro-proxy    — NIC #2; forwards MITM'd requests here
#
#   - repro-client cannot reach api.github.com directly (internal net: NXDOMAIN
#     / no route) → get_with_fallback's direct attempt fails, as in the field
#   - OS proxy (HTTPS_PROXY=http://repro-proxy:18888) = what APInox's
#     set_system_proxy installs while reading calls; build_client() honours it
#   - repro-proxy MITMs CONNECT api.github.com:443 with a leaf signed by the
#     REAL APInox Root CA (generated at runtime by CertManager::generate())
#
#   SCENARIO A (untrusted): proxy-aware client uses the production root store
#     (rustls webpki-roots, pre-fix shape) → does NOT trust the APInox CA →
#     update fails (the field failure).
#   SCENARIO B (trusted):   APInox CA added to root store → succeeds
#     (reference for "what a CA-trust fix would do").
#   SCENARIO C (patched):   the REAL post-fix production client
#     (apinox_lib::updater::build_client) — it discovers the APInox CA in
#     $APINOX_CONFIG_DIR (pointed at the shared CA dir by this script) and
#     roots it; self-proxy guard + route reporting included. Must succeed in
#     the exact same topology as A, without disabling the proxy or clearing
#     the OS proxy state. This is the end-to-end proof of the fix.
#
# Run:  bash /tmp/apinox-repro/run_repro.sh   (idempotent)
set -u

CA_DIR=/tmp/apinox-repro/ca
rm -rf "$CA_DIR" && mkdir -p "$CA_DIR"

# ── networks ─────────────────────────────────────────────────────────────────
docker network rm repro-corp >/dev/null 2>&1 || true
docker network rm repro-up   >/dev/null 2>&1 || true
docker network create --internal repro-corp >/dev/null   # client: no internet
docker network create repro-up >/dev/null

# ── clean old containers ─────────────────────────────────────────────────────
docker rm -f repro-gh repro-proxy repro-client 2>/dev/null || true

# ── 1. fake GitHub on the upstream network ───────────────────────────────────
docker run -d --name repro-gh --network repro-up apinox-repro /opt/bin/fake_github.py >/dev/null
sleep 1
GH_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' repro-gh)
echo "[setup] fake github (api.github.com) IP = $GH_IP"

# ── 2. APInox MITM proxy (real CA + real per-domain leaf signing) ───────────
docker run -d --name repro-proxy \
  --network repro-corp \
  --add-host api.github.com:$GH_IP \
  -e REPRO_PROXY_PORT=18888 \
  -e REPRO_CA_DIR=/ca \
  -e REPRO_LOG=/ca/proxy.log \
  -e APINOX_CONFIG_DIR=/nonexistent \
  -v "$CA_DIR:/ca" \
  apinox-repro /opt/bin/repro_proxy_server >/dev/null
docker network connect repro-up repro-proxy >/dev/null

# wait for the proxy to be listening (its CA is already generated at startup)
for i in $(seq 1 30); do
  if [ -f "$CA_DIR/proxy.log" ] && grep -q "Listening on" "$CA_DIR/proxy.log" 2>/dev/null; then
    break
  fi
  sleep 1
done
echo "=== proxy startup log ==="
cat "$CA_DIR/proxy.log" 2>/dev/null || { echo "proxy did not start"; docker logs repro-proxy; exit 1; }
[ -f "$CA_DIR/ca.cer" ] && echo "[setup] APInox Root CA present: $CA_DIR/ca.cer"

# ── 3. client on the internal network only (NO egress, like the field) ─────
run_client() {
  local mode="$1"
  local extra_env=""
  local config_dir="/nonexistent"
  [ "$mode" = "trusted" ] && extra_env="$extra_env -e REPRO_CA_PEM=/ca/ca.cer"
  # The fixed build_client()/build_direct_client() discover the APInox CA in
  # $APINOX_CONFIG_DIR. For `patched` that must be the container-side mount of
  # the shared CA dir (/ca — the host $CA_DIR volume, where the proxy wrote
  # ca.cer); for the pre-fix scenarios A/B it stays /nonexistent so the
  # direct client's CA discovery is a no-op, keeping them faithful to the
  # pre-fix production shape.
  [ "$mode" = "patched" ] && config_dir="/ca"
  docker run --rm --name repro-client \
    --network repro-corp \
    -e HTTPS_PROXY=http://repro-proxy:18888 \
    -e REPRO_PROXY=http://repro-proxy:18888 \
    -e REPRO_GITHUB=api.github.com \
    -e APINOX_CONFIG_DIR="$config_dir" \
    $extra_env \
    -v "$CA_DIR:/ca:ro" \
    apinox-repro timeout 120 /opt/bin/repro_update_client "$mode"
  local rc=$?
  echo "[client exit code: $rc]"
  echo
}

echo
echo "############ SCENARIO A: egress blocked + APInox proxy is OS proxy + CA NOT trusted (PRE-FIX production shape: webpki roots) ############"
run_client untrusted

echo
echo "############ SCENARIO B: same topology, harness client with the APInox Root CA added (reference fix) ############"
run_client trusted

echo
echo "############ SCENARIO C: same topology, REAL post-fix production client (build_client + CA discovery + self-proxy guard) ############"
run_client patched

echo
echo "############ APInox MITM proxy log — the trace the user can never see ############"
cat "$CA_DIR/proxy.log"
