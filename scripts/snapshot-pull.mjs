// 快照异地化：从同步服务器拉取最新快照到本地 backups-local/ 目录
// 用法：
//   node scripts/snapshot-pull.mjs --url https://your-server --password xxx [--keep 10]
// 或带交互提示（缺参时询问）：
//   node scripts/snapshot-pull.mjs
// 建议配 Windows 任务计划每天跑一次；双击快照拉取.bat 可交互执行
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w):/, '$1:'));
const OUT_DIR = path.join(ROOT, 'backups-local');

function parseArgs() {
  const args = {};
  const rest = process.argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--url') args.url = rest[++i];
    else if (rest[i] === '--password') args.password = rest[++i];
    else if (rest[i] === '--keep') args.keep = Number(rest[++i]);
  }
  return args;
}

async function ask(rl, q, fallback) {
  const a = (await rl.question(q)).trim();
  return a || fallback;
}

async function main() {
  const args = parseArgs();
  const rl = readline.createInterface({ input, output });
  const url = (args.url || (await ask(rl, '服务器地址（如 https://sync.example.com）：'))).replace(/\/+$/, '');
  const password = args.password || (await ask(rl, '访问密码：'));
  const keep = args.keep > 0 ? args.keep : 10;
  rl.close();
  if (!url || !password) {
    console.error('[错误] 需要服务器地址与密码');
    process.exit(1);
  }

  // 1. 登录取 token（与 App 同一鉴权）
  const loginRes = await fetch(`${url}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!loginRes.ok) {
    console.error(`[错误] 登录失败(${loginRes.status})——检查地址与密码`);
    process.exit(1);
  }
  const { token } = await loginRes.json();
  const auth = { Authorization: `Bearer ${token}` };

  // 2. 拉快照列表
  const listRes = await fetch(`${url}/api/backup/list`, { headers: auth });
  if (!listRes.ok) {
    console.error(`[错误] 获取快照列表失败(${listRes.status})`);
    process.exit(1);
  }
  const { backups } = await listRes.json();
  if (!backups?.length) {
    console.log('服务器还没有快照——先在 App 里开一次「立即备份快照」。');
    process.exit(0);
  }

  // 3. 下载本地缺失的快照（最新在前）
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let downloaded = 0;
  for (const b of backups) {
    const dest = path.join(OUT_DIR, b.name);
    if (fs.existsSync(dest)) continue;
    const fileRes = await fetch(`${url}/api/backup/file?name=${encodeURIComponent(b.name)}`, { headers: auth });
    if (!fileRes.ok) {
      console.error(`[跳过] ${b.name} 下载失败(${fileRes.status})`);
      continue;
    }
    fs.writeFileSync(dest, Buffer.from(await fileRes.arrayBuffer()));
    downloaded++;
    console.log(`✓ ${b.name}（${Math.round(b.size / 1024)}KB）`);
  }

  // 4. 本地只保留最近 keep 份
  const local = fs.readdirSync(OUT_DIR).filter((f) => /^backup-\d{8}-\d{6}\.json$/.test(f)).sort().reverse();
  for (const old of local.slice(keep)) {
    fs.unlinkSync(path.join(OUT_DIR, old));
    console.log(`清理旧快照 ${old}`);
  }

  console.log(`\n完成：本地已有 ${Math.min(local.length, keep)} 份快照（backups-local/），本次新拉 ${downloaded} 份。`);
}

main().catch((e) => {
  console.error(`[错误] ${e?.cause?.code || e?.message || e}`);
  process.exit(1);
});
