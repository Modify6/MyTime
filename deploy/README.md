# 公网部署指南（路线 A：云 VPS + 域名）

> 前置：已购买轻量应用服务器（Ubuntu 24.04）与域名，域名 ICP 备案已通过。

## 一次性准备（本地电脑）

```bash
cd deploy
cp deploy.config.example config   # 然后编辑 config 填真实值
```

`deploy/config` 需要填写：

| 变量 | 填什么 |
|---|---|
| SERVER_HOST | 服务器公网 IP |
| SERVER_USER | SSH 用户（轻量默认 `ubuntu`） |
| SERVER_PORT | SSH 端口（默认 22） |
| DOMAIN | 你的域名（如 `mytime.example.com`，不要带 https://） |
| APP_PORT | 保持 3128 |
| ALLOWED_ORIGIN | 填 `https://你的域名`（CORS 收紧到自己的站点） |

并在域名控制台添加 **A 记录**：`@`（或子域名）→ 服务器公网 IP。

## 部署（本地电脑一条命令）

```bash
bash deploy/upload.sh
```

自动完成：上传代码 → 服务器安装 Node 22 + Caddy → npm 构建前端 → systemd 服务（开机自启/崩溃重启）→ **自动生成强密码**（只打印一次，抄下来）→ Caddy 反代 + 自动签 HTTPS 证书 → 本机健康检查。

## 验证

- 浏览器打开 `https://你的域名` → 出现登录页（浏览器地址栏有锁 = HTTPS 生效）
- App/网页设置页：服务器地址填 `https://你的域名`，密码填部署时打印的 `MYTIME_PASSWORD`
- 旧设备数据迁移：旧电脑 `server/data/mytime.db` 拷贝到 VPS 的 `/opt/mytime/server/data/` 后 `systemctl restart mytime`；或用 App 内导出 JSON → 新环境导入

## 流量预算（服务器月流量上限 30GB）

同步协议为增量游标 + outbox 合并，空闲单次轮询往返 ~1KB：

| 来源 | 估算 |
|---|---|
| 30s 轮询 × 3 设备 | ~0.26GB/月 |
| 写后自动上推（v0.10.0，防抖 3s 合并） | <0.05GB/月 |
| PWA 静态资源（仅浏览器端；APK 内置不耗流量） | <0.05GB/月 |
| 全量重拉（仅新设备/清缓存，全库 <10MB） | 偶发 |

合计 **<0.5GB/月（<2% 上限）**。设备明显增多时把 `web/src/stores/sync.js` 的轮询间隔 `30_000` 调大（如 60_000 直接减半）。

## SSH 连接约定（v0.9.0 起）

- **登录方式**：仅密钥（密码登录已关闭防爆破）。部署密钥 `本地项目/.ssh-key/id_ed25519`（v4，无口令），服务器端在 `root` 的 `authorized_keys`；`~/.ssh/mytime_deploy` 是同一把的副本（ACL 已收紧）
- **Git Bash 注意**：MSYS 的 ssh 无法加载 Windows 盘上的私钥（chmod 无效→0644 被拒载），一律用 **Windows 自带 OpenSSH**：`ssh mytime "命令"`（PowerShell/cmd）或 `/c/Windows/System32/OpenSSH/ssh.exe mytime`（Git Bash）；`~/.ssh/config` 已配 `mytime` 主机别名
- **应急**：阿里云控制台 VNC 连接（不依赖 sshd）；authorized_keys 备份在服务器 `~/.ssh/authorized_keys.bak`

## 常用运维（在 VPS 上）

```bash
sudo bash /opt/mytime/deploy/server-update.sh   # 版本更新（拉代码→重建前端→重启→健康检查）
systemctl status mytime        # 服务状态
systemctl restart mytime       # 重启
journalctl -u mytime -f        # 看日志
ls /opt/mytime/server/data/backups/   # 每日快照（保留 30 份）
```

> 更新说明：本地 `scripts/release.mjs` 发版推送 GitHub 后，在服务器网页终端跑 `server-update.sh` 即完成线上更新。
> 只有首次部署或改了 systemd/Caddy 配置才需要重跑 `server-setup.sh`；`server/data`（数据库与备份）不随代码更新变动。

## 安全清单（部署后立即确认）

- [ ] `MYTIME_PASSWORD` 为强随机串（部署脚本自动生成，勿改回弱密码）
- [ ] 云防火墙只放行 22/80/443，其余端口关闭
- [ ] `server/.env` 权限 600（脚本已设置）
- [ ] SSH 建议改用密钥登录并禁用密码（可选加固）
- [ ] 域名解析与备案状态正常
