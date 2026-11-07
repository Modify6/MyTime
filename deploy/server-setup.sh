#!/usr/bin/env bash
# MyTime server-side one-shot setup (run ON THE VPS as root):
#   bash /opt/mytime/deploy/server-setup.sh
# Installs Node 22 + Caddy, builds the app, installs systemd service,
# generates a strong MYTIME_PASSWORD automatically, and prints it ONCE.
set -euo pipefail

APP_DIR=/opt/mytime
ENV_FILE="$APP_DIR/server/.env"
NODE_VER=22.14.0

[ "$(id -u)" = "0" ] || { echo "ERROR: run as root (sudo bash $0)"; exit 1; }
[ -d "$APP_DIR/server" ] || { echo "ERROR: $APP_DIR/server not found — upload code first (upload.sh)"; exit 1; }

source "$APP_DIR/deploy/config"
: "${DOMAIN:?DOMAIN not set in deploy/config}"
APP_PORT=${APP_PORT:-3128}

echo "== [1/6] Node $NODE_VER (Tsinghua mirror) =="
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 22 ]; then
  curl -fsSL "https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v${NODE_VER}/node-v${NODE_VER}-linux-x64.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1
fi
node -v

echo "== [2/6] Caddy (apt, Cloudsmith) =="
if ! command -v caddy >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi
caddy version

echo "== [3/6] Build web =="
cd "$APP_DIR"
npm ci --prefix server
npm ci --prefix web
npm --prefix web run build

echo "== [4/6] systemd service =="
# Auto-generate a strong password ONCE; keep it in a root-only env file.
if [ ! -f "$ENV_FILE" ]; then
  PASS=$(head -c 18 /dev/urandom | base64 | tr '+/' '-_')
  install -m 600 /dev/null "$ENV_FILE"
  echo "MYTIME_PASSWORD=$PASS" > "$ENV_FILE"
  echo "PORT=${APP_PORT:-3128}" >> "$ENV_FILE"
  [ -n "${ALLOWED_ORIGIN:-}" ] && echo "ALLOWED_ORIGIN=$ALLOWED_ORIGIN" >> "$ENV_FILE"
fi
install -m 644 "$APP_DIR/deploy/mytime.service" /etc/systemd/system/mytime.service
systemctl daemon-reload
systemctl enable --now mytime
systemctl restart mytime

echo "== [5/6] Caddy reverse proxy =="
DOMAIN=${DOMAIN:-}
[ -n "$DOMAIN" ] || { echo "ERROR: DOMAIN not set"; exit 1; }
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy 127.0.0.1:${APP_PORT:-3128}
}
EOF
systemctl enable --now caddy
systemctl restart caddy

echo "== [6/6] Health check =="
sleep 2
curl -fsS "http://127.0.0.1:${APP_PORT:-3128}/api/health" >/dev/null && echo "local health: OK"
systemctl is-active mytime && systemctl is-active caddy

echo
echo "================= DEPLOY DONE ================="
echo "PASSWORD (save it now, shown once):"
grep MYTIME_PASSWORD "$ENV_FILE" | cut -d= -f2
echo "Site: https://$DOMAIN  (DNS must point to this server; cert auto-signed)"
echo "Set the server URL + this password in the app Settings page."
