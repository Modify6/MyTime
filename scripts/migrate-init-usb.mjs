#!/usr/bin/env node
// 把迁移工具件安装到 U 盘目录（U 盘上的工具件全部由本脚本生成/刷新——源在仓库，插拔无损）
// 用法：node scripts/migrate-init-usb.mjs <U盘迁移目录>   （如 I:\E\agent迁移\zcode迁移目录）
// 安装内容：4 个一键 bat（ASCII 内容，防 GBK 坑）+ migrate-run.mjs（仓库最新版）+ 说明.txt
// 之后每次在该 U 盘跑"一键迁移"，migrate-export 会自动刷新其中的 migrate-import.mjs 副本
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || '');
const die = (m) => { console.error('[错误] ' + m); process.exit(1); };

if (!OUT) die('用法：node scripts/migrate-init-usb.mjs <U盘迁移目录>');
if (OUT.startsWith(ROOT)) die('安装目录不能在仓库内');

fs.mkdirSync(OUT, { recursive: true });

const bat = (comment) =>
  '@echo off\r\n' +
  `rem ${comment}\r\n` +
  'rem Full guide: MyTime/docs/migration.md (Chinese)\r\n' +
  'cd /d "%~dp0"\r\n' +
  'where node >nul 2>nul\r\n' +
  'if errorlevel 1 (\r\n' +
  '  echo [ERROR] Node.js not found. Please install Node 22+ first: https://nodejs.org/\r\n' +
  '  pause\r\n' +
  '  exit /b 1\r\n' +
  ')\r\n' +
  'node migrate-run.mjs MODE\r\n' +
  'echo.\r\n' +
  'pause\r\n';

const files = {
  '一键迁移.bat': bat('One-click migration EXPORT (run on the SOURCE machine before leaving)').replace('MODE', 'export'),
  '一键迁移整个zi.bat': bat('One-click migration: MyTime + ZCode data + the WHOLE zi folder (all projects)').replace('MODE', 'export-zi'),
  '一键还原.bat': bat('One-click migration RESTORE (run on the TARGET machine; close ZCode first)').replace('MODE', 'import'),
  '一键还原整个zi.bat': bat('One-click restore: the WHOLE zi folder + MyTime + ZCode data (close ZCode first)').replace('MODE', 'import-zi'),
  '自检.bat': bat('Verify: show sessions/projects actually present in the local ZCode database').replace('MODE', 'verify'),
};
fs.copyFileSync(path.join(ROOT, 'scripts', 'migrate-run.mjs'), path.join(OUT, 'migrate-run.mjs'));

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), content, 'utf8'); // 内容纯 ASCII，文件名中文无碍
  console.log('  ✓ ' + name);
}
console.log('  ✓ migrate-run.mjs（仓库最新版）');

const readme = [
  'MyTime 迁移 U 盘使用说明',
  '==========================',
  '',
  '这个目录是 MyTime + 整个 zi 项目目录 + ZCode 对话记录的"永久迁移中枢"。',
  '工具件（*.bat / migrate-run.mjs / migrate-import.mjs）由仓库脚本安装与刷新，请勿手工改动。',
  '',
  '【四个按钮】',
  '  一键迁移.bat        离开电脑前：导出 MyTime + ZCode 全部记忆/对话（先退出 ZCode！）',
  '  一键迁移整个zi.bat  上面全部 + robocopy 镜像整个 zi 目录的所有项目（大目录会逐个询问）',
  '  一键还原.bat        到达新机：还原 MyTime + ZCode 记忆/对话（先退出 ZCode！）',
  '  一键还原整个zi.bat  上面全部 + 还原整个 zi 目录到原位置（路径必须一致）',
  '',
  '【回迁三个防覆盖】（详见 MyTime/docs/迁移指南.md）',
  '  1. 两边 git 都 commit+push 对齐',
  '  2. 目标机 .zcode/cli/db 先手动备份（分离期聊过的对话只在那台机器库里）',
  '  3. 分离期只在在用的那台机器开 ZCode（单主原则）',
  '',
  '【内容清单】',
  '  mytime.bundle     MyTime git 全量历史离线包',
  '  secrets/          部署私钥、deploy/config、SSH 配置（敏感！）',
  '  server-data/      MyTime 本地 SQLite 数据与快照',
  '  project-zcode/    MyTime 项目内 ZCode 计划文件',
  '  zcode-cli/        ZCode 全部项目记忆 + 全部对话记录数据库',
  '  zi-projects/      整个 zi 目录镜像（跑过"一键迁移整个zi"才有）',
  '  MANIFEST.txt      本次导出清单',
  '',
  '⚠ 本 U 盘含私钥与全部对话记录：只走私有通道，勿插来路不明的机器，用完妥善保管。',
].join('\r\n');
fs.writeFileSync(path.join(OUT, '说明.txt'), '\ufeff' + readme, 'utf8');
console.log('  ✓ 说明.txt');
console.log('\n安装完成 → ' + OUT);
console.log('提示：之后每次"一键迁移"会自动刷新其中的 migrate-import.mjs 副本；工具件更新时重跑本安装脚本即可。');
