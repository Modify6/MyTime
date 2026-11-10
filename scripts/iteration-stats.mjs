#!/usr/bin/env node
// 迭代统计：从 git tags 与仓库现状自动生成，更新 README 的标记块
// 用法：node scripts/iteration-stats.mjs
// README 中以 <!-- ITERATION-STATS:START --> ... <!-- ITERATION-STATS:END --> 标记块承载
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README = path.join(ROOT, 'README.md');

// 1. 发版标签（含时间，按时间排序）
const tagLines = execSync(
  'git for-each-ref refs/tags --sort=creatordate --format=%(refname:short)@%(creatordate:short)',
  { cwd: ROOT, encoding: 'utf8' }
)
  .trim()
  .split('\n')
  .map((l) => {
    const [name, date] = l.split('@');
    return { name, date: (date || '').trim() };
  })
  .filter((t) => /^v\d+\.\d+\.\d+$/.test(t.name));

// 2. 递增类型分类（对比前一个版本）
const classify = (a, b) => {
  const [a1, a2, a3] = a.slice(1).split('.').map(Number);
  const [b1, b2, b3] = b.slice(1).split('.').map(Number);
  if (b1 > a1) return 'major';
  if (b2 > a2) return 'minor';
  return 'patch';
};
const kinds = { major: 0, minor: 0, patch: 0 };
for (let i = 1; i < tagLines.length; i++) kinds[classify(tagLines[i - 1].name, tagLines[i].name)]++;

// 3. 开发周期与频率
const first = tagLines[0];
const days = Math.max(1, Math.ceil((Date.now() - new Date(first.date).getTime()) / 86400000));
const perDay = (tagLines.length / days).toFixed(1);

// 4. 当前版本（package.json，含本地构建的自动递增）
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'package.json'), 'utf8'));

// 5. 需求记录条数（README 需求表的数据行）
const readme = fs.readFileSync(README, 'utf8');
const reqRows = (readme.match(/^\| 20\d\d-\d\d-\d\d \|/gm) || []).length;

// 6. 测试数量
const testDir = path.join(ROOT, 'web', 'tests');
let unitCount = 0;
for (const f of fs.readdirSync(testDir).filter((f) => f.endsWith('.test.js'))) {
  const s = fs.readFileSync(path.join(testDir, f), 'utf8');
  unitCount += (s.match(/\b(it|test)\(/g) || []).length;
}
const e2eDir = path.join(ROOT, 'web', 'e2e');
let e2eCount = 0;
for (const f of fs.readdirSync(e2eDir).filter((f) => f.endsWith('.spec.js'))) {
  e2eCount += (fs.readFileSync(path.join(e2eDir, f), 'utf8').match(/\btest\(/g) || []).length;
}

// 7. 生成统计块
const block = [
  '<!-- ITERATION-STATS:START（由 scripts/iteration-stats.mjs 自动生成，勿手改） -->',
  `**正式迭代 ${tagLines.length} 次**（${first.name} → v${pkg.version}，历时 ${days} 天 · 均 ${perDay} 次/天）｜minor ${kinds.minor} 次 · patch ${kinds.patch} 次｜**需求记录 ${reqRows} 条**｜单测 ${unitCount} 例 · E2E 场景 ${e2eCount} 个`,
  '<!-- ITERATION-STATS:END -->',
].join('\n');

// 8. 更新 README 标记块
const START = '<!-- ITERATION-STATS:START';
const END = '<!-- ITERATION-STATS:END -->';
let s = readme;
if (s.includes(START) && s.includes(END)) {
  s = s.replace(/<!-- ITERATION-STATS:START[\s\S]*?-->\n?[\s\S]*?<!-- ITERATION-STATS:END -->/, block);
} else {
  const anchor = '## 需求记录';
  if (!s.includes(anchor)) { console.error('README 缺少锚点'); process.exit(1); }
  s = s.replace(anchor, block + '\n\n' + anchor);
}
fs.writeFileSync(README, s);
console.log('迭代统计已更新 README：');
console.log('  正式发版:', tagLines.length, '次（', tagLines[0].name, '→', 'v' + pkg.version, '），', days, '天');
console.log('  构成: minor', kinds.minor, '/ patch', kinds.patch, '| 需求:', reqRows, '条 | 单测:', unitCount, '| E2E:', e2eCount);
