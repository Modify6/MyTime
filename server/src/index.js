// MyTime 同步服务：鉴权 + 增量同步 + 数据导出 + 生产模式下静态托管 web/dist
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, pushChanges, pullSince, exportAll, createBackupSnapshot, listBackups, isBackupName, TABLES } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3128);
const PASSWORD = process.env.MYTIME_PASSWORD || 'mytime123';
// 由密码派生 token，服务端无会话状态；改密码即全部失效
const TOKEN = crypto.createHmac('sha256', PASSWORD).update('mytime-token-v1').digest('hex');

const app = Fastify({
  logger: false,
  bodyLimit: 10 * 1024 * 1024,
  trustProxy: true, // 反代（Caddy）后取真实客户端 IP
});
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const backupsDir = path.join(dataDir, 'backups');
const clientLogDir = path.join(dataDir, 'client-logs');
const db = openDb(dataDir);

// CORS：默认允许任意来源（局域网/开发）；公网部署设 ALLOWED_ORIGIN 收紧为站点域名
await app.register(cors, { origin: process.env.ALLOWED_ORIGIN || true });

// 生产模式：托管 web/dist（SPA fallback），开发模式该目录不存在则跳过
const distDir = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(distDir)) {
  await app.register(fastifyStatic, { root: distDir });
  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url.split('?')[0];
    if (url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html');
  });
}

// 鉴权：除 auth/health 外的 /api 请求需 Bearer token
app.addHook('onRequest', async (req, reply) => {
  const url = req.raw.url.split('?')[0];
  if (!url.startsWith('/api/') || url === '/api/auth' || url === '/api/health') return;
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${TOKEN}`) return reply.code(401).send({ error: 'unauthorized' });
});

app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

app.post('/api/auth', async (req, reply) => {
  const { password } = req.body || {};
  if (password !== PASSWORD) return reply.code(401).send({ error: '密码错误' });
  return { token: TOKEN };
});

// 增量同步：先推（LWW 合并）后拉（按 serverRev 游标），响应游标供下次增量
app.post('/api/sync', async (req) => {
  const { since = 0, changes = [] } = req.body || {};
  let applied = 0;
  for (const c of changes) {
    if (!c || !TABLES[c.table] || !Array.isArray(c.rows)) continue;
    applied += pushChanges(db, c.table, c.rows);
  }
  const pulled = pullSince(db, Number(since) || 0);
  return { serverTime: Date.now(), applied, changes: pulled };
});

// 服务端全量导出（备份用；客户端导入走同步接口）
// 分类目录：客户端每次同步成功后对账（防本地目录丢失后无法自愈）
app.get('/api/categories', async () => ({
  categories: db.prepare('SELECT * FROM categories WHERE deleted = 0 ORDER BY sort, createdAt').all(),
}));

app.get('/api/export', async () => exportAll(db));

// —— 服务端每日快照备份（客户端触发，保留最近 30 份） ——
app.post('/api/backup', async () => ({ ok: true, ...createBackupSnapshot(db, backupsDir) }));

app.get('/api/backup/list', async () => ({ backups: listBackups(backupsDir) }));

app.get('/api/backup/file', async (req, reply) => {
  const name = String(req.query?.name || '');
  if (!isBackupName(name)) return reply.code(400).send({ error: 'invalid backup name' });
  const file = path.join(backupsDir, name);
  if (!fs.existsSync(file)) return reply.code(404).send({ error: 'backup not found' });
  reply.header('Content-Type', 'application/json');
  reply.header('Content-Disposition', `attachment; filename="${name}"`);
  return fs.createReadStream(file);
});

// —— 客户端运行日志收集（手机排障用，保留最近 20 份） ——
app.post('/api/client-log', async (req, reply) => {
  const text = req.body?.text;
  if (typeof text !== 'string' || !text.trim()) return reply.code(400).send({ error: 'empty log' });
  fs.mkdirSync(clientLogDir, { recursive: true });
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `log-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.txt`;
  fs.writeFileSync(path.join(clientLogDir, name), text.slice(0, 200_000));
  const files = fs
    .readdirSync(clientLogDir)
    .filter((f) => f.startsWith('log-') && f.endsWith('.txt'))
    .sort()
    .reverse();
  for (const old of files.slice(20)) fs.unlinkSync(path.join(clientLogDir, old));
  return { ok: true, name };
});

await app.listen({ port: PORT, host: '0.0.0.0' });

const nets = os.networkInterfaces();
const lanIps = Object.values(nets)
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address);
console.log(`MyTime 同步服务已启动:`);
console.log(`  本机访问   http://localhost:${PORT}`);
if (lanIps.length) console.log(`  手机访问   http://${lanIps[0]}:${PORT}  (同一局域网)`);
console.log(`  访问密码   ${PASSWORD}${process.env.MYTIME_PASSWORD ? '' : '  (默认值，可用环境变量 MYTIME_PASSWORD 修改)'}`);
console.log(`  数据目录   ${process.env.DATA_DIR || path.join(__dirname, '..', 'data')}`);
