#!/usr/bin/env node
// 迁移导出：把"git 承载不了"的一切打进一个私有目录，供拷到另一台电脑
// 用法：node scripts/migrate-export.mjs [输出目录]   （默认 <仓库上级>/mytime-migrate-export）
//
// 导出内容：
//   mytime.bundle     git 全量历史离线包（GitHub 不可达时也能完整克隆）
//   secrets/          .ssh-key 部署私钥、deploy/config、~/.ssh/mytime_deploy 与 config（mytime 别名）
//   server-data/      本地运行数据（存在才导；VPS 数据不在此列，无需迁移）
//   project-zcode/    项目内 .zcode/plans（计划模式文件）
//   zcode-cli/        ZCode 记忆（memories/projects）+ 会话数据库 db.sqlite*（全部对话记录）
//
// ⚠️ 含私钥与对话记录：只经私有通道转移（U 盘/加密网盘），绝不入库、不走公开渠道。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '..', 'mytime-migrate-export'));

const die = (m) => { console.error('[错误] ' + m); process.exit(1); };
const cp = (src, destDir) => {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, path.basename(src)));
  return true;
};
const cpDir = (src, destDir) => {
  if (!fs.existsSync(src)) return false;
  fs.cpSync(src, destDir, { recursive: true });
  return true;
};

if (OUT.startsWith(ROOT)) die('输出目录不能在仓库内（会混入 git / 下次 add -A 泄露私钥）');

// 只清空"导出产物"，保留目录里的工具件（一键 bat / migrate-run.mjs / migrate-import.mjs / 上次迁移源.txt）
for (const item of ['mytime.bundle', 'MANIFEST.txt', 'secrets', 'server-data', 'project-zcode', 'zcode-cli'])
  fs.rmSync(path.join(OUT, item), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const manifest = [];

// 1. git 全量历史离线包
execSync(`git bundle create "${path.join(OUT, 'mytime.bundle')}" --all`, { cwd: ROOT, stdio: 'pipe' });
manifest.push('mytime.bundle —— git 全量历史（含全部标签）');

// 2. 密钥与部署配置
if (cp(path.join(ROOT, '.ssh-key', 'id_ed25519'), path.join(OUT, 'secrets', 'ssh-key')) &&
    cp(path.join(ROOT, '.ssh-key', 'id_ed25519.pub'), path.join(OUT, 'secrets', 'ssh-key')))
  manifest.push('secrets/ssh-key/ —— 部署私钥/公钥（v4）');
if (cp(path.join(ROOT, 'deploy', 'config'), path.join(OUT, 'secrets')))
  manifest.push('secrets/config —— deploy/config（服务器地址/用户）');
if (cp(path.join(HOME, '.ssh', 'mytime_deploy'), path.join(OUT, 'secrets', 'ssh-copy')) &&
    cp(path.join(HOME, '.ssh', 'config'), path.join(OUT, 'secrets', 'ssh-copy')))
  manifest.push('secrets/ssh-copy/ —— ~/.ssh 副本与 mytime 主机别名');

// 3. 本地运行数据（桌面本地使用才有；VPS 数据在服务器上不用迁移）
if (cpDir(path.join(ROOT, 'server', 'data'), path.join(OUT, 'server-data')))
  manifest.push('server-data/ —— 本地 SQLite 与快照');

// 4. 项目内 ZCode 计划文件
if (cpDir(path.join(ROOT, '.zcode', 'plans'), path.join(OUT, 'project-zcode', 'plans')))
  manifest.push('project-zcode/plans —— 计划模式文件');

// 5. ZCode 记忆（全部项目，不只 MyTime）+ 会话数据库（本就包含全部对话）+ 桌面端项目列表
const memProjects = path.join(HOME, '.zcode', 'cli', 'memories', 'projects');
if (fs.existsSync(memProjects)) {
  const keys = fs.readdirSync(memProjects).filter((d) => fs.statSync(path.join(memProjects, d)).isDirectory());
  if (cpDir(memProjects, path.join(OUT, 'zcode-cli', 'memories', 'projects')) && keys.length)
    manifest.push(`zcode-cli/memories/projects —— AI 记忆（全部 ${keys.length} 个项目键：${keys.join(', ')}）`);
}
// 桌面端侧栏「项目」列表不在会话库里，而在 v2/setting.json 的 recentProjects——单独导出
if (cp(path.join(HOME, '.zcode', 'v2', 'setting.json'), path.join(OUT, 'zcode-cli', 'v2-setting.json')))
  manifest.push('zcode-cli/v2-setting.json —— 桌面端设置（含侧栏 recentProjects 项目列表，导入时只合并该项）');
let dbCopied = 0;
for (const f of ['db.sqlite', 'db.sqlite-shm', 'db.sqlite-wal'])
  if (cp(path.join(HOME, '.zcode', 'cli', 'db', f), path.join(OUT, 'zcode-cli', 'db'))) dbCopied++;
if (dbCopied) manifest.push(`zcode-cli/db/ —— 会话/对话记录数据库（${dbCopied} 个文件）`);

fs.writeFileSync(path.join(OUT, 'MANIFEST.txt'), manifest.join('\n') + '\n', 'utf8');

// 迁移中枢自维护：刷新还原脚本副本 + 记录本次源项目路径（供下次一键迁移自动定位）
cp(path.join(ROOT, 'scripts', 'migrate-import.mjs'), OUT);
fs.writeFileSync(path.join(OUT, '上次迁移源.txt'), ROOT + '\n', 'utf8');
manifest.push('migrate-import.mjs —— 还原脚本副本（一键还原使用）');
manifest.push('上次迁移源.txt —— 本次导出的项目路径');

console.log('导出完成 → ' + OUT + '\n');
for (const line of manifest) console.log('  ✓ ' + line);
if (fs.existsSync(path.join(OUT, 'zcode-cli', 'db', 'db.sqlite-wal')))
  console.log('\n⚠ 检测到 WAL 文件：ZCode 正在运行时导出，最近几句对话可能未合并进主库。\n  建议关闭 ZCode 后重跑本导出。');
console.log('\n⚠ 目录含私钥与全部对话记录：只走私有通道（U 盘/加密网盘），传输后删除中转副本。');
