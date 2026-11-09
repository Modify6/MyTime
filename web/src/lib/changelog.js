// 版本迭代史：构建时注入的 CHANGELOG.md（单一数据源）+ 极简解析器
// CHANGELOG 格式固定（Keep a Changelog 变体）：
//   ## [x.y.z] - 日期
//   ### 小节标题
//   - 条目
export const APP_CHANGELOG = typeof __APP_CHANGELOG__ !== 'undefined' ? __APP_CHANGELOG__ : '';
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

// 解析为 [{ version, date, sections: [{ title, items: [] }] }]，倒序即文件原序（最新在前）
export function parseChangelog(raw = APP_CHANGELOG) {
  const releases = [];
  let cur = null;
  let curSection = null;
  for (const line of raw.split('\n')) {
    const l = line.trim();
    const rel = l.match(/^##\s+\[([^\]]+)\]\s*-\s*(.+)$/);
    if (rel) {
      cur = { version: rel[1], date: rel[2].trim(), sections: [] };
      curSection = null;
      releases.push(cur);
      continue;
    }
    if (!cur) continue;
    const sec = l.match(/^###\s+(.+)$/);
    if (sec) {
      curSection = { title: sec[1].trim(), items: [] };
      cur.sections.push(curSection);
      continue;
    }
    const item = l.match(/^[-*]\s+(.+)$/);
    if (item && curSection) curSection.items.push(item[1].trim());
  }
  return releases;
}

// 小节名 → 展示色（新增/修复/变更/安全/移除/性能）
export function sectionColor(title = '') {
  if (title.includes('新增') || title.includes('Added')) return '#34c273';
  if (title.includes('修复') || title.includes('Fixed')) return '#f5a623';
  if (title.includes('安全') || title.includes('Security')) return '#e5484d';
  if (title.includes('移除') || title.includes('Removed')) return '#98a2b3';
  if (title.includes('性能')) return '#4f6ef7';
  return '#4f6ef7';
}
