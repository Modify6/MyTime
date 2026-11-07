#!/usr/bin/env node
// 迁移导入：在新电脑上恢复 migrate-export.mjs 导出的内容
// 用法：node migrate-import.mjs <导出目录> [--to <项目根目录>]
//   --to：目标项目路径（U 盘上的 migrate-run.mjs 会传入）；缺省=本脚本所在仓库的上级推断
// 前置：新机已装 Node 22+ 与 Git；恢复会话数据库前先关闭 ZCode。
// 每步独立容错 + 全量日志写入迁移目录（失败后把 U 盘拿回来即可远程诊断）。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MIGRATE_VERSION = '3';
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

// —— 日志：控制台 ✓/✗ + 时间戳全量写入迁移目录的日志文件（随 U 盘走，可回传诊断）——
let LOG_PATH = '';
function startLog(dir, tag) {
  try {
    if (!dir || !fs.existsSync(dir)) return;
    const old = fs.readdirSync(dir).filter((f) => f.startsWith('迁移日志-') && f.endsWith('.log')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - 19))) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    LOG_PATH = path.join(dir, `迁移日志-${tag}-${stamp}.log`);
    fs.appendFileSync(LOG_PATH, `# MyTime 迁移日志 v${MIGRATE_VERSION} tag=${tag}\n# node=${process.version} os=${os.type()} ${os.release()}\n# 导出目录=${IN}\n# 目标项目=${ROOT}\n# ZCode运行中=${isLocked(path.join(HOME, '.zcode', 'cli', 'db', 'db.sqlite')) ? '是（会话库将无法恢复！）' : '否'}\n\n`);
  } catch {}
}
function log(msg) {
  console.log(msg);
  if (LOG_PATH) { try { fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${String(msg)}\n`); } catch {} }
}
function logErr(msg, e) {
  log(`${msg} :: ${String(e).split('\n')[0]}`);
  if (LOG_PATH && e?.stack) { try { fs.appendFileSync(LOG_PATH, e.stack + '\n'); } catch {} }
}

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

// 分步结果收集：任何失败都记入 results，最后统一汇总 + 修复指引
const results = [];
const t0 = Date.now();
const ok = (label) => { results.push(['✓', label]); log(`   ✓ ${label}`); };
const fail = (label, err, hint = '') => { results.push(['✗', label + ' —— ' + err, hint]); log(`   ✗ ${label}：${err}${hint ? '\n     ↳ ' + hint : ''}`); };

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

startLog(IN, 'import');
log('== MyTime 迁移导入开始 ==');
log(`目标项目（--to）：${TO || '（未传，按脚本位置推断）'}`);
log(`实际目标根：${ROOT}`);

// 1. 项目本体：已有仓库则拉最新；没有则优先 GitHub 克隆，失败用离线 bundle
log('\n1. 项目代码');
try {
  if (has(path.join(ROOT, '.git'))) {
    log('   仓库已存在，尝试 git pull ...');
    try { execSync('git pull origin master', { cwd: ROOT, stdio: 'pipe' }); ok('仓库已存在，已拉取最新'); }
    catch (e) { fail('git pull（GitHub 网络）', String(e).split('\n')[0], '稍后手动 git pull 重试；项目文件已在，不影响使用'); }
  } else if (has(path.join(IN, 'mytime.bundle'))) {
    log('   从离线包克隆 ...');
    execSync(`git clone "${path.join(IN, 'mytime.bundle')}" -b master "${ROOT}"`, { stdio: 'pipe' });
    try { execSync('git remote add origin https://github.com/Modify6/MyTime.git', { cwd: ROOT }); } catch {}
    try { execSync('git fetch origin && git branch --set-upstream-to=origin/master master', { cwd: ROOT }); } catch {}
    ok('从离线包克隆仓库 ' + ROOT);
  } else {
    log('   从 GitHub 克隆 ...');
    execSync(`git clone https://github.com/Modify6/MyTime.git "${ROOT}"`, { stdio: 'pipe' });
    ok('从 GitHub 克隆仓库 ' + ROOT);
  }
} catch (e) { fail('项目代码恢复', String(e).split('\n')[0], '检查网络后重跑，或手动 git clone'); }

// 2. 密钥与部署配置
log('\n2. 密钥与部署配置');
try {
  let restored = 0;
  for (const f of ['id_ed25519', 'id_ed25519.pub'])
    if (cp(path.join(IN, 'secrets', 'ssh-key', f), path.join(ROOT, '.ssh-key', f))) { restored++; log(`   - .ssh-key/${f}`); }
  if (cp(path.join(IN, 'secrets', 'config'), path.join(ROOT, 'deploy', 'config'))) { restored++; log('   - deploy/config'); }
  if (cp(path.join(IN, 'secrets', 'ssh-copy', 'mytime_deploy'), path.join(HOME, '.ssh', 'mytime_deploy'))) { restored++; log('   - ~/.ssh/mytime_deploy'); }
  // 主机别名：已有 config 则只在缺 mytime 主机时追加，避免覆盖用户自己的 SSH 配置
  const sshCfgSrc = path.join(IN, 'secrets', 'ssh-copy', 'config');
  const sshCfgDst = path.join(HOME, '.ssh', 'config');
  if (has(sshCfgSrc)) {
    fs.mkdirSync(path.dirname(sshCfgDst), { recursive: true });
    if (!has(sshCfgDst)) { fs.copyFileSync(sshCfgSrc, sshCfgDst); restored++; log('   - ~/.ssh/config（新建）'); }
    else if (!fs.readFileSync(sshCfgDst, 'utf8').includes('Host mytime')) {
      fs.appendFileSync(sshCfgDst, '\n' + fs.readFileSync(sshCfgSrc, 'utf8'));
      log('   已把 mytime 主机别名追加到现有 ~/.ssh/config');
      restored++;
    }
  }
  // Windows ACL 收紧私钥（MSYS chmod 在 Windows 盘无效）
  const keyCopy = path.join(HOME, '.ssh', 'mytime_deploy');
  if (has(keyCopy) && process.platform === 'win32') {
    const r = spawnSync('icacls', [keyCopy, '/inheritance:r', '/grant:r', `${os.userInfo().username}:F`], { shell: true });
    log('   icacls 收紧私钥 ACL：' + (r.status === 0 ? '成功' : `失败（退出码 ${r.status}）`));
  }
  restored ? ok(`密钥与配置恢复 ${restored} 项`) : fail('密钥与配置', '导出包里没有 secrets/ 数据');
} catch (e) { logErr('   ✗ 密钥与配置恢复异常', e); fail('密钥与配置恢复', String(e).split('\n')[0]); }

// 3. 本地运行数据 + 4. 项目内 ZCode 计划文件
log('\n3. 本地数据与计划文件');
let misc = 0;
if (cpDir(path.join(IN, 'server-data'), path.join(ROOT, 'server', 'data'))) { ok('server/data（SQLite 与快照）'); misc++; }
if (cpDir(path.join(IN, 'project-zcode', 'plans'), path.join(ROOT, '.zcode', 'plans'))) { ok('.zcode/plans（计划模式文件）'); misc++; }
if (!misc) log('   （导出包中没有本地数据/计划文件，跳过）');

// 4. ZCode 记忆：导出包含全部项目的记忆；逐项目键合并（覆盖同名文件、保留目标已有其他文件）
log('\n4. ZCode 记忆（全部项目）');
const srcMem = path.join(IN, 'zcode-cli', 'memories', 'projects');
const dstMemRoot = path.join(HOME, '.zcode', 'cli', 'memories', 'projects');
if (has(srcMem)) {
  try {
    const srcDirs = fs.readdirSync(srcMem);
    if (srcDirs.length) {
      fs.mkdirSync(dstMemRoot, { recursive: true });
      // 键名由项目路径派生——同路径迁移时键名一致，直接按名合并（覆盖同名文件、保留目标其他文件）
      for (const s of srcDirs) {
        cpDir(path.join(srcMem, s), path.join(dstMemRoot, s));
        log(`   - 项目键 ${s}`);
      }
      ok(`全部项目记忆已恢复（${srcDirs.length} 个项目键：${srcDirs.join(', ')}）`);
    } else log('   （导出包记忆目录为空，跳过）');
  } catch (e) { logErr('   ✗ 记忆恢复异常', e); fail('记忆恢复', String(e).split('\n')[0]); }
} else log('   （导出包里没有记忆数据，跳过）');

// 5. 桌面端设置：只合并 recentProjects（侧栏项目列表）——不覆盖新机其他设置
log('\n5. 桌面端项目列表（v2/setting.json 的 recentProjects）');
const v2Src = path.join(IN, 'zcode-cli', 'v2-setting.json');
const v2Dst = path.join(HOME, '.zcode', 'v2', 'setting.json');
if (has(v2Src)) {
  try {
    fs.mkdirSync(path.dirname(v2Dst), { recursive: true });
    const srcList = JSON.parse(fs.readFileSync(v2Src, 'utf8')).recentProjects || [];
    if (!srcList.length) log('   （导出包设置里没有项目列表，跳过）');
    else if (!has(v2Dst)) {
      fs.copyFileSync(v2Src, v2Dst);
      ok(`桌面端项目列表已恢复（${srcList.length} 个项目）`);
    } else {
      // 合并：源列表在前、目标已有的排后去重；其余字段保持目标机现状
      const dstCfg = JSON.parse(fs.readFileSync(v2Dst, 'utf8'));
      const before = (dstCfg.recentProjects || []).length;
      const dstList = dstCfg.recentProjects || [];
      dstCfg.recentProjects = [...new Set([...srcList, ...dstList])];
      fs.copyFileSync(v2Dst, v2Dst + '.bak-migrate'); // 留底
      fs.writeFileSync(v2Dst, JSON.stringify(dstCfg, null, 2), 'utf8');
      const added = dstCfg.recentProjects.length - dstList.length;
      ok(`桌面端项目列表已合并（原 ${before} 个，新增 ${added} 个，总数 ${dstCfg.recentProjects.length}；原文件留底 .bak-migrate）`);
      log('   合并后列表：' + dstCfg.recentProjects.join(' | '));
    }
  } catch (e) { logErr('   ✗ 桌面端项目列表异常', e); fail('桌面端项目列表', String(e).split('\n')[0], '可手动把 zcode-cli/v2-setting.json 的 recentProjects 抄进新机同名文件'); }
} else log('   （导出包里没有桌面端设置，跳过——请刷新 U 盘导出包后重试）');

// 6. 会话数据库（全部对话记录）：必须先关闭 ZCode；目标已有库先备份
log('\n6. ZCode 会话数据库（全部对话记录）');
const srcDb = path.join(IN, 'zcode-cli', 'db');
const dstDb = path.join(HOME, '.zcode', 'cli', 'db');
const DB_FILES = ['db.sqlite', 'db.sqlite-shm', 'db.sqlite-wal'];
if (has(path.join(srcDb, 'db.sqlite'))) {
  const dstMain = path.join(dstDb, 'db.sqlite');
  log(`   锁检测 ${dstMain}：${isLocked(dstMain) ? '被占用' : '空闲'}`);
  if (isLocked(dstMain)) {
    fail('会话数据库恢复', '目标文件被占用（ZCode 正在运行）',
      '请完全退出 ZCode（含托盘/后台进程）后，重新双击「一键还原」重试');
  } else {
    try {
      if (has(dstMain)) {
        const bak = path.join(HOME, '.zcode', 'backup-migrate-' + Date.now());
        fs.mkdirSync(bak, { recursive: true });
        for (const f of DB_FILES) if (has(path.join(dstDb, f))) fs.copyFileSync(path.join(dstDb, f), path.join(bak, f));
        log('   已备份新机现有会话库 → ' + bak);
      }
      fs.mkdirSync(dstDb, { recursive: true });
      let copied = 0;
      for (const f of DB_FILES)
        if (cp(path.join(srcDb, f), path.join(dstDb, f))) {
          copied++;
          log(`   - ${f}（${(fs.statSync(path.join(dstDb, f)).size / 1024 / 1024).toFixed(1)} MB）`);
        }
      copied ? ok(`会话数据库已恢复（${copied} 个文件，全部对话记录）`)
             : fail('会话数据库恢复', '拷贝失败（源文件存在但一个都没拷上）');
    } catch (e) {
      const msg = String(e);
      logErr('   ✗ 会话数据库异常', e);
      fail('会话数据库恢复', msg.split('\n')[0],
        ['EBUSY', 'EPERM', 'EACCES'].some((c) => msg.includes(c))
          ? '请完全退出 ZCode 后重新双击「一键还原」重试'
          : '检查 ~/.zcode/cli/db 目录权限');
    }
  }
} else log('   （导出包里没有会话数据库，跳过）');

// 7. 汇总 + 收尾清单
const bad = results.filter(([m]) => m === '✗');
log(`\n== 还原结果 ==（耗时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
for (const [mark, label] of results) log(`  ${mark} ${label}`);
if (bad.length) {
  log(`\n共 ${bad.length} 项失败——按上面 ↳ 提示修复后重新双击「一键还原」即可（已成功的步骤会幂等重跑）。`);
  log(`本日志：${LOG_PATH}（拿回源机器即可远程诊断）`);
  process.exit(1);
}
log(`
== 完成。收尾清单 ==
1. npm install && npm install --prefix server && npm install --prefix web   （node_modules 不随迁移走）
2. git config core.hooksPath .githooks          # 启用提交闸门与单测钩子
3. ssh mytime "echo ok"                          # 验证 SSH（需 Windows OpenSSH，见 deploy/README.md）
4. 测试：npm --prefix web test
5. 打开 ZCode：会话列表应出现全部历史对话；zi 下其他项目打开对应文件夹即可（记忆与侧栏项目列表已就位）
6. 日常启动：start.bat（生产）/ dev.bat（开发）
`);
log(`本日志：${LOG_PATH}`);
