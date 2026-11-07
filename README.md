# MyTime · 柳比歇夫时间账本

[![CI](https://github.com/Modify6/MyTime/actions/workflows/ci.yml/badge.svg)](https://github.com/Modify6/MyTime/actions/workflows/ci.yml)

基于**柳比歇夫时间统计法**的个人时间管理 PWA：打卡记录每一件事的"纯时间"，自动分类统计，
开始一件事前先看历史用时 —— 让统计反馈决策，逐步掌控自己的时间。

```
记录（打卡/补录） → 统计（日/周/月） → 反馈（历史用时参照） → 更好的规划 → 再记录…
```

## 功能

- **打卡闭环**：中央大按钮一键打卡（呼吸光晕动效），环绕悬浮的快捷打卡球按你的历史习惯自动生成，点球即开计时；结束自动成账
- **计划系统**：与目标不同的执行调度维度——提前编排多个计划（预排），也可随手添加临时计划；启动/挂起/恢复/完成全状态管理；柳比歇夫串行原则——同一时刻只有一件事执行，启动新计时（计划或手动）遇运行中计时先统一处置（列出全部计时，全部挂起或全部结束，原因必填），手动打卡被抢占自动落账并注明；跨设备并行计时可在弹窗中一键清理；挂起原因分布反推时间块划分是否合理
- **智能推荐**：打开打卡面板先看"为你推荐"——按时段与习惯分析（常在此时段做 / 上次刚做 / 高频习惯），深夜推睡眠、午间推午餐
- **随手记录**：手动补录过去的时段；所有记录可编辑起止时间、分类、备注；记录拆分（两件事连记了？按时间点一分为二）
- **多设备同步**：数据本地优先（断网可打卡），后台自动与自建服务双向同步；手机开始、电脑结束天然可用
- **统计**：日/周/月分类占比、Top 事项、环比上期、柳比歇夫式报告、专注热力图（近半年逐日投入矩阵）、单日时间轴（24 小时块状分布）
- **目标（大事）**：把相关事件聚合成目标，看累计投入/次数/平均单次/进度/近 30 天趋势线 —— 做成另一件大事的时间参照
- **决策参照**：开始打卡时显示该事项"上次/平均/共几次"的历史用时；计划 vs 实际偏差反馈
- **深色模式**：跟随系统切换，页面/Vant 组件/安卓状态栏全面适配
- **每日提醒**：自定义提醒时间（仅 APK），到点弹通知，重启后自动恢复
- **数据修正**：记录拆分（预估按比例分配）与完整编辑能力
- **常驻计时通知**：安卓 APK 内打卡后通知栏/锁屏走秒常驻，通知上可直接结束打卡；超 3 小时提醒"忘记结束了吗"
- **桌面小组件与快捷磁贴**：不开 App 看今日累计与计时状态，磁贴一键直达结束/打卡
- **运行日志**：App 内自动记录启动/同步/打卡/原生通知/报错（保留 500 条），设置页可查看、复制、一键上传到服务器、导出
- **数据安全**：本地 IndexedDB 存储 + JSON/CSV 导出、导入备份；自动每日快照（服务器保留 30 份）；软删除墓碑保证多端一致
- **服务器开机自启**：`install-autostart.bat` 一键注册登录自启（含端口守卫防重复启动）

## 快速开始

**Windows 一键启动（推荐）**：双击项目根目录下的脚本即可，首次运行会自动安装依赖并构建：

- **`start.bat`** — 日常使用：启动服务 + 自动打开浏览器 `http://localhost:3128`，手机连同一 Wi-Fi 访问启动时打印的局域网地址
- **`dev.bat`** — 开发模式：server + web 热更新（网页调试 http://localhost:5173）

关闭窗口即停止服务；改密码用环境变量 `MYTIME_PASSWORD`（见下）。

### 命令行方式（备用）

要求：Node.js 22+（开发时使用内置 `node:sqlite`，无需原生编译）。

```bash
# 1. 安装依赖
npm install
npm install --prefix server
npm install --prefix web

# 2. 开发模式（server:3128 + web:5173 热更新）
npm run dev
# 打开 http://localhost:5173

# 3. 生产模式（单端口，server 托管前端构建产物）
npm run build     # 构建前端到 web/dist
npm start         # 打开 http://localhost:3128
```

**手机使用**：手机与电脑连同一 Wi-Fi，浏览器访问启动时打印的局域网地址（如 `http://192.168.x.x:3128`），
在设置页填入密码连接即可同步。Android/iOS 均可"添加到主屏幕"当 App 用（公网 HTTPS 下体验最佳）。

**默认密码**：`mytime123`，用环境变量修改：

```bash
MYTIME_PASSWORD=你的密码 PORT=3128 npm start
```

数据保存在 `server/data/mytime.db`（SQLite），定期备份该目录或用应用内"导出 JSON"。

## 安卓 APK（真·可安装的 App）

项目包含 Capacitor 壳工程（`app/`，依赖已隔离在该目录，不污染 web/server）：

1. 电脑安装 [Android Studio](https://developer.android.com/studio)（自带 JDK 21 与安卓 SDK）
2. 双击 **`apk.bat`** → 自动完成 前端构建 → cap sync → Gradle 打包，根目录生成 **`MyTime.apk`**
3. 把 `MyTime.apk` 传到安卓手机安装（允许"安装未知应用"）
4. 首次打开：设置页填电脑局域网地址 + 密码即可同步；启动图标已定制（自适应渐变时钟）

> **不想本地打包？** push 到 GitHub 后 CI 会自动构建 APK：常规 push 在 Actions Artifacts 里，
> 打 `v*` 标签会自动发布到 [Releases](https://github.com/Modify6/MyTime/releases)（含自动发行说明），手机直接下载安装。
>
> 改了前端代码想更新 App？重新跑一遍 `apk.bat` 即可。
> iPhone 无开发者账号时用 Safari「添加到主屏幕」方案（设置页有图文引导）。

## 版本与更新

> 每个重大 bug 的根因与预防沉淀在 [docs/lessons.md](docs/lessons.md)——技术教训档案，随版本持续追加。

- 版本唯一来源：`web/package.json` 的 `version`；构建时注入前端，`apk.bat` 打包前自动同步到 APK 的 `versionName/versionCode`
- 每次发版：双击 `release.bat`（或 `node scripts/release.mjs patch|minor|major`）——自动完成 单元测试 → 版本贯通 → CHANGELOG 从提交记录生成 → README 版本引用同步 → 构建 → 提交 → 标签 → 推送
- **发版三件套纪律**：`CHANGELOG.md` 条目、README（功能清单/后续路线）、`docs/lessons.md`（如有教训）——脚本会输出人工确认清单，缺一不可
- 应用内「设置 → 运行日志」与「关于」都会显示当前版本

## 同步到 GitHub

仓库已初始化（master 分支），首次推送到 GitHub：

```bash
# 方式一：安装 GitHub CLI 后（https://cli.github.com）
gh repo create MyTime --private --source=. --push

# 方式二：先在 github.com 网页上新建空仓库，然后
git remote add origin https://github.com/<你的用户名>/MyTime.git
git push -u origin master
```

之后每次发版打标签即可：`git tag vX.Y.Z && git push --tags`（或直接用 `release.bat` 一键发版）。

### 提交规范

- 标题：`类型(范围): 摘要`，类型用 `feat / fix / refactor / chore / docs / test`
- 正文：写清动机、改动点与影响面，让人不看 diff 也能明白为什么改
- 每次发版：双击 `release.bat`（或 `node scripts/release.mjs patch|minor|major`）——自动完成 单元测试 → 版本贯通 → CHANGELOG 从提交记录生成 → 构建 → 提交 → 标签 → 推送；CI 随后自动构建 APK 挂到 Releases
- 提交前钩子强制跑单测，坏代码进不了仓库（首次 clone 后执行 `git config core.hooksPath .githooks` 启用）

## 公网部署（异地访问）

局域网之外（4G/在外办公）也想同步？把 `server/` 部署到任意 VPS：

1. 服务器装 Node 22+，`git clone` 后 `npm install --prefix server && npm run build`
2. 用 Caddy 反代 3128 端口并自动签 HTTPS（修改 `MYTIME_PASSWORD` 为强密码）：
   ```
   mytime.example.com {
       reverse_proxy localhost:3128
   }
   ```
3. 手机/电脑的设置页服务器地址改为 `https://mytime.example.com` 即可异地同步
4. 务必：强密码、`server/data/` 定期备份（应用内自动快照也在服务器侧）

## 目录结构

```
MyTime/
├── server/          Node + Fastify + node:sqlite 同步服务
│   └── src/         db.js(表结构/LWW/增量) · index.js(鉴权/sync/静态托管)
├── web/             Vue 3 + Vite + Vant 4 + Pinia + Dexie PWA
│   ├── src/db/      本地库、同步引擎（outbox 推拉）、LWW 规则
│   ├── src/stores/  timer / catalog / sync / auth
│   ├── src/views/   今日(打卡) / 记录 / 统计 / 目标 / 设置
│   ├── src/stats/   聚合、历史参照、智能推荐纯函数
│   └── tests/       Vitest：统计聚合 + 同步引擎 + 推荐引擎
├── app/             Capacitor 安卓壳工程（依赖隔离，引用 ../web/dist）
│   └── android/     安卓原生工程（gradlew 打包 APK）
├── scripts/         图标生成 / 批处理编码转换 / 发版与 E2E 摘要工具
├── docs/            lessons.md 技术教训档案
├── .githooks/       提交前测试钩子（git config core.hooksPath 启用）
├── start.bat        双击启动（生产模式）
├── dev.bat          双击启动（开发热更新）
├── apk.bat          双击打包安卓 APK（需 Android Studio）
└── release.bat      一键发版（测试→版本→CHANGELOG→提交→标签→推送）
```

## 同步协议（简）

所有实体带 `id / updatedAt / deleted(软删) / serverRev`：

- 客户端写入先落 IndexedDB 并进 outbox 队列，恢复在线后 `POST /api/sync` 推送
- 服务端按 `updatedAt` 后写者优先（LWW）合并，按 `serverRev` 游标返回增量
- 客户端游标存于本地 meta，重复拉取幂等；个人多设备场景足够可靠

## 常用命令

```bash
npm run dev      # 同时启动 server 与 web 开发服务
npm run build    # 构建生产前端
npm start        # 生产模式启动（托管 dist）
npm test         # 运行单元测试
npm run icons    # 重新生成 PWA 图标
```

## 后续路线

- [x] 打包为原生 App（通知栏常驻计时 ✓、桌面小组件与磁贴 ✓）
- [x] 提醒与统计推送（每日提醒 ✓、忘记结束提醒 ✓）
- [x] 计划 vs 实际（预估校准闭环 ✓）
- [ ] 公网部署（VPS + HTTPS，异地多端访问）
- [ ] 日历视图
- [ ] 桌面小组件调优（多尺寸/主题跟随）、专注模式
- [ ] 统计周报推送

## 关于柳比歇夫法

柳比歇夫（Alexander Lyubishchev）用 56 年记录每件事的纯时间消耗，逐日结算、逐月回顾，
对时间的感知精确到分钟。核心不是"挤时间"，而是：**如实记录 → 看清时间去向 → 用数据校准预期 → 掌控节奏**。
本工具把这套流程数字化为"打卡 → 统计 → 参照"的闭环。
