// 统计聚合纯函数（可单测）：事件按 startAt 归属时段，进行中的事件不计入时长
import dayjs from 'dayjs';

export const MIN = 60_000;
export const HOUR = 3_600_000;

export function dur(e) {
  return e.endAt == null ? 0 : Math.max(0, e.endAt - e.startAt);
}

export function totalMs(events) {
  return events.reduce((s, e) => s + dur(e), 0);
}

export function byCategory(events) {
  const m = new Map();
  for (const e of events) m.set(e.categoryId, (m.get(e.categoryId) || 0) + dur(e));
  return [...m.entries()]
    .map(([categoryId, ms]) => ({ categoryId, ms }))
    .filter((x) => x.ms > 0)
    .sort((a, b) => b.ms - a.ms);
}

export function byTitle(events, topN = Infinity) {
  const m = new Map();
  for (const e of events) {
    const k = (e.title || '').trim() || '未命名';
    const o = m.get(k) || { ms: 0, count: 0 };
    o.ms += dur(e);
    o.count += 1;
    m.set(k, o);
  }
  return [...m.entries()]
    .map(([title, v]) => ({ title, ...v }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, topN);
}

// 3900000 -> "1小时5分"；2700000 -> "45分钟"
export function fmtDur(ms) {
  if (ms <= 0) return '0';
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const s = Math.floor((ms % MIN) / 1000);
  if (h > 0) return m > 0 ? `${h}小时${m}分` : `${h}小时`;
  if (m > 0) return `${m}分钟`;
  return `${s}秒`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 柳比歇夫式报告：合计 + 分类占比 + 每类 Top 事项
export function reportText({ rangeStart, events, categories }) {
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const d = dayjs(rangeStart);
  const total = totalMs(events);
  const lines = [
    `${d.format('M月D日')}（${WEEKDAYS[d.day()]}）· 柳比歇夫记录`,
    `合计纯时间 ${fmtDur(total)} ｜ ${events.length} 条记录`,
    '',
  ];
  if (!events.length) lines.push('（本时段暂无记录）');
  for (const { categoryId, ms } of byCategory(events)) {
    const cat = catMap[categoryId];
    const pct = total > 0 ? ((ms / total) * 100).toFixed(1) : '0.0';
    lines.push(`【${cat?.name || '未分类'}】${fmtDur(ms)}（${pct}%）`);
    for (const t of byTitle(
      events.filter((e) => e.categoryId === categoryId),
      5
    )) {
      lines.push(`  - ${t.title} ${fmtDur(t.ms)}`);
    }
  }
  return lines.join('\n');
}
