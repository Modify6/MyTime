// 一键发版脚本：像正规软件一样把"版本、测试、归档、提交、标签、推送"串成一条流水线
// 用法：node scripts/release.mjs patch|minor|major|x.y.z   （默认 patch）
// 流程：工作树检查 → 单元测试 → 版本号贯通 → CHANGELOG 自动生成 → 构建 → 提交 → 标签 → 推送（带重试）
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = 'E:/study/zi/MyTime';
const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
const capture = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();

const bump = process.argv[2] || 'patch';
const VERSION_RE = /^\d+\.\d+\.\d+$/;

// —— 0. 前置检查 ——
if (!fs.existsSync(ROOT + '/web/package.json')) {
  console.error('[错误] 请在项目根目录运行');
  process.exit(1);
}
const dirty = capture('git status --porcelain');
if (dirty) {
  console.error('[错误] 工作树不干净，先提交或暂存改动：\n' + dirty);
  process.exit(1);
}

// —— 1. 单元测试（失败即中止）——
console.log('\n[1/6] 单元测试...');
run('npm --prefix web test');

// —— 2. 计算并写入新版本 ——
console.log('\n[2/6] 版本号贯通...');
const webPkgPath = ROOT + '/web/package.json';
const webPkg = JSON.parse(fs.readFileSync(webPkgPath, 'utf8'));
const cur = webPkg.version;
let next;
if (VERSION_RE.test(bump)) {
  next = bump;
} else {
  const [maj, min, pat] = cur.split('.').map(Number);
  next =
    bump === 'major' ? `${maj + 1}.0.0`
    : bump === 'minor' ? `${maj}.${min + 1}.0`
    : `${maj}.${min}.${pat + 1}`;
}
if (!VERSION_RE.test(next)) { console.error('[错误] 版本参数应为 patch|minor|major|x.y.z'); process.exit(1); }
webPkg.version = next;
fs.writeFileSync(webPkgPath, JSON.stringify(webPkg, null, 2) + '\n');
for (const p of [ROOT + '/package.json', ROOT + '/server/package.json']) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = next;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
run('node scripts/sync-version.mjs');
console.log(`版本: ${cur} -> ${next}`);

// —— 3. CHANGELOG：无条目则从提交记录自动生成 ——
console.log('\n[3/6] CHANGELOG...');
const clPath = ROOT + '/CHANGELOG.md';
let cl = fs.readFileSync(clPath, 'utf8');
if (!cl.includes(`## [${next}]`)) {
  const today = new Date().toISOString().slice(0, 10);
  let subjects = '';
  try {
    subjects = capture(`git log $(git tag --list "v*" | sort -V | tail -1)..HEAD --pretty="- %s"`)
      .split('\n').filter((l) => l.trim() && !l.startsWith('- chore(release)')).join('\n');
  } catch { subjects = '- （提交汇总生成失败，请手动补充）'; }
  cl = cl.replace(
    '# 更新日志\n\n所有对外可感知的变化都记录在此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。\n',
    `# 更新日志\n\n所有对外可感知的变化都记录在此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。\n\n## [${next}] - ${today}\n\n### 变更（自动汇总，可编辑润色）\n${subjects || '- （无提交）'}\n`
  );
  fs.writeFileSync(clPath, cl);
  console.log(`已从提交记录生成 [${next}] 条目（可随后编辑润色）`);
} else {
  console.log('CHANGELOG 已有条目');
}

// —— 3.5 README 同步检查：版本引用自动替换 + 人工确认清单 ——
console.log('\n[3.5/6] README 同步检查...');
const readmePath = ROOT + '/README.md';
let readme = fs.readFileSync(readmePath, 'utf8');
const verRefRe = /v(\d+\.\d+\.\d+)/g;
let refReplaced = 0;
readme = readme.replace(verRefRe, (m, v) => {
  if (v === next) return m;
  refReplaced++;
  return `v${next}`;
});
if (refReplaced > 0) {
  fs.writeFileSync(readmePath, readme);
  console.log(`README 中 ${refReplaced} 处版本号引用已同步为 v${next}（请人工核对语境是否恰当）`);
} else {
  console.log('README 无具体版本号引用需要替换');
}
console.log('⚠ 人工确认清单（发版三件套）：');
console.log('  1. README「功能」清单是否需要补充本版新功能条目');
console.log('  2. docs/lessons.md 是否有新的 bug 根因教训需要归档');
console.log('  3. README「后续路线」是否需要勾选已完成项');

// —— 4. 构建前端 ——
console.log('\n[4/6] 构建前端...');
run('npm --prefix web run build');

// —— 5. 提交 + 标签 ——
console.log('\n[5/6] 提交与标签...');
run('git add -A');
run(`git commit --no-verify -m "chore(release): v${next}" -m "版本贯通（web/APK/日志）、CHANGELOG 与构建产物。详见 CHANGELOG [${next}] 条目。"`);
run(`git tag -a v${next} -m "v${next}"`);

// —— 6. 推送（带重试；失败不回滚，本地已归档，恢复后 git push 即可） ——
console.log('\n[6/6] 推送 GitHub...');
let pushed = false;
for (let i = 1; i <= 5; i++) {
  try {
    run(`git push origin master --tags`);
    pushed = true;
    break;
  } catch {
    console.log(`推送失败（第 ${i} 次），60 秒后重试...`);
    execSync('sleep 60');
  }
}

console.log('\n========== 发版完成 ==========');
console.log(`版本: v${next}（versionCode ${next.split('.')[0] * 10000 + Number(next.split('.')[1]) * 100 + Number(next.split('.')[2])}）`);
if (pushed) {
  console.log(`GitHub: https://github.com/Modify6/MyTime/releases/tag/v${next}`);
  console.log('CI 将自动构建 APK 并挂到该 Release，几分钟后手机可直接下载。');
} else {
  console.log('推送未成功（网络波动）：提交与标签已留在本地，网络恢复后执行 git push origin master --tags 即可。');
}
