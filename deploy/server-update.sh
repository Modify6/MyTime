#!/usr/bin/env bash
# 服务器端增量更新（阿里云网页终端运行）：拉取最新代码 → 重建前端 → 重启服务 → 健康检查
# 用法：sudo bash /opt/mytime/deploy/server-update.sh
# 说明：日常更新用本脚本即可；首次部署/改了 systemd/Caddy 配置才需要重跑 server-setup.sh
set -e
APP_DIR=/opt/mytime
cd "$APP_DIR"

echo "== 1/4 拉取最新代码（GitHub 间歇中断就多试几次） =="
git pull origin master

echo "== 2/4 重建前端（dist 不入库，必须在服务器上构建） =="
npm --prefix web run build

echo "== 3/4 重启服务 =="
systemctl restart mytime
sleep 2

echo "== 4/4 健康检查 =="
curl -s http://127.0.0.1:3128/api/health && echo
echo "服务状态: $(systemctl is-active mytime)"
echo "当前部署版本: $(git log --oneline -1)"
echo "完成。网页端如仍显示旧版，刷新一次即可（Service Worker 更新）；APK 需安装对应版本的安装包。"
