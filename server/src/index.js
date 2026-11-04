// MyTime 同步服务：鉴权 + 增量同步 + 数据导出 + 生产模式下静态托管 web/dist
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, pushChanges, pullSince, exportAll, TABLES } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3128);
const PASSWORD = process.env.MYTIME_PASSWORD || 'mytime123';
// 由密码派生 token，服务端无会话状态；改密码即全部失效
const TOKEN = crypto.createHmac('sha256', PASSWORD).update('mytime-token-v1').digest('hex');

const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 });
const db = openDb(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

await app.register(cors, { origin: true });

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
app.get('/api/export', async () => exportAll(db));

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
