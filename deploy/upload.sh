#!/usr/bin/env bash
# MyTime 本地上传脚本（Windows 下用 Git Bash 运行）：
#   bash deploy/upload.sh
# 前置：复制 deploy/deploy.config.example 为 deploy/config 并填写真实值；
#       服务器 SSH 可登录（首次可用密码，之后建议 ssh-copy-id 配密钥）。
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f deploy/config ] || { echo "ERROR: deploy/config not found — copy deploy/deploy.config.example first"; exit 1; }
# shellcheck disable=SC1091
source deploy/config
: "${SERVER_HOST:?SERVER_HOST 未设置}" "${SERVER_USER:?SERVER_USER 未设置}" "${SERVER_PORT:?SERVER_PORT 未设置}"
: "${DOMAIN:?DOMAIN 未设置}"

echo "== 上传代码到 $SERVER_USER@$SERVER_HOST:/opt/mytime =="
# tar over ssh（Windows Git Bash 无 rsync）；排除依赖/构建产物/数据/敏感文件
tar -czf - \
  --exclude=./.git \
  --exclude=./node_modules \
  --exclude=./web/node_modules \
  --exclude=./app/node_modules \
  --exclude=./web/dist \
  --exclude=./web/test-results \
  --exclude=./web/e2e \
  --exclude=./app/android \
  --exclude=./server/data \
  --exclude=./server/data-backup \
  --exclude=./.debug-state.json \
  --exclude=./.apk-version \
  . | ssh -p "$SERVER_PORT" "$SERVER_USER@$SERVER_HOST" \
  "sudo mkdir -p /opt/mytime && sudo tar -xzf - -C /opt/mytime && sudo chown -R root:root /opt/mytime"

echo "== 远端执行 server-setup.sh（装 Node/Caddy、构建、systemd、Caddy 自动 HTTPS）=="
ssh -p "$SERVER_PORT" "$SERVER_USER@$SERVER_HOST" \
  "cd /opt/mytime && sudo DOMAIN='$DOMAIN' APP_PORT='${APP_PORT:-3128}' bash deploy/server-setup.sh"

echo
echo "部署完成。验证: https://$DOMAIN/api/health"
echo "App 设置页服务器地址填 https://$DOMAIN ，密码为部署时打印的 MYTIME_PASSWORD。"
