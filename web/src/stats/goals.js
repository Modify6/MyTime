// 目标进度聚合（可单测）：按周期（weekly/monthly）统计挂目标事件的投入，
// 对照 targetHours 给出进度百分比、达标态与节奏提示（落后于时间进度）
import { totalMs } from './aggregate.js';

export const GOAL_KIND_LABEL = { weekly: '本周', monthly: '本月' };

/**
 * @param {Array} goals  目标列表（含 targetType: 'total'|'weekly'|'monthly'，缺省视为 'total'）
 * @param {Array} events 事件列表（需含 goalId；内部会过滤软删）
 * @param {{ kind: 'weekly'|'monthly', start: number, end: number, now?: number }} opts
 * @returns 进度行数组：{ goal, ms, targetMs, pct, done, elapsedPct, behind, remainMs }
 */
export function goalProgress(goals, events, { kind, start, end, now = Date.now() }) {
  const list = (goals || []).filter(
    (g) => g && !g.deleted && !g.archived && g.targetHours > 0 && (g.targetType || 'total') === kind
  );
  if (!list.length) return [];
  const within = (events || []).filter(
    (e) => e && !e.deleted && e.goalId && e.startAt < end && (e.endAt ?? e.startAt) >= start
  );
  const inProgress = now >= start && now < end;
  return list.map((g) => {
    const ms = totalMs(within.filter((e) => e.goalId === g.id));
    const targetMs = g.targetHours * 3_600_000;
    const pct = targetMs > 0 ? (ms / targetMs) * 100 : 0;
    const done = pct >= 100;
    // 节奏对照：仅对进行中的周期有意义（查看过去周期不提示落后）
    const elapsedPct = inProgress ? ((now - start) / (end - start)) * 100 : null;
    const behind = elapsedPct != null && !done && pct < elapsedPct - 5;
    return {
      goal: g,
      ms,
      targetMs,
      pct: Math.round(pct),
      done,
      elapsedPct: elapsedPct == null ? null : Math.round(elapsedPct),
      behind,
      remainMs: Math.max(0, targetMs - ms),
    };
  });
}

/**
 * 分类每周预算（上限）：投入越接近/超出预算越要警示（与目标的下限语义成对）
 * @param {Array} categories 分类列表（budgetHours: 每周上限小时数，空视为未设）
 * @param {Array} events 事件列表
 * @param {{ start: number, end: number }} opts 周期范围
 * @returns { categoryId, name, color, ms, budgetMs, pct, over, near }[]
 */
export function budgetProgress(categories, events, { start, end }) {
  const list = (categories || []).filter((c) => c && !c.deleted && c.budgetHours > 0);
  if (!list.length) return [];
  const within = (events || []).filter((e) => e && !e.deleted && e.categoryId && e.startAt < end && (e.endAt ?? e.startAt) >= start);
  return list.map((c) => {
    const ms = totalMs(within.filter((e) => e.categoryId === c.id));
    const budgetMs = c.budgetHours * 3_600_000;
    const pct = (ms / budgetMs) * 100;
    const over = pct > 100;
    return {
      categoryId: c.id,
      name: c.name,
      color: c.color,
      ms,
      budgetMs,
      pct: Math.round(pct),
      over,
      near: !over && pct >= 80,
      overMs: Math.max(0, ms - budgetMs),
    };
  });
}
