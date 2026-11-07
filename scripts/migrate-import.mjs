#!/usr/bin/env node
// 迁移导入：在新电脑上恢复 migrate-export.mjs 导出的内容
// 用法：node scripts/migrate-import.mjs <导出目录>
// 前置：新机已装 Node 22+ 与 Git；恢复会话数据库前先关闭 ZCode。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
const IN = path.resolve(process.argv[2] || '');
const die = (m) => { console.error('[错误] ' + m); process.exit(1); };

if (!IN || !fs.existsSync(IN)) die(`导出目录不存在：${IN}（用法：node scripts/migrate-import.mjs <导出目录>）`);
const has = (p) => fs.existsSync(p);
const cp = (src, dest) => {
  if (!has(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
};
const cpDir = (src, dest) => {
  if (!has(src)) return false;
  fs.cpSync(src, dest, { recursive: true });
  return true;
};

console.log('== MyTime 迁移导入 ==\n');

// 1. 项目本体：已有仓库则拉最新；没有则优先 GitHub 克隆，失败用离线 bundle
if (has(path.join(ROOT, '.git'))) {
  console.log('1. 仓库已存在，拉取最新...');
  try { execSync('git pull origin master', { cwd: ROOT, stdio: 'inherit' }); }
  catch { console.log('   pull 失败（GitHub 网络），稍后手动 git pull 重试'); }
} else if (has(path.join(IN, 'mytime.bundle'))) {
  console.log('1. 从离线包克隆仓库...');
  execSync(`git clone "${path.join(IN, 'mytime.bundle')}" -b master "${ROOT}"`, { stdio: 'inherit' });
  try { execSync('git remote add origin https://github.com/Modify6/MyTime.git', { cwd: ROOT }); } catch {}
  try { execSync('git fetch origin && git branch --set-upstream-to=origin/master master', { cwd: ROOT }); } catch {}
} else {
  console.log('1. 从 GitHub 克隆仓库...');
  execSync(`git clone https://github.com/Modify6/MyTime.git "${ROOT}"`, { stdio: 'inherit' });
}

// 2. 密钥与部署配置
console.log('\n2. 恢复密钥与部署配置...');
let restored = 0;
for (const f of ['id_ed25519', 'id_ed25519.pub'])
  if (cp(path.join(IN, 'secrets', 'ssh-key', f), path.join(ROOT, '.ssh-key', f))) restored++;
if (cp(path.join(IN, 'secrets', 'config'), path.join(ROOT, 'deploy', 'config'))) restored++;
if (cp(path.join(IN, 'secrets', 'ssh-copy', 'mytime_deploy'), path.join(HOME, '.ssh', 'mytime_deploy'))) restored++;
// 主机别名：已有 config 则只在缺 mytime 主机时追加，避免覆盖用户自己的 SSH 配置
const sshCfgSrc = path.join(IN, 'secrets', 'ssh-copy', 'config');
const sshCfgDst = path.join(HOME, '.ssh', 'config');
if (has(sshCfgSrc)) {
  fs.mkdirSync(path.dirname(sshCfgDst), { recursive: true });
  if (!has(sshCfgDst)) {
    fs.copyFileSync(sshCfgSrc, sshCfgDst);
    restored++;
  } else if (!fs.readFileSync(sshCfgDst, 'utf8').includes('Host mytime')) {
    fs.appendFileSync(sshCfgDst, '\n' + fs.readFileSync(sshCfgSrc, 'utf8'));
    console.log('   已把 mytime 主机别名追加到现有 ~/.ssh/config');
    restored++;
  }
}
// Windows ACL 收紧私钥（MSYS chmod 在 Windows 盘无效）
const keyCopy = path.join(HOME, '.ssh', 'mytime_deploy');
if (has(keyCopy) && process.platform === 'win32') {
  const r = spawnSync('icacls', [keyCopy, '/inheritance:r', '/grant:r', `${os.userInfo().username}:F`], { shell: true });
  console.log(r.status === 0 ? '   已用 icacls 收紧私钥 ACL' : '   [!] icacls 失败，手动执行: icacls <key> /inheritance:r /grant:r "<用户>:F"');
}
console.log(`   恢复 ${restored} 项`);

// 3. 本地运行数据
if (cpDir(path.join(IN, 'server-data'), path.join(ROOT, 'server', 'data')))
  console.log('\n3. 已恢复本地 server/data（SQLite 与快照）');

// 4. 项目内 ZCode 计划文件
if (cpDir(path.join(IN, 'project-zcode', 'plans'), path.join(ROOT, '.zcode', 'plans')))
  console.log('4. 已恢复 .zcode/plans');

// 5. ZCode 记忆：目标项目键随路径变化——优先写入已存在的 mytime-* 键目录
console.log('\n5. 恢复 ZCode 记忆与会话记录...');
const srcMem = path.join(IN, 'zcode-cli', 'memories', 'projects');
const dstMemRoot = path.join(HOME, '.zcode', 'cli', 'memories', 'projects');
if (has(srcMem)) {
  fs.mkdirSync(dstMemRoot, { recursive: true });
  const srcDirs = fs.readdirSync(srcMem).filter((d) => d.startsWith('mytime-'));
  let dstDirs = fs.existsSync(dstMemRoot) ? fs.readdirSync(dstMemRoot).filter((d) => d.startsWith('mytime-')) : [];
  const targets = dstDirs.length ? dstDirs : srcDirs; // 新机还没生成键目录时沿用原键名（同路径部署时正好匹配）
  for (const t of targets)
    for (const s of srcDirs)
      cpDir(path.join(srcMem, s), path.join(dstMemRoot, t));
  console.log(`   记忆已写入 ${targets.join(', ')}${dstDirs.length ? '' : '（沿用原键名；若新机项目路径不同，打开 ZCode 后把该目录内容挪到新生成的 mytime-* 键目录）'}`);
} else {
  console.log('   [跳过] 导出包里没有记忆数据');
}

// 6. 会话数据库（对话记录）：关闭 ZCode 后恢复；已存在的先备份
const srcDb = path.join(IN, 'zcode-cli', 'db');
const dstDb = path.join(HOME, '.zcode', 'cli', 'db');
if (has(path.join(srcDb, 'db.sqlite'))) {
  if (has(path.join(dstDb, 'db.sqlite'))) {
    const bak = path.join(HOME, '.zcode', 'backup-migrate-' + Date.now());
    fs.mkdirSync(bak, { recursive: true });
    for (const f of ['db.sqlite', 'db.sqlite-shm', 'db.sqlite-wal'])
      if (has(path.join(dstDb, f)))
        fs.copyFileSync(path.join(dstDb, f), path.join(bak, f));
    console.log('   已备份新机现有会话库到 ' + bak);
  }
  fs.mkdirSync(dstDb, { recursive: true });
  for (const f of ['db.sqlite', 'db.sqlite-shm', 'db.sqlite-wal'])
    cp(path.join(srcDb, f), path.join(dstDb, f));
  console.log('   会话数据库已恢复（全部对话记录）');
  console.log('   [!] 若 ZCode 正在运行：关闭后重跑本脚本，否则文件被锁/覆盖');
} else {
  console.log('   [跳过] 导出包里没有会话数据库');
}

// 7. 收尾清单
console.log(`
== 完成。收尾清单 ==
1. npm install && npm install --prefix server && npm install --prefix web
2. git config core.hooksPath .githooks          # 启用提交闸门与单测钩子
3. ssh mytime "echo ok"                          # 验证 SSH（需 Windows OpenSSH，见 deploy/README.md）
4. 测试：npm --prefix web test
5. 日常启动：start.bat（生产）/ dev.bat（开发）
`);
