# MyTime · 柳比歇夫时间账本

[![CI](https://github.com/Modify6/MyTime/actions/workflows/ci.yml/badge.svg)](https://github.com/Modify6/MyTime/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Modify6/MyTime?include_prereleases)](https://github.com/Modify6/MyTime/releases)

基于**柳比歇夫时间统计法**的个人时间管理工具：打卡记录每一件事的"纯时间"，自动分类统计，
开始一件事前先看历史用时 —— 让统计反馈决策，逐步掌控自己的时间。

```
记录（打卡/补录） → 统计（日/周/月） → 反馈（历史用时参照） → 更好的规划 → 再记录…
```

一套代码，三种形态：**浏览器 PWA**（可安装到主屏幕）、**安卓 APK**（Capacitor 原生壳，
带通知栏常驻计时与桌面小组件）、**自建同步服务**（本地优先，多设备全自动双向同步）。

## 功能

- **打卡闭环**：中央大按钮一键打卡（呼吸光晕动效），环绕悬浮的快捷打卡球按你的历史习惯自动生成，点球即开计时；结束自动成账
- **智能推荐**：打开打卡面板先看"为你推荐"——按时段与习惯分析（常在此时段做 / 上次刚做 / 高频习惯），深夜推睡眠、午间推午餐
- **计划系统**：与目标不同的执行调度维度——提前编排多个计划（预排），也可随手添加临时计划；启动/挂起/恢复/完成全状态管理。柳比歇夫串行原则：**同一时刻只有一件事执行**——启动新计时（计划或手动）遇运行中计时先统一处置（列出全部计时，全部挂起或全部结束，原因必填），手动打卡被抢占自动落账并注明；跨设备并行计时可在弹窗中一键清理；挂起原因分布反推时间块划分是否合理
- **统计**：日/周/月分类占比、Top 事项、环比上期、柳比歇夫式报告、专注热力图（近半年逐日投入矩阵）、单日时间轴（24 小时块状分布）
- **目标（大事）**：把相关事件聚合成目标，看累计投入/次数/平均单次/进度/近 30 天趋势线 —— 做成另一件大事的时间参照
- **决策参照**：开始打卡时显示该事项"上次/平均/共几次"的历史用时；计划 vs 实际偏差反馈（预估校准闭环）
- **随手记录**：手动补录过去的时段；所有记录可编辑起止时间、分类、备注；记录拆分（两件事连记了？按时间点一分为二）
- **多设备同步**：数据本地优先（断网可打卡），后台**全自动**与自建服务双向同步（详见[多设备同步](#多设备同步)）；手机开始、电脑结束天然可用
- **深色模式**：跟随系统切换，页面/Vant 组件/安卓状态栏全面适配
- **安卓深度集成（APK）**：通知栏/锁屏走秒常驻计时（通知上可直接结束打卡）、超 3 小时"忘记结束了吗"提醒、每日提醒（重启自动恢复）、桌面小组件与快捷磁贴（不开 App 看今日累计，磁贴一键直达打卡/结束）
- **数据安全**：本地 IndexedDB + JSON/CSV 导出导入；每日自动快照（服务器保留 30 份）；软删除墓碑保证多端一致
- **运行日志**：App 内自动记录启动/同步/打卡/原生通知/报错（保留 500 条），设置页可查看、复制、一键上传到服务器、导出

## 快速开始

### Windows 一键脚本（推荐）

双击项目根目录的脚本即可，首次运行自动安装依赖：

| 脚本 | 用途 |
|---|---|
| `start.bat` | 日常使用：启动服务 + 自动打开 `http://localhost:3128`，同时打印手机可访问的局域网地址 |
| `dev.bat` | 开发模式：server + web 热更新（调试地址 `http://localhost:5173`） |
| `apk.bat` | 本机打包安卓 APK（自动完成前端构建 → cap sync → Gradle 打包） |
| `release.bat` | 一键发版（测试 → 版本贯通 → CHANGELOG → 构建 → 提交 → 标签 → 推送） |
| `install-autostart.bat` | 注册服务器开机自启（登录时拉起，含端口守卫防重复） |
| `uninstall-autostart.bat` | 取消开机自启 |

### 命令行方式

要求：Node.js 22+（服务端使用内置 `node:sqlite`，无需原生编译）。

```bash
npm install && npm install --prefix server && npm install --prefix web

npm run dev       # 开发模式：server:3128 + web:5173 热更新
npm run build     # 构建生产前端到 web/dist
npm start         # 生产模式：单端口 3128（server 托管前端）
npm test          # 单元测试（Vitest）
```

**手机使用**：手机与电脑连同一 Wi-Fi，浏览器访问启动时打印的局域网地址（如 `http://192.168.x.x:3128`）；
Android/iOS 均可"添加到主屏幕"当 App 用（公网 HTTPS 下体验最佳）。

**配置**（环境变量，均有默认值）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `MYTIME_PASSWORD` | `mytime123` | 同步访问密码，**公网部署务必修改** |
| `PORT` | `3128` | 服务端口 |
| `DATA_DIR` | `server/data` | 数据目录（SQLite 数据库 + 自动快照 + 客户端日志） |
| `ALLOWED_ORIGIN` | 空（允许任意来源） | 公网部署时设为 `https://你的域名` 收紧 CORS |

数据保存在 `server/data/mytime.db`（SQLite），定期备份该目录或用应用内"导出 JSON"。

## 安卓 APK

**方式一（推荐）：下载 CI 构建产物**
push 打 `v*` 标签后，CI 自动构建 APK 并发布到 [Releases](https://github.com/Modify6/MyTime/releases)，手机直接下载安装（允许"安装未知应用"）。覆盖安装不丢数据（签名固定，debug.keystore 随仓库）。

**方式二：本机打包**
电脑安装 [Android Studio](https://developer.android.com/studio)（自带 JDK 与 SDK），双击 **`apk.bat`**——自动完成 前端构建 → cap sync → 版本号同步 → Gradle 打包，根目录生成 `MyTime-v版本号.apk`。

> 建议只在"刚发完版"后用本机打包：`apk.bat` 取当前工作树状态，未发版的改动会打出与 Release 不一致的包。
> iPhone 无开发者账号时用 Safari「添加到主屏幕」方案（设置页有图文引导）。

## 多设备同步

**设计原则：本地优先，全自动，无手动步骤。** 日常使用不需要点任何同步按钮：

| 时机 | 行为 |
|---|---|
| 本机打卡/改数据 | **3 秒内自动上推**（防抖，连续写入合并为一次请求） |
| App 启动 / 每 30 秒 / 网络恢复 / 切回前台 | 自动推拉（拉取对方设备的增量） |
| APK 原生前台恢复（resume） | 显式触发同步 |
| 首页同步状态点 | 点击 = 手动兜底同步；未连接时点击引导去设置页 |

状态点实时显示：`未连接 / 同步中 / 已同步 hh:mm / 同步失败`。

**流量极小**：协议为增量游标 + outbox 合并，空闲单次轮询往返 ~1KB，三台设备常驻全开 <0.5GB/月
（详见 [deploy/README.md](deploy/README.md) 流量预算）。

### 同步协议（简）

所有实体带 `id / updatedAt / deleted(软删墓碑) / serverRev`：

- 客户端写入先落 IndexedDB 并进 outbox 队列（同实体合并，只推最新状态），触发 `POST /api/sync` 一次请求完成"推本地变更 + 拉服务端增量"
- 服务端按 `updatedAt` 后写者优先（LWW）合并，按 `serverRev` 游标返回增量
- 客户端游标存于本地 meta，重复拉取幂等；断网时 outbox 攒着，恢复后自动重推

服务端 API（自建/二次开发参考）：`POST /api/auth`（密码换 token）· `POST /api/sync`（推拉）·
`GET /api/export`（全量导出）· `POST /api/backup`（触发快照）· `GET /api/backup/list|file`（快照管理）·
`POST /api/client-log`（客户端日志收集）· `GET /api/health`。

## 公网部署（异地多端）

`deploy/` 目录提供完整的一键部署体系（详细步骤见 [deploy/README.md](deploy/README.md)）：

```bash
# 首次部署（本地电脑，SSH 到 VPS 自动完成：Node/Caddy 安装、构建、systemd、强密码生成）
bash deploy/upload.sh

# 日常更新（VPS 上，或 SSH 一条命令：拉代码 → 重建前端 → 重启 → 健康检查）
sudo bash /opt/mytime/deploy/server-update.sh
```

包含：systemd 加固（ProtectSystem=strict）、每日自动快照、Caddy 自动 HTTPS（需已备案域名，未备案可用 HTTP 模式过渡）。

## 数据与隐私

- **本地优先**：所有数据先落本机 IndexedDB，断网完全可用；同步服务是"可选的搬运工"，不连服务器单机照样用
- **数据归属**：服务端只有 SQLite 一个文件 + 快照目录，全部在你自己的 VPS/电脑上，无任何第三方
- **备份三层**：① 应用内手动导出 JSON/CSV；② 客户端触发每日自动快照（服务器保留 30 份，设置页可下载）；③ 直接备份 `server/data/` 目录
- **删除即同步**：删除是软删墓碑，多端一致收敛，不会"删了又回来"

## 测试与 CI

| 层 | 工具 | 内容 |
|---|---|---|
| 单元测试 | Vitest（39 例） | 统计聚合、推荐引擎、同步引擎（LWW/游标/墓碑/outbox 合并）、计划调度状态机、写后防抖上推 |
| 端到端 | Playwright（7 个 spec） | 真浏览器跑全链路：打卡闭环、计划调度抢占、跨设备并行清理、目标关联、自动同步（服务端级断言），数据落库级校验 |
| CI | GitHub Actions | 三个 job：单元测试 → 浏览器端到端回归（Ubuntu 真实同步服务）→ 构建安卓 APK（`v*` 标签自动发布 Release） |

提交前钩子强制跑单测（`git config core.hooksPath .githooks` 启用），坏代码进不了仓库。

## 版本与发版

- 版本唯一来源：`web/package.json` 的 `version`；构建时注入前端，打包前自动同步到 APK 的 `versionName/versionCode`
- 一键发版：`node scripts/release.mjs patch|minor|major`——自动完成 单元测试 → 版本贯通 → CHANGELOG 生成 → 构建 → 提交 → 标签 → 推送（失败重试）
- **发版三件套纪律**：`CHANGELOG.md` 条目、README（功能清单/路线）、`docs/lessons.md`（教训档案）随每次发版同步更新
- 应用内「设置 → 运行日志」与「关于」显示当前版本

### 提交规范

- 标题：`类型(范围): 摘要`，类型用 `feat / fix / refactor / chore / docs / test / security`
- 正文写清动机、改动点与影响面，让人不看 diff 也能明白为什么改
- 每个重大 bug 的根因与预防沉淀在 [docs/lessons.md](docs/lessons.md)——技术教训档案，随版本持续追加

## 目录结构

```
MyTime/
├── server/          Node + Fastify + node:sqlite 同步服务
│   ├── src/         db.js(表结构/LWW/增量) · index.js(鉴权/sync/静态托管/快照)
│   └── data/        运行时数据（SQLite + 自动快照 + 客户端日志，gitignore）
├── web/             Vue 3 + Vite + Vant 4 + Pinia + Dexie PWA
│   ├── src/db/      本地库、同步引擎（outbox 推拉/写后防抖）、LWW 规则
│   ├── src/stores/  timer / catalog / plan / sync / auth
│   ├── src/views/   今日(打卡) / 记录 / 统计 / 计划 / 目标 / 设置
│   ├── src/stats/   聚合、历史参照、智能推荐纯函数
│   ├── tests/       Vitest 单测（统计/推荐/同步/计划调度）
│   └── e2e/         Playwright 端到端 + 调试产物助手（helpers/debug.mjs）
├── app/             Capacitor 安卓壳工程（依赖隔离，引用 ../web/dist）
│   └── android/     安卓原生工程（gradlew 打包 APK）
├── deploy/          公网部署体系（upload.sh / server-setup.sh / server-update.sh）
├── scripts/         发版(release.mjs) / 图标生成 / 版本同步 / E2E 摘要
├── docs/            lessons.md 技术教训档案
├── .githooks/       提交前闸门（敏感文件检查 + 单测）
├── start.bat        双击启动（生产模式）
├── dev.bat          双击启动（开发热更新）
├── apk.bat          双击打包安卓 APK
└── release.bat      一键发版
```

## 故障排查 FAQ

**手机连不上服务器？**
确认同一 Wi-Fi；用启动时打印的局域网地址（不是 localhost）；Windows 防火墙放行 3128 端口。

**APK 里通知栏计时不见了？**
几乎都是通知权限没开——ColorOS 等还会拦后台服务。系统设置里给 App 开通知权限；设置页可查看运行日志确认。

**提示"未登录或密码已更改"（401）？**
服务端密码改过，客户端存的是旧 token。设置页重新输入密码连接即可。

**两台设备数据不一样？**
确认双方都已在设置页连接同一服务器地址与密码；连接后启动/30 秒轮询/回前台会自动对齐，无需手动操作。

**换了手机/清了浏览器数据？**
新设备连接服务器后首次同步会全量拉取，历史数据自动回来；没配服务器的环境用"导出 JSON → 导入"迁移。

**APK 和网页端显示的版本不一致？**
APK 前端是打包时内置的，更新手机端 = 安装新 APK；网页端刷新一次即可拿到服务端新版（Service Worker 更新）。

## 后续路线

- [x] 打包为原生 App（通知栏常驻计时 ✓、桌面小组件与磁贴 ✓）
- [x] 提醒与统计推送（每日提醒 ✓、忘记结束提醒 ✓）
- [x] 计划 vs 实际（预估校准闭环 ✓）
- [x] 计划调度状态机（抢占处置/挂起原因/跨设备并行清理 ✓）
- [x] 全自动多设备同步（写后上推 + 多时机自动拉取 ✓）
- [x] 公网部署体系（VPS 一键部署 + 日常更新脚本 ✓）
- [ ] 日历视图
- [ ] 桌面小组件调优（多尺寸/主题跟随）、专注模式
- [ ] 统计周报推送
- [ ] 同步长连接（SSE，秒级双向推送；当前 30 秒轮询对个人场景已足够）

## 关于柳比歇夫法

柳比歇夫（Alexander Lyubishchev）用 56 年记录每件事的纯时间消耗，逐日结算、逐月回顾，
对时间的感知精确到分钟。核心不是"挤时间"，而是：**如实记录 → 看清时间去向 → 用数据校准预期 → 掌控节奏**。
本工具把这套流程数字化为"打卡 → 统计 → 参照"的闭环。
