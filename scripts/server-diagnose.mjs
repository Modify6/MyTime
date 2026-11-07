// 服务器端诊断脚本（VPS 上以 root 运行）：复现同步 500 并输出错误详情
// 用法：sudo node scripts/server-diagnose.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const env = fs.readFileSync('/opt/mytime/server/.env', 'utf8');
const pass = env.match(/MYTIME_PASSWORD=(.*)/)?.[1]?.trim();
const port = env.match(/PORT=(.*)/)?.[1]?.trim() || '3128';

console.log('== 1. auth ==');
let token;
try {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass }),
  });
  console.log('auth status:', res.status);
  const j = await res.json();
  token = j.token;
  console.log('token:', token ? token.slice(0, 16) + '...' : 'NONE', j.error ? '| error: ' + j.error : '');
} catch (e) {
  console.log('auth 异常:', e.message);
  process.exit(1);
}

console.log('== 2. sync 复现（空请求） ==');
try {
  const res = await fetch(`http://127.0.0.1:${port}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ since: 0, changes: [] }),
  });
  console.log('sync status:', res.status);
  console.log('sync body:', (await res.text()).slice(0, 500));
} catch (e) {
  console.log('sync 异常:', e.message);
}

console.log('== 3. 带数据的 sync 复现（模拟一条推送） ==');
try {
  const res = await fetch(`http://127.0.0.1:${port}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      since: 0,
      changes: [
        {
          table: 'events',
          rows: [
            {
              id: 'diag-test-1',
              title: '诊断事件',
              categoryId: 'cat-work',
              startAt: Date.now() - 60000,
              endAt: Date.now(),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        },
      ],
    }),
  });
  console.log('sync-with-data status:', res.status);
  console.log('sync-with-data body:', (await res.text()).slice(0, 500));
} catch (e) {
  console.log('sync-data 异常:', e.message);
}

console.log('== 4. 数据库状态 ==');
try {
  const out = execSync(
    `node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/opt/mytime/server/data/mytime.db');for(const t of ['events','plans','planLogs']){try{const c=db.prepare('PRAGMA table_info('+t+')').all().map(x=>x.name);console.log(t+': '+c.join(','));}catch(e){console.log(t+': ERR '+e.message)}}console.log('counts:',JSON.stringify({events:db.prepare('SELECT COUNT(*) n FROM events').get().n,plans:db.prepare('SELECT COUNT(*) n FROM plans').get().n,planLogs:db.prepare('SELECT COUNT(*) n FROM planLogs').get().n}))"`,
    { encoding: 'utf8' }
  );
  console.log(out);
} catch (e) {
  console.log('DB 检查失败:', e.message);
}

console.log('== 5. 服务日志错误 ==');
try {
  console.log(execSync('journalctl -u mytime -n 40 --no-pager | grep -iE "error|reject|fail" | tail -10 || echo "(无错误行)"').toString());
} catch {
  console.log('（无错误行）');
}

console.log('== 诊断结束 —— 把以上全部输出发回 ==');
