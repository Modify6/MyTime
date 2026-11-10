@echo off
rem 快照异地化：从同步服务器拉最新快照到 backups-local\（双击运行，按提示输入地址与密码）
cd /d "%~dp0"
node scripts\snapshot-pull.mjs
pause
