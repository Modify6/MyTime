// 智能推荐：根据历史习惯与当前时段，给出"现在适合打卡什么"的建议（纯函数，可单测）
// 打分维度：近 30 天频率 + 当前时段重合度 + 最近在做（柳比歇夫"生物钟"习惯的数字化）

export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const EMOJI = {
  'cat-sleep': '😴',
  'cat-meal': '🍜',
  'cat-work': '💼',
  'cat-study': '📖',
  'cat-sport': '🏃',
  'cat-commute': '🚇',
  'cat-fun': '🎮',
  'cat-chores': '🧹',
};
export function emojiFor(categoryId) {
  return EMOJI[categoryId] || '⏱️';
}

// 时段划分与该时段的默认建议（categoryId 对应内置分类）
const BUCKETS = [
  { key: 'earlyMorning', from: 5, to: 9, label: '清晨', suggest: [['cat-meal', '早餐'], ['cat-commute', '通勤'], ['cat-study', '晨读']] },
  { key: 'morning', from: 9, to: 12, label: '上午', suggest: [['cat-work', '工作'], ['cat-study', '学习']] },
  { key: 'noon', from: 12, to: 14, label: '午间', suggest: [['cat-meal', '午餐'], ['cat-sleep', '午休']] },
  { key: 'afternoon', from: 14, to: 18, label: '下午', suggest: [['cat-work', '工作'], ['cat-study', '学习']] },
  { key: 'evening', from: 18, to: 23, label: '晚间', suggest: [['cat-meal', '晚餐'], ['cat-sport', '运动'], ['cat-fun', '娱乐']] },
  { key: 'night', from: 23, to: 29, label: '深夜', suggest: [['cat-sleep', '睡眠']] },
];

export function bucketOf(hour) {
  const h = hour < 5 ? hour + 24 : hour;
  for (const b of BUCKETS) {
    if (h >= b.from && h < b.to) return b;
  }
  return BUCKETS[3];
}

// 按事项名聚合出习惯项并打分排序
export function habitItems(events, now = Date.now()) {
  const byTitle = new Map();
  for (const e of events) {
    const t = (e.title || '').trim();
    if (!t) continue;
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(e);
  }
  const hour = new Date(now).getHours();
  const items = [];
  for (const [title, list] of byTitle) {
    const sorted = [...list].sort((a, b) => b.startAt - a.startAt);
    const last = sorted[0];
    if (last.endAt == null) continue; // 正在计时的不推荐（避免重复开始）
    const count30 = sorted.filter((e) => now - e.startAt <= 30 * DAY).length;
    const hourHits = sorted.filter((e) => {
      const eh = new Date(e.startAt).getHours();
      const d = Math.min(Math.abs(eh - hour), 24 - Math.abs(eh - hour));
      return d <= 1;
    }).length;
    const since = now - last.startAt;
    let score = count30 * 2;
    if (hourHits > 0) score += 3 + hourHits;
    if (since < 2 * DAY) score += 4;
    else if (since < 7 * DAY) score += 2;
    let reason;
    if (hourHits >= 2) reason = `常在${bucketOf(hour).label}做`;
    else if (since < DAY) reason = '上次刚做';
    else if (count30 >= 4) reason = '你的高频习惯';
    else if (since < 7 * DAY) reason = '最近常做';
    else if (hourHits === 1) reason = '这个时间做过';
    else reason = '历史记录';
    items.push({ title, categoryId: last.categoryId, goalId: last.goalId || null, count30, hourHits, score, reason });
  }
  return items.sort((a, b) => b.score - a.score || b.count30 - a.count30);
}

// 打卡面板的推荐位：习惯优先，时段建议兜底
export function recommendStart(events, now = Date.now(), max = 4) {
  const habits = habitItems(events, now).filter((h) => h.score >= 2).slice(0, max - 1);
  const bucket = bucketOf(new Date(now).getHours());
  const out = [...habits];
  for (const [categoryId, label] of bucket.suggest) {
    if (out.length >= max) break;
    if (out.some((o) => o.title === label)) continue;
    out.push({ title: label, categoryId, goalId: null, count30: 0, hourHits: 0, score: 0, reason: `时段推荐 · ${bucket.label}` });
  }
  return out.slice(0, max);
}

// 首页环绕快捷按钮：高频习惯优先，不足时用时段/常见分类补齐
export function quickActivities(events, now = Date.now(), n = 6) {
  const habits = habitItems(events, now).filter((h) => h.count30 > 0 || h.hourHits > 0);
  if (habits.length >= n) return habits.slice(0, n);
  const out = [...habits];
  const bucket = bucketOf(new Date(now).getHours());
  const fallback = [
    ...bucket.suggest,
    ['cat-work', '工作'],
    ['cat-study', '学习'],
    ['cat-sport', '运动'],
    ['cat-fun', '娱乐'],
    ['cat-meal', '餐饮'],
    ['cat-sleep', '睡眠'],
  ];
  for (const [categoryId, label] of fallback) {
    if (out.length >= n) break;
    if (out.some((o) => o.title === label)) continue;
    out.push({ title: label, categoryId, goalId: null, count30: 0, hourHits: 0, score: 0, reason: '快捷打卡' });
  }
  return out.slice(0, n);
}
