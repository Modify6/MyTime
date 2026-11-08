// 复盘聚合单测：计划vs实际 / 分类流向 / 挂起原因趋势（纯函数）
import { describe, it, expect } from 'vitest';
import { buildReview, categoryFlow, pauseReasonTrend } from '../src/stats/review.js';

const H = 3_600_000;
const base = new Date('2026-11-02T00:00:00').getTime(); // 周一
const mkEv = (id, title, cat, st, en, planId = null) => ({
  id, title, categoryId: cat, goalId: null, planId,
  startAt: st, endAt: en, note: '', estimateMs: null, createdAt: st, updatedAt: st, deleted: 0,
});
const mkPlan = (id, title, est, status = 'active', createdAt = base) => ({
  id, title, categoryId: 'cat-work', goalId: null, estimateMs: est, note: '',
  kind: 'planned', status, pauseReason: null, endReason: null, plannedDate: null,
  createdAt, updatedAt: createdAt, deleted: 0,
});

const START = base;
const END = base + 7 * 24 * H;
const PSTART = START - 7 * 24 * H;
const PEND = START;

describe('buildReview 计划 vs 实际', () => {
  it('周期内 planId 事件聚合到计划，预估偏差正确', () => {
    const plans = [mkPlan('p1', '写周报', 6 * H)];
    const events = [
      mkEv('e1', '写周报', 'cat-work', START + 1 * H, START + 4 * H, 'p1'),
      mkEv('e2', '写周报', 'cat-work', START + 5 * H, START + 6 * H, 'p1'), // 合计 4h，预估 6h → -33%
    ];
    const r = buildReview({ events, prevEvents: [], plans, planLogs: [], start: START, end: END, prevStart: PSTART, prevEnd: PEND });
    expect(r).toHaveLength(1);
    expect(r[0].actMs).toBe(4 * H);
    expect(r[0].est).toBe(6 * H);
    expect(r[0].pct).toBe(-33);
    expect(r[0].status).toBe('active');
  });

  it('周期内新建但未启动的计划标记 notStarted', () => {
    const plans = [mkPlan('p1', '未启动计划', 2 * H, 'waiting', START + 1 * H)];
    const r = buildReview({ events: [], prevEvents: [], plans, planLogs: [], start: START, end: END, prevStart: PSTART, prevEnd: PEND });
    expect(r).toHaveLength(1);
    expect(r[0].notStarted).toBe(true);
    expect(r[0].actMs).toBe(0);
  });

  it('周期外创建的计划不出现', () => {
    const plans = [mkPlan('p0', '上上周的计划', 1 * H, 'done', START - 30 * 24 * H)];
    const r = buildReview({ events: [], prevEvents: [], plans, planLogs: [], start: START, end: END, prevStart: PSTART, prevEnd: PEND });
    expect(r).toHaveLength(0);
  });
});

describe('categoryFlow 分类流向', () => {
  it('本期 vs 上期差值正确，按本期降序', () => {
    const events = [mkEv('a', '工作', 'cat-work', START + 1 * H, START + 4 * H)]; // 3h
    const prevEvents = [
      mkEv('b', '工作', 'cat-work', PSTART + 1 * H, PSTART + 5 * H), // 4h
      mkEv('c', '学习', 'cat-learn', PSTART + 6 * H, PSTART + 8 * H), // 2h（本期没有 → diff -2h）
    ];
    const r = categoryFlow({ events, prevEvents, start: START, end: END, prevStart: PSTART, prevEnd: PEND });
    expect(r).toHaveLength(2);
    const work = r.find((x) => x.categoryId === 'cat-work');
    expect(work.nowMs).toBe(3 * H);
    expect(work.prevMs).toBe(4 * H);
    expect(work.diff).toBe(-1 * H);
    const learn = r.find((x) => x.categoryId === 'cat-learn');
    expect(learn.nowMs).toBe(0);
    expect(learn.diff).toBe(-2 * H);
    expect(r[0].categoryId).toBe('cat-work');
  });
});

describe('pauseReasonTrend 挂起原因', () => {
  it('按原因计数并对比上期，未填写原因归入占位', () => {
    const planLogs = [
      { id: 'l1', planId: 'p1', action: 'pause', reason: '被他人打断', at: START + 1 * H, updatedAt: START, deleted: 0 },
      { id: 'l2', planId: 'p1', action: 'pause', reason: '被他人打断', at: START + 2 * H, updatedAt: START, deleted: 0 },
      { id: 'l3', planId: 'p1', action: 'pause', reason: null, at: START + 3 * H, updatedAt: START, deleted: 0 }, // 未填写
      { id: 'l4', planId: 'p1', action: 'pause', reason: '被他人打断', at: PSTART + 1 * H, updatedAt: PSTART, deleted: 0 }, // 上期
      { id: 'l5', planId: 'p1', action: 'done', reason: 'x', at: START + 4 * H, updatedAt: START, deleted: 0 }, // 非 pause 不计
    ];
    const r = pauseReasonTrend({ planLogs, start: START, end: END, prevStart: PSTART, prevEnd: PEND });
    expect(r.total).toBe(3);
    expect(r.prevTotal).toBe(1);
    expect(r.rows[0]).toEqual({ reason: '被他人打断', n: 2, prevN: 1 });
    expect(r.rows.find((x) => x.reason === '（未填写原因）').n).toBe(1);
  });
});
