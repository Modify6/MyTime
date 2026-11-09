# MyTime 架构蓝图（可复用于同类软件）

> 本文档抽离 MyTime 的整体架构与全部关键决策，目标：**换一个领域模型，就能生成一个新的同类软件**。
> 生成路径：复制本仓库 → 按 §10 清单替换领域层 → 完成。平台层（数据/同步/服务端/CI/发版/部署/迁移）原样保留。

---

## 1. 系统全景

```
┌─ 客户端（PWA + Android APK，一套代码）──────────────┐
│ Vue3 + Vant(移动UI) + Pinia(状态) + Dexie(IndexedDB) │
│  views/   页面（领域相关 ★需替换）                    │
│  stores/  领域store ★ + timer/sync/auth/catalog（平台○）│
│  db/      schema ○ + repo ○ + sync ○ + merge ○       │
│  stats/   纯函数聚合 ★（无框架依赖，可单测）           │
│  components/ 领域组件★ + 通用组件○（SyncDot/EventEditor模式）│
│  lib/     native桥○ time○ util○ logger○ changelog○   │
│  Capacitor 壳（APK + 通知/小组件原生插件，可选）        │
└──────────────┬───────────────────────────────────┘
               │ POST /api/sync（Bearer token）
┌──────────────▼───────────────────────────────────┐
│ 服务端 Fastify + node:sqlite（单文件，零原生编译）     │
│  鉴权（密码派生token）· 增量同步 · LWW合并 · 静态托管   │
│  每日快照备份 · 客户端日志收集 · 健康检查               │
└──────────────┬───────────────────────────────────┘
               │ git push → CI 三 job → Release APK
        GitHub Actions + deploy/ 三脚本（VPS 一键部署/更新）
```

★ = 换领域时要改　○ = 平台层，原样复制

## 2. 设计原则（每条都是真实事故换来的，详见 docs/lessons.md）

1. **本地优先**：所有写先落 IndexedDB，断网全功能可用；同步是"可选搬运工"，服务端只是另一个对等副本
2. **写必经之路**：一切本地写走 `repo.putRow()` → 更新库 + 入 outbox 队列 + 通知订阅者——单点保证队列不漏
3. **LWW + 增量游标**：冲突按 `updatedAt` 后写者胜；拉取按 `serverRev` 游标增量，重复拉取幂等（游标回退 1ms 消同毫秒边界）
4. **软删墓碑**：删除=置 `deleted:1` 并同步，多端一致收敛，不出现"删了又回来"
5. **同一时刻只有一件事**（领域原则，MyTime 特有）：串行计时 + 抢占强制原因——领域规则放进 store 状态机，UI 只消费
6. **bat 薄壳化**：Windows 批处理只留 ASCII 10 行调 Node 脚本，中文逻辑全在 .mjs（GBK 三层坑终极解）
7. **发版三件套**：CHANGELOG + README + lessons 随版本强制同步——文档即产品的一部分

## 3. 数据层规范

### 3.1 表通用约定（所有表必带）
```
id: text 主键（uuid）   updatedAt: number（LWW 依据）
deleted: 0|1（墓碑）     createdAt: number
serverRev: number（服务端下发，客户端只读）
```

### 3.2 Dexie schema（web/src/db/schema.js）
- `db.version(N).stores({...})` 声明全部表 + outbox(key,table,row,seq) + meta(key,value) + logs
- `window.__mytimeDebug = { db }` 暴露给 E2E（数据库级断言的根基）
- 客户端首启 `ensureSeed()` 播种默认数据（别只靠服务端——全新离线用户的第一分钟）

### 3.3 repo 层 API（web/src/db/repo.js）
```
putRow(table,row)      写+入队+通知（一切本地编辑的入口）
softDelete(table,id)   墓碑删除
adoptRow(table,row,{push}) 采纳远端行（保留其 updatedAt；导入用 push:true）
getRunningEvents/getEventsBetween/...  查询辅助
onChange(fn)/setWriteHook(fn)  UI订阅 / 写后防抖上推钩子
```
**铁律**：拉取写入走 adoptRow（不触发 writeHook）→ 天然避免拉→推死循环；UI 本地写走 putRow（触发）→ 3 秒防抖自动上推。

### 3.4 合并（db/merge.js）
`shouldReplace(local, remote)`：远端 `updatedAt` 严格大于本地才覆盖；相等保本地。全库唯一裁决点。

## 4. 同步协议

```
客户端 syncNow()（单飞锁 syncing + token 守卫）：
  循环 ≤5 轮（请求期间 outbox 可能继续增长）：
    pending = outbox 全量 → POST /api/sync { since: cursor, changes }
    按 seq 精确出队（勿按内容——防误删请求期间新增）
    逐条 adoptRow(远端变更) → 游标 = max(serverRev, serverTime) - 1
    outbox 空 → break
  emit('start'|'done'|'error')
触发时机：启动 / 每30s / online / visibilitychange / 原生resume / 写后防抖3s / 手动兜底
```

服务端 `/api/sync`：TABLES 白名单校验 → 逐表 LWW upsert（发 serverRev）→ 返回 `{ serverTime, applied, changes: since 之后的增量 }`。

## 5. 服务端规范（server/src/）

- **单文件 index.js + db.js**，Fastify + `node:sqlite`（Node22+ 内置，零原生编译——VPS 友好）
- 鉴权：密码 → HMAC 派生 token（无会话状态，改密码全失效）；CORS `ALLOWED_ORIGIN` 收紧
- TABLES 白名单 + `migrateSchema()` 幂等迁移（启动时补列）
- 生产模式静态托管 web/dist + SPA fallback；`/api/*` 404 不落 index
- 每日快照（客户端触发 `POST /api/backup`，保留 30 份）；`/api/client-log` 收手机日志（排障命脉）
- systemd：`ProtectSystem=strict` + `ReadWritePaths` 指向**必须先存在**的目录（226/NAMESPACE 坑）

## 6. 客户端结构

- **stores**：领域 store 持有状态机与业务规则（如 plan 的 CAN_TRANSITION 合法转换表）；sync/auth/catalog/timer 是平台件
- **stats（纯函数）**：一切聚合/推荐/布局算法放这里——Vitest 直测，不碰 Vue
- **通用组件模式**：SyncDot（状态点+点击兜底）、EventEditor（底部弹层表单）、EChart（按需引入）、VersionHistory（CHANGELOG 内置展示）
- **PWA**：`injectRegister:null` + main.js 手动注册（APK 内禁 SW 防 WebView 缓存陈旧）；`__APP_VERSION__`/`__APP_CHANGELOG__` 构建注入
- **原生**：Capacitor 壳 + 自定义插件（TimerNative 常驻通知/小组件、ReminderNative 每日提醒）；WebView 内禁动态 import（路由静态化）

## 7. 质量体系

| 层 | 工具 | 要点 |
|---|---|---|
| 单测 | Vitest | 只测 stats 纯函数 + 同步引擎（fake-indexeddb + mock api）+ store 状态机 |
| E2E | Playwright | webServer 自动拉起**真实服务端**；失败重试一轮；`__mytimeDebug.db` 做库级断言；调试产物走 helpers（吞错不拖垮测试） |
| CI | Actions 三 job | test → E2E(Ubuntu) → APK（v* 标签发 Release）；pre-commit 闸门（敏感文件 + 单测） |

**平台假设零容忍**：E2E 调试写入禁硬编码本地路径（曾致 CI 长期假性偶发失败）。

## 8. 发版与运维

- **release.mjs**：工作树检查→单测→版本贯通（web/package.json 唯一源→APK versionName/Code）→CHANGELOG→构建→提交→标签→推送重试
- **apk.bat** = 10 行 ASCII 薄壳 → `scripts/apk.mjs`（工具链自举：toolchain/ → LOCALAPPDATA → 自动下载；小版本号按代码变化自动递增）
- **deploy/**：`upload.sh`（tar over ssh 首次部署）/ `server-setup.sh`（装 Node+Caddy+systemd+强密码）/ `server-update.sh`（日常更新一条命令）
- **迁移**：`migrate-export/import.mjs` + U 盘四按钮（整个工作文件夹自足：代码+toolchain 1.9G+ZCode 会话/记忆）

## 9. 数据安全三层

应用内导出 JSON/CSV → 每日服务端快照（30 份）→ 服务器 data/ 目录整备。**待办**：快照异地化（本地定时拉取昨日快照）。

## 10. 新软件抽离清单

### 原样保留（平台层，~70% 代码量）
```
web/src/db/{repo,sync,merge}.js 的机制（schema 表定义按 blueprint 换）
web/src/stores/{sync,auth}.js、lib/*（time 按需）、components/{SyncDot,EventEditor 模式}
server/src 整体（TABLES 与表结构按 blueprint 换）
scripts/{release,sync-version,apk,setup-toolchain,migrate-*}、deploy/、.githooks/、
.github/workflows/ci.yml、.gitignore、vitest/playwright 配置
```

### 按 Blueprint 替换（领域层，~30%）
```
web/src/db/schema.js      ← blueprint.entities 生成
web/src/stores/<领域>.js   ← 状态机规则（蓝图的 businessRules）
web/src/views/*           ← blueprint.views（页面清单）
web/src/stats/*           ← 领域聚合函数
server/src/db.js          ← TABLES 与列定义
默认 seed 数据             ← blueprint.seed
```

### Blueprint 最小输入（blueprint.json）
```json
{
  "name": "MyLedger",
  "domain": "个人记账",
  "entities": [
    { "table": "records", "label": "账目",
      "fields": { "amount": "number", "categoryId": "string", "note": "string", "spentAt": "number" } },
    { "table": "categories", "label": "分类", "seed": [
      { "id": "cat-food", "name": "餐饮", "color": "#f5a623" } ] }
  ],
  "views": [
    { "name": "今日", "path": "/", "desc": "快捷记账按钮 + 今日流水" },
    { "name": "统计", "path": "/stats", "desc": "分类占比/月度趋势" }
  ],
  "rules": ["单条账目不可为负", "删除需确认"]
}
```
→ 生成器（待实现，见下）据此产出 schema/store/views 骨架 + 全部平台层。

---

## 11. 已知边界与改进方向

- 同步为 30s 轮询 + 写后推送，无长连接（个人场景足够；多人协作需 SSE）
- LWW 静默覆盖，无冲突可视化（单人双设备可接受）
- 快照单点在 VPS（异地化待做）
- planLogs 全量读取（个人量级 OK；>10 万条需按周期索引）
