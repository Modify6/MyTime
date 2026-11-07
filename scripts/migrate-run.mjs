#!/usr/bin/env node
// U 盘迁移中枢执行器（源文件在仓库；由 scripts/migrate-init-usb.mjs 安装到 U 盘，一键*.bat 调用）
//   export     —— MyTime 项目导出 + ZCode 全部记忆/对话（旧机，离开前）
//   export-zi  —— 上面全部 + robocopy 镜像整个 <zi 目录>（所有项目文件）
//   import     —— 还原 MyTime + ZCode 记忆/对话（新机，到达后）
//   import-zi  —— robocopy 回整个 zi 文件夹 + 上面全部
// 项目定位策略：上次迁移源.txt → 常见路径探测 → 交互输入（输入后记住）
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const USB = path.dirname(fileURLToPath(import.meta.url));
const LAST_SRC = path.join(USB, '上次迁移源.txt');
const LAST_DST = path.join(USB, '上次还原目标.txt');
const IMPORTER = path.join(USB, 'migrate-import.mjs');
const ZI_PROJECTS = path.join(USB, 'zi-projects');
const CANDIDATES = ['E:\\study\\zi\\MyTime', 'D:\\study\\zi\\MyTime', 'C:\\study\\zi\\MyTime'];
// zi 下已知的大目录：整拷时逐个交互确认（不确认就全拷，U 盘可能装不下）
const ZI_BIG_DIRS = ['auto-down-load', '7bvxhz-baidu-buyer'];
const ZI_EXCLUDE_DIRS = ['node_modules', '.gradle'];

const valid = (p) => p && fs.existsSync(path.join(p, 'scripts', 'migrate-export.mjs'));
const isRepo = (p) => p && fs.existsSync(path.join(p, '.git'));
const readFirst = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split(/\r?\n/)[0] : '');
const save = (f, v) => fs.writeFileSync(f, v + '\n', 'utf8');

async function ask(question, def) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(question)).trim();
  rl.close();
  return a || def || '';
}

async function locateProject() {
  const last = readFirst(LAST_SRC);
  for (const p of [last, ...CANDIDATES]) if (valid(p)) return p;
  console.log('未自动找到 MyTime 项目（检查过：' + [last, ...CANDIDATES].filter(Boolean).join(' , ') + '）');
  const ans = await ask('请输入项目根目录路径（如 E:\\study\\zi\\MyTime）：');
  if (!valid(ans)) {
    console.error('[错误] 该路径下没有 scripts/migrate-export.mjs，不是有效的 MyTime 项目');
    process.exit(1);
  }
  return path.resolve(ans);
}

async function locateTarget() {
  const last = readFirst(LAST_DST);
  for (const p of [last, ...CANDIDATES]) if (isRepo(p) || !fs.existsSync(p)) return p;
  console.log('未自动确定还原目标路径');
  const ans = await ask('请输入目标项目根目录路径（默认 E:\\study\\zi\\MyTime）：', 'E:\\study\\zi\\MyTime');
  return path.resolve(ans);
}

// robocopy 包装：退出码 0-7 均为成功（1=有文件复制），>=8 才是失败
function robocopy(from, to, extraExcludes = []) {
  const args = [from, to, '/E', '/MT:8', '/R:1', '/W:1', '/NFL', '/NDL', '/NP', '/XF', 'MyTime.apk'];
  for (const d of [...ZI_EXCLUDE_DIRS, ...extraExcludes]) args.push('/XD', d);
  console.log('[robocopy] ' + args.join(' '));
  const r = spawnSync('robocopy', args, { stdio: 'inherit' });
  if (r.status === null || r.status >= 8) {
    console.error(`[错误] robocopy 失败（退出码 ${r.status}）——常见原因：U 盘空间不足。可重跑并把大目录排除。`);
    process.exit(1);
  }
  console.log(`[完成] 文件夹同步完成（robocopy 退出码 ${r.status}，0-7 均为成功）。`);
}

// 标准 MyTime 导出（项目脚本）：含 ZCode 全部记忆/对话/密钥/本地数据
function runProjectExport(project) {
  console.log(`\n[迁移] 源项目：${project}\n[迁移] 导出目录：${USB}\n`);
  const r = spawnSync(process.execPath, [path.join(project, 'scripts', 'migrate-export.mjs'), USB], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

function runProjectImport(target) {
  console.log(`\n[还原] 导出目录：${USB}\n[还原] 目标项目：${target}\n`);
  const r = spawnSync(process.execPath, [IMPORTER, USB, '--to', target], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
  save(LAST_DST, target);
}

async function exportZi(zi) {
  const excludes = [];
  for (const d of ZI_BIG_DIRS) {
    if (fs.existsSync(path.join(zi, d))) {
      const a = await ask(`大目录 ${d}（可能有十几 GB）也要迁移吗？回车=包含，输 n=排除：`);
      if (a.toLowerCase() === 'n') excludes.push(d);
    }
  }
  console.log(`\n[zi 整拷] ${zi} → ${ZI_PROJECTS}`);
  robocopy(zi, ZI_PROJECTS, excludes);
}

async function importZi(zi) {
  if (!fs.existsSync(ZI_PROJECTS)) {
    console.error('[错误] U 盘上没有 zi-projects/ ——请先跑"一键迁移整个zi"做过整拷');
    process.exit(1);
  }
  console.log(`\n[zi 还原] ${ZI_PROJECTS} → ${zi}`);
  robocopy(ZI_PROJECTS, zi); // 默认不删除目标端多余文件，增量合并
}

const mode = process.argv[2] || '';

if (mode === 'export') {
  (async () => {
    const project = await locateProject();
    runProjectExport(project);
    console.log('\n[完成] 若 ZCode 刚才在运行：退出 ZCode 后重新双击"一键迁移"即拿到完整对话快照。');
    console.log('[提醒] 本 U 盘含私钥与全部对话记录：妥善保管，勿插来路不明的机器。');
  })();
} else if (mode === 'export-zi') {
  (async () => {
    const project = await locateProject();
    const zi = path.dirname(project);
    runProjectExport(project); // 先保 ZCode/MyTime 关键件（小而快，即使后面 robocopy 失败也不空手）
    await exportZi(zi);
    console.log('\n[完成] 全部项目文件 + ZCode 记忆/对话都已在本 U 盘。');
    console.log('[提醒] 本 U 盘含私钥与全部对话记录：妥善保管，勿插来路不明的机器。');
  })();
} else if (mode === 'import') {
  (async () => {
    if (!fs.existsSync(IMPORTER)) {
      console.error('[错误] 本目录缺少 migrate-import.mjs——请先在源机器上跑一次"一键迁移"');
      process.exit(1);
    }
    const target = await locateTarget();
    runProjectImport(target);
    console.log('\n[完成] 按脚本末尾的收尾清单执行（npm install / hooksPath / ssh 验证）后即可使用。');
  })();
} else if (mode === 'import-zi') {
  (async () => {
    if (!fs.existsSync(IMPORTER)) {
      console.error('[错误] 本目录缺少 migrate-import.mjs——请先在源机器上跑一次"一键迁移"');
      process.exit(1);
    }
    const project = await locateProject();
    const zi = path.dirname(project);
    await importZi(zi);          // 先恢复所有项目文件
    runProjectImport(project);   // 再还原 MyTime + ZCode 记忆/对话（会话库自动备份）
    console.log('\n[完成] 全部项目 + ZCode 会话已还原。按收尾清单 npm install 后即可使用。');
  })();
} else {
  console.log('用法：node migrate-run.mjs export|export-zi|import|import-zi（由 一键*.bat 调用）');
  process.exit(1);
}
