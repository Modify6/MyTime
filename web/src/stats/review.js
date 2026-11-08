// 复盘聚合：计划 vs 实际（计划系统）+ 分类时间流向对比 + 挂起原因趋势
// 纯函数，便于单测；数据由调用方（StatsView 复盘分段）加载
import { byCategory } from './aggregate.js';

const inRange = (e, start, end) => e.startAt >= start && e.startAt < end;

// 计划 vs 实际：周期内出现过实际投入的计划（含计划系统预估对比）+ 周期内新建但未启动的计划
export function buildReview({ events, plans, start, end }) {
  const cur = events.filter((e) => inRange(e, start, end));
  const planMs = new Map();
  for (const e of cur) {
    if (!e.planId) continue;
    planMs.set(e.planId, (planMs.get(e.planId) || 0) + Math.max(0, (e.endAt ?? end) - e.startAt));
  }
  const rows = [...planMs.entries()].map(([planId, actMs]) => {
    const p = plans.find((x) => x.id === planId);
    const est = p?.estimateMs > 0 ? p.estimateMs : null;
    const pct = est ? Math.round(((actMs - est) / est) * 100) : null;
    return {
      planId,
      title: p?.title || '（已删除的计划）',
      kind: p?.kind || null,
      status: p?.status || 'unknown',
      est,
      actMs,
      pct, // 实际相对预估：正 = 超出，负 = 快于
    };
  });
  // 周期内新建但尚无投入的计划（来自计划系统，标记"未启动"）
  const touched = new Set(rows.map((r) => r.planId));
  for (const p of plans) {
    if (p.createdAt >= start && p.createdAt < end && !touched.has(p.id)) {
      rows.push({
        planId: p.id,
        title: p.title,
        kind: p.kind,
        status: p.status,
        est: p.estimateMs > 0 ? p.estimateMs : null,
        actMs: 0,
        pct: null,
        notStarted: true,
      });
    }
  }
  return rows.sort((a, b) => b.actMs - a.actMs);
}

// 分类时间流向：本期 vs 上期（同长度周期），按本期时长降序
export function categoryFlow({ events, prevEvents, start, end, prevStart, prevEnd }) {
  const cur = events.filter((e) => inRange(e, start, end));
  const prev = prevEvents.filter((e) => inRange(e, prevStart, prevEnd));
  const now = new Map(byCategory(cur).map((t) => [t.categoryId, t.ms]));
  const before = new Map(byCategory(prev).map((t) => [t.categoryId, t.ms]));
  const ids = [...new Set([...now.keys(), ...before.keys()])];
  return ids
    .map((categoryId) => {
      const nowMs = now.get(categoryId) || 0;
      const prevMs = before.get(categoryId) || 0;
      return { categoryId, nowMs, prevMs, diff: nowMs - prevMs };
    })
    .sort((a, b) => b.nowMs - a.nowMs);
}

// 挂起原因趋势：本期挂起原因计数（降序）+ 上期总数对比
export function pauseReasonTrend({ planLogs, start, end, prevStart, prevEnd }) {
  const count = (s, en) => {
    const m = new Map();
    for (const l of planLogs) {
      if (l.action !== 'pause' || l.at < s || l.at >= en) continue;
      const key = l.reason || '（未填写原因）';
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  };
  const cur = count(start, end);
  const prev = count(prevStart, prevEnd);
  const rows = [...cur.entries()]
    .map(([reason, n]) => ({ reason, n, prevN: prev.get(reason) || 0 }))
    .sort((a, b) => b.n - a.n);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const prevTotal = [...prev.values()].reduce((s, n) => s + n, 0);
  return { rows, total, prevTotal };
}
