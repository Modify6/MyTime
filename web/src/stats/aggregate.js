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

// 计划 vs 实际：仅统计带预估（estimateMs）且已结束的事件；pct = (实际-预估)/预估，正=超出预估
export function estimateCompare(events) {
  const withEst = events.filter((e) => e.estimateMs > 0 && e.endAt != null);
  if (!withEst.length) return null;
  const estMs = withEst.reduce((s, e) => s + e.estimateMs, 0);
  const actMs = withEst.reduce((s, e) => s + dur(e), 0);
  return {
    count: withEst.length,
    estMs,
    actMs,
    pct: estMs > 0 ? Math.round(((actMs - estMs) / estMs) * 100) : 0,
  };
}

export function estimateByCategory(events) {
  const m = new Map();
  for (const e of events) {
    if (!(e.estimateMs > 0) || e.endAt == null) continue;
    const o = m.get(e.categoryId) || { estMs: 0, actMs: 0, count: 0 };
    o.estMs += e.estimateMs;
    o.actMs += dur(e);
    o.count += 1;
    m.set(e.categoryId, o);
  }
  return [...m.entries()]
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .sort((a, b) => b.actMs - a.actMs);
}

// 专注热力图：以 end 所在周收尾、weeks 周的逐日投入矩阵（列=周，行=周一~周日）
// level 0-4 为投入档位；未来日期 level=-1（渲染为空白）
function levelOf(ms) {
  if (ms <= 0) return 0;
  if (ms < 30 * 60_000) return 1;
  if (ms < 3_600_000) return 2;
  if (ms < 2 * 3_600_000) return 3;
  return 4;
}

// 近 days 天逐日投入序列（空档为 0，旧→新），用于目标趋势折线
export function dailySeries(events, { days = 30, end = Date.now() } = {}) {
  const totals = new Map();
  for (const e of events) {
    const key = dayjs(e.startAt).format('YYYY-MM-DD');
    totals.set(key, (totals.get(key) || 0) + dur(e));
  }
  const endDay = dayjs(end).startOf('day');
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = endDay.subtract(i, 'day').format('YYYY-MM-DD');
    out.push({ date: key, ms: totals.get(key) || 0 });
  }
  return out;
}

// 投入时段分布：近 N 天事件按「startAt 的小时」（本地时区）归入 24 格，
// 跨界事件整体计入起始小时（app 约定同 dailySeries）；按分类分组供堆叠柱。
// 返回 [{ categoryId, hours: [ms×24] }]，顺序按分类首次出现，稳定输出。
export function hourlySeries(events, { days = 30, end = Date.now() } = {}) {
  const start = end - days * 86_400_000;
  const order = [];
  const byCat = new Map();
  for (const e of events) {
    if (e.deleted) continue;
    if (e.startAt < start || e.startAt >= end) continue;
    const ms = dur(e);
    if (ms <= 0) continue;
    const cid = e.categoryId || '_';
    if (!byCat.has(cid)) {
      byCat.set(cid, Array(24).fill(0));
      order.push(cid);
    }
    byCat.get(cid)[dayjs(e.startAt).hour()] += ms;
  }
  return order.map((categoryId) => ({ categoryId, hours: byCat.get(categoryId) }));
}

// 单日 24 小时时间轴：把时间重叠的事件分配到互不重叠的泳道（贪心）。
// 相接（start == 前者 end）也视为视觉冲突另起泳道——时间轴渲染层按"局部并发数"
// 等分条带宽度，相接事件并排显示（日历类 App 标准行为），不重叠的条带恢复全宽。
export function layoutDayLanes(events) {
  const segs = events
    .filter((e) => e.endAt != null)
    .map((e) => ({ event: e, start: e.startAt, end: e.endAt }))
    .sort((a, b) => a.start - b.start);
  const lanes = [];
  for (const s of segs) {
    let lane = lanes.find((l) => s.start > l.end);
    if (!lane) {
      lane = { end: 0, items: [] };
      lanes.push(lane);
    }
    lane.items.push(s);
    lane.end = Math.max(lane.end, s.end);
  }
  return lanes.map((l) => l.items);
}

export function heatmapData(events, { weeks = 24, end = Date.now() } = {}) {
  const endDay = dayjs(end).startOf('day');
  const dow = (endDay.day() + 6) % 7; // 0=周一
  const gridStart = endDay.subtract(dow + (weeks - 1) * 7, 'day');

  const totals = new Map();
  for (const e of events) {
    const key = dayjs(e.startAt).format('YYYY-MM-DD');
    totals.set(key, (totals.get(key) || 0) + dur(e));
  }

  const cells = [];
  let total = 0;
  let activeDays = 0;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = gridStart.add(w * 7 + d, 'day');
      const key = day.format('YYYY-MM-DD');
      const future = day.isAfter(endDay, 'day');
      const ms = future ? null : totals.get(key) || 0;
      if (!future) {
        total += ms;
        if (ms > 0) activeDays += 1;
      }
      cells.push({ key, ms, level: future ? -1 : levelOf(ms) });
    }
  }
  return { cells, total, activeDays, start: gridStart.valueOf(), end: endDay.valueOf() };
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
  ];
  const est = estimateCompare(events);
  if (est) {
    lines.push(`预估 ${fmtDur(est.estMs)} · 实际 ${fmtDur(est.actMs)}（偏差 ${est.pct >= 0 ? '+' : ''}${est.pct}%）`);
  }
  lines.push('');
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
