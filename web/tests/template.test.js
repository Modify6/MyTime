// 模板统计单测：实例归组 / 总用时 / 平均最多最少
import { describe, it, expect } from 'vitest';
import { templateStats } from '../src/stats/template.js';

const H = 3_600_000;
const base = new Date('2026-11-09T00:00:00').getTime();
const mkPlan = (id, instanceId, est, createdAt, templateId = 't1') => ({
  id, title: id, templateId, instanceId, estimateMs: est,
  status: 'done', createdAt, updatedAt: createdAt, deleted: 0,
});
const mkEv = (id, planId, st, en) => ({
  id, title: planId, planId, categoryId: 'cat-work', startAt: st, endAt: en,
  deleted: 0,
});

describe('templateStats 模板统计', () => {
  const plans = [
    mkPlan('p1', 'inst-1', 2 * H, base),       // 第一次实例化：预估 2h
    mkPlan('p2', 'inst-1', 1 * H, base),
    mkPlan('p3', 'inst-2', 3 * H, base + 7 * 24 * H), // 第二次：预估 3h
  ];
  const events = [
    mkEv('e1', 'p1', base + 1 * H, base + 3 * H),  // p1 实际 2h
    mkEv('e2', 'p2', base + 3 * H, base + 3.5 * H), // p2 实际 0.5h → inst-1 总 2.5h
    mkEv('e3', 'p3', base + 8 * 24 * H + 1 * H, base + 8 * 24 * H + 2.2 * H), // p3 实际 1.2h
  ];

  it('按 instanceId 归组，实例总用时 = 组内计划实际之和', () => {
    const r = templateStats({ events, plans, templateId: 't1' });
    expect(r.instances).toHaveLength(2);
    const i1 = r.instances.find((x) => x.instanceId === 'inst-1');
    expect(i1.actMs).toBe(2.5 * H);
    expect(i1.estMs).toBe(3 * H);
    expect(i1.planCount).toBe(2);
  });

  it('平均/最多/最少基于有实际投入的实例', () => {
    const r = templateStats({ events, plans, templateId: 't1' });
    expect(r.runCount).toBe(2);
    // (2.5h + 1.2h) / 2 = 1.85h
    expect(r.avgMs).toBe(Math.round(1.85 * H));
    expect(r.maxMs).toBe(2.5 * H);
    expect(r.minMs).toBe(1.2 * H);
  });

  it('其他模板的事件不串扰；无投入时统计为 null', () => {
    const other = [mkPlan('q1', 'inst-x', null, base, 'other-t')];
    const otherEv = [mkEv('qe', 'q1', base + 1 * H, base + 2 * H)];
    const r = templateStats({ events: otherEv, plans: other, templateId: 'other-t' });
    expect(r.runCount).toBe(1);
    expect(r.avgMs).toBe(H);
    const empty = templateStats({ events: [], plans: [mkPlan('p9', 'inst-e', null, base)], templateId: 't1' });
    expect(empty.runCount).toBe(0);
    expect(empty.avgMs).toBeNull();
    // t1 不受 other-t 的事件影响
    const t1 = templateStats({ events: otherEv, plans, templateId: 't1' });
    expect(t1.runCount).toBe(0);
  });
});
