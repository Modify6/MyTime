#!/usr/bin/env node
// 迁移导入：在新电脑上恢复 migrate-export.mjs 导出的内容
// 用法：node migrate-import.mjs <导出目录> [--to <项目根目录>]
//   --to：目标项目路径（U 盘上的 migrate-run.mjs 会传入）；缺省=本脚本所在仓库的上级推断
// 前置：新机已装 Node 22+ 与 Git；恢复会话数据库前先关闭 ZCode。
// 每步独立容错并输出 ✓/✗ 汇总——任何一步失败都不中断其他步骤，最后给出明确的修复指引。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const toIdx = argv.indexOf('--to');
const TO = toIdx >= 0 ? path.resolve(argv[toIdx + 1] || '') : null;
const rest = argv.filter((a, i) => a !== '--to' && i !== toIdx + 1);
const IN = path.resolve(rest[0] || '');
const die = (m) => { console.error('[错误] ' + m); process.exit(1); };

if (!IN || !fs.existsSync(IN)) die(`导出目录不存在：${IN}（用法：node migrate-import.mjs <导出目录> [--to <项目根目录>]）`);
// 目标项目根：优先 --to；否则按脚本位置推断（仓库内运行时 = scripts 的上级；U 盘副本场景必须传 --to）
const ROOT = TO || path.resolve(SELF_DIR, '..');
const HOME = os.homedir();

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

// 分步结果收集：任何失败都记入 errors，最后统一汇总 + 修复指引
const results = [];
const ok = (label) => { results.push(['✓', label]); console.log(`   ✓ ${label}`); };
const fail = (label, err, hint = '') => { results.push(['✗', label + ' —— ' + err, hint]); console.log(`   ✗ ${label}：${err}${hint ? '\n     ↳ ' + hint : ''}`); };

// 目标文件被占用检测（Windows：ZCode 运行时 db 文件锁死，copyFileSync 会 EBUSY/EPERM）
function isLocked(p) {
  if (!has(p)) return false;
  try {
    const fd = fs.openSync(p, 'r+');
    fs.closeSync(fd);
    return false;
  } catch (e) {
    return ['EBUSY', 'EPERM', 'EACCES'].some((c) => String(e).includes(c));
  }
}

console.log('== MyTime 迁移导入 ==\n');

// 1. 项目本体：已有仓库则拉最新；没有则优先 GitHub 克隆，失败用离线 bundle
console.log('1. 项目代码');
try {
  if (has(path.join(ROOT, '.git'))) {
    try { execSync('git pull origin master', { cwd: ROOT, stdio: 'inherit' }); ok('仓库已存在，已拉取最新'); }
    catch (e) { fail('git pull（GitHub 网络）', String(e).split('\n')[0], '稍后手动 git pull 重试；项目文件已在，不影响使用'); }
  } else if (has(path.join(IN, 'mytime.bundle'))) {
    execSync(`git clone "${path.join(IN, 'mytime.bundle')}" -b master "${ROOT}"`, { stdio: 'inherit' });
    try { execSync('git remote add origin https://github.com/Modify6/MyTime.git', { cwd: ROOT }); } catch {}
    try { execSync('git fetch origin && git branch --set-upstream-to=origin/master master', { cwd: ROOT }); } catch {}
    ok('从离线包克隆仓库 ' + ROOT);
  } else {
    execSync(`git clone https://github.com/Modify6/MyTime.git "${ROOT}"`, { stdio: 'inherit' });
    ok('从 GitHub 克隆仓库 ' + ROOT);
  }
} catch (e) { fail('项目代码恢复', String(e).split('\n')[0], '检查网络后重跑，或手动 git clone'); }

// 2. 密钥与部署配置
console.log('\n2. 密钥与部署配置');
try {
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
    if (!has(sshCfgDst)) { fs.copyFileSync(sshCfgSrc, sshCfgDst); restored++; }
    else if (!fs.readFileSync(sshCfgDst, 'utf8').includes('Host mytime')) {
      fs.appendFileSync(sshCfgDst, '\n' + fs.readFileSync(sshCfgSrc, 'utf8'));
      console.log('   已把 mytime 主机别名追加到现有 ~/.ssh/config');
      restored++;
    }
  }
  // Windows ACL 收紧私钥（MSYS chmod 在 Windows 盘无效）
  const keyCopy = path.join(HOME, '.ssh', 'mytime_deploy');
  if (has(keyCopy) && process.platform === 'win32') {
    const r = spawnSync('icacls', [keyCopy, '/inheritance:r', '/grant:r', `${os.userInfo().username}:F`], { shell: true });
    if (r.status !== 0) console.log('   [!] icacls 失败，手动执行: icacls <key> /inheritance:r /grant:r "<用户>:F"');
  }
  restored ? ok(`密钥与配置恢复 ${restored} 项`) : fail('密钥与配置', '导出包里没有 secrets/ 数据');
} catch (e) { fail('密钥与配置恢复', String(e).split('\n')[0]); }

// 3. 本地运行数据 + 4. 项目内 ZCode 计划文件
console.log('\n3. 本地数据与计划文件');
let misc = 0;
if (cpDir(path.join(IN, 'server-data'), path.join(ROOT, 'server', 'data'))) { ok('server/data（SQLite 与快照）'); misc++; }
if (cpDir(path.join(IN, 'project-zcode', 'plans'), path.join(ROOT, '.zcode', 'plans'))) { ok('.zcode/plans（计划模式文件）'); misc++; }
if (!misc) console.log('   （导出包中没有本地数据/计划文件，跳过）');

// 5. ZCode 记忆：导出包含全部项目的记忆；逐项目键合并（覆盖同名文件、保留目标已有其他文件）
console.log('\n4. ZCode 记忆（全部项目）');
const srcMem = path.join(IN, 'zcode-cli', 'memories', 'projects');
const dstMemRoot = path.join(HOME, '.zcode', 'cli', 'memories', 'projects');
if (has(srcMem)) {
  try {
    const srcDirs = fs.readdirSync(srcMem);
    if (srcDirs.length) {
      fs.mkdirSync(dstMemRoot, { recursive: true });
      // 键名由项目路径派生——同路径迁移时键名一致，直接按名合并（覆盖同名文件、保留目标其他文件）
      for (const s of srcDirs) cpDir(path.join(srcMem, s), path.join(dstMemRoot, s));
      ok(`全部项目记忆已恢复（${srcDirs.length} 个项目键：${srcDirs.join(', ')}）`);
    } else {
      console.log('   （导出包记忆目录为空，跳过）');
    }
  } catch (e) { fail('记忆恢复', String(e).split('\n')[0]); }
} else {
  console.log('   （导出包里没有记忆数据，跳过）');
}

// 6. 会话数据库（全部对话记录）：必须先关闭 ZCode；目标已有库先备份
console.log('\n5. ZCode 会话数据库（全部对话记录）');
const srcDb = path.join(IN, 'zcode-cli', 'db');
const dstDb = path.join(HOME, '.zcode', 'cli', 'db');
const DB_FILES = ['db.sqlite', 'db.sqlite-shm', 'db.sqlite-wal'];
if (has(path.join(srcDb, 'db.sqlite'))) {
  const dstMain = path.join(dstDb, 'db.sqlite');
  if (isLocked(dstMain)) {
    fail('会话数据库恢复', '目标文件被占用（ZCode 正在运行）',
      '请完全退出 ZCode（含托盘/后台进程）后，重新双击「一键还原」重试');
  } else {
    try {
      if (has(dstMain)) {
        const bak = path.join(HOME, '.zcode', 'backup-migrate-' + Date.now());
        fs.mkdirSync(bak, { recursive: true });
        for (const f of DB_FILES) if (has(path.join(dstDb, f))) fs.copyFileSync(path.join(dstDb, f), path.join(bak, f));
        console.log('   已备份新机现有会话库 → ' + bak);
      }
      fs.mkdirSync(dstDb, { recursive: true });
      let copied = 0;
      for (const f of DB_FILES) if (cp(path.join(srcDb, f), path.join(dstDb, f))) copied++;
      copied ? ok(`会话数据库已恢复（${copied} 个文件，全部对话记录）`) : fail('会话数据库恢复', '拷贝失败');
    } catch (e) {
      const msg = String(e);
      fail('会话数据库恢复', msg.split('\n')[0],
        ['EBUSY', 'EPERM', 'EACCES'].some((c) => msg.includes(c))
          ? '请完全退出 ZCode 后重新双击「一键还原」重试'
          : '检查 ~/.zcode/cli/db 目录权限');
    }
  }
} else {
  console.log('   （导出包里没有会话数据库，跳过）');
}

// 7. 汇总 + 收尾清单
const bad = results.filter(([m]) => m === '✗');
console.log('\n== 还原结果 ==');
for (const [mark, label, hint] of results) console.log(`  ${mark} ${label}${hint ? '' : ''}`);
if (bad.length) {
  console.log(`\n共 ${bad.length} 项失败——按上面 ↳ 提示修复后重新双击「一键还原」即可（已成功的步骤会幂等重跑）。`);
  process.exit(1);
}
console.log(`
== 完成。收尾清单 ==
1. npm install && npm install --prefix server && npm install --prefix web   （node_modules 不随迁移走）
2. git config core.hooksPath .githooks          # 启用提交闸门与单测钩子
3. ssh mytime "echo ok"                          # 验证 SSH（需 Windows OpenSSH，见 deploy/README.md）
4. 测试：npm --prefix web test
5. 打开 ZCode：会话列表应出现全部历史对话；zi 下其他项目打开对应文件夹即可（记忆已就位）
6. 日常启动：start.bat（生产）/ dev.bat（开发）
`);
