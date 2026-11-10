// 目标进度计算单测
import { describe, expect, it } from 'vitest';
import { goalProgress, budgetProgress } from '../src/stats/goals.js';

// 固定一周：2026-11-09（周一）00:00 ~ 11-16 00:00 本地时区
const WEEK_START = new Date(2026, 10, 9).getTime();
const WEEK_END = WEEK_START + 7 * 86_400_000;
const HOUR = 3_600_000;

const mkGoal = (over = {}) => ({
  id: 'g1',
  name: '学习',
  color: '#43a047',
  targetHours: 10,
  targetType: 'weekly',
  archived: 0,
  deleted: 0,
  ...over,
});
const mkEv = (over = {}) => ({
  id: 'e1',
  goalId: 'g1',
  startAt: WEEK_START + 9 * HOUR,
  endAt: WEEK_START + 11 * HOUR,
  deleted: 0,
  ...over,
});

describe('goalProgress', () => {
  it('只取 targetType 匹配且未归档的目标', () => {
    const goals = [
      mkGoal({ id: 'a', targetType: 'weekly' }),
      mkGoal({ id: 'b', targetType: 'monthly' }),
      mkGoal({ id: 'c', targetType: undefined }), // 旧数据视为 total
      mkGoal({ id: 'd', targetType: 'weekly', archived: 1 }),
      mkGoal({ id: 'e', targetType: 'weekly', targetHours: null }),
    ];
    const rows = goalProgress(goals, [mkEv()], { kind: 'weekly', start: WEEK_START, end: WEEK_END });
    expect(rows.map((r) => r.goal.id)).toEqual(['a']);
  });

  it('只统计周期内挂该目标的事件时长', () => {
    const events = [
      mkEv({ id: 'e1' }), // 周内 2h
      mkEv({ id: 'e2', startAt: WEEK_START - HOUR, endAt: WEEK_START + HOUR }), // 跨界计入
      mkEv({ id: 'e3', startAt: WEEK_END + HOUR, endAt: WEEK_END + 2 * HOUR }), // 下周不计
      mkEv({ id: 'e4', goalId: 'gX' }), // 别的目标
      mkEv({ id: 'e5', deleted: 1 }), // 软删
      mkEv({ id: 'e6', endAt: null }), // 进行中不计时长
    ];
    const [row] = goalProgress([mkGoal()], events, { kind: 'weekly', start: WEEK_START, end: WEEK_END });
    expect(row.ms).toBe(4 * HOUR); // e1 2h + e2 2h（跨界事件按整体计——app 约定按 startAt 归属时段）
  });

  it('进度百分比与达标态', () => {
    const events = [mkEv({ startAt: WEEK_START, endAt: WEEK_START + 5 * HOUR })];
    const [half] = goalProgress([mkGoal()], events, { kind: 'weekly', start: WEEK_START, end: WEEK_END });
    expect(half.pct).toBe(50);
    expect(half.done).toBe(false);

    const [done] = goalProgress(
      [mkGoal()],
      [mkEv({ startAt: WEEK_START, endAt: WEEK_START + 11 * HOUR })],
      { kind: 'weekly', start: WEEK_START, end: WEEK_END }
    );
    expect(done.pct).toBe(110);
    expect(done.done).toBe(true);
    expect(done.remainMs).toBe(0);
  });

  it('进行中的周期给节奏对照，落后 5pct 以上标记 behind；过去周期不标记', () => {
    const mid = WEEK_START + Math.round(3.5 * 24 * HOUR); // 周中：时间过 50%
    const events = [mkEv({ startAt: WEEK_START, endAt: WEEK_START + 2 * HOUR })]; // 只 20%
    const [behindRow] = goalProgress([mkGoal()], events, {
      kind: 'weekly',
      start: WEEK_START,
      end: WEEK_END,
      now: mid,
    });
    expect(behindRow.elapsedPct).toBe(50);
    expect(behindRow.behind).toBe(true);

    const [okRow] = goalProgress(
      [mkGoal()],
      [mkEv({ startAt: WEEK_START, endAt: WEEK_START + 5 * HOUR })], // 50% 不落后
      { kind: 'weekly', start: WEEK_START, end: WEEK_END, now: mid }
    );
    expect(okRow.behind).toBe(false);

    const [pastRow] = goalProgress([mkGoal()], events, {
      kind: 'weekly',
      start: WEEK_START,
      end: WEEK_END,
      now: WEEK_END + 24 * HOUR,
    });
    expect(pastRow.elapsedPct).toBeNull();
    expect(pastRow.behind).toBe(false);
  });

  it('无匹配目标返回空数组', () => {
    expect(goalProgress([], [mkEv()], { kind: 'weekly', start: WEEK_START, end: WEEK_END })).toEqual([]);
  });
});

describe('budgetProgress', () => {
  const mkCat = (over = {}) => ({ id: 'cat-fun', name: '娱乐', color: '#ec407a', budgetHours: 10, deleted: 0, ...over });

  it('只取设了预算且未删除的分类', () => {
    const cats = [mkCat(), mkCat({ id: 'x', budgetHours: null }), mkCat({ id: 'y', deleted: 1 })];
    const rows = budgetProgress(cats, [mkEv()], { start: WEEK_START, end: WEEK_END });
    expect(rows.map((r) => r.categoryId)).toEqual(['cat-fun']);
  });

  it('按周期内分类汇总并给出三态', () => {
    const events = [
      mkEv({ id: 'a', goalId: null, categoryId: 'cat-fun', startAt: WEEK_START, endAt: WEEK_START + 9 * HOUR }),
      mkEv({ id: 'b', goalId: null, categoryId: 'cat-fun', startAt: WEEK_START + 20 * HOUR, endAt: WEEK_START + 22 * HOUR }),
      mkEv({ id: 'c', goalId: null, categoryId: 'cat-work', startAt: WEEK_START, endAt: WEEK_START + 5 * HOUR }),
    ];
    const [row] = budgetProgress([mkCat()], events, { start: WEEK_START, end: WEEK_END });
    expect(row.ms).toBe(11 * HOUR);
    expect(row.pct).toBe(110);
    expect(row.over).toBe(true);
    expect(row.overMs).toBe(HOUR);
  });

  it('接近预算 80%~100% 标记 near', () => {
    const events = [mkEv({ goalId: null, categoryId: 'cat-fun', startAt: WEEK_START, endAt: WEEK_START + 8.5 * HOUR })];
    const [row] = budgetProgress([mkCat()], events, { start: WEEK_START, end: WEEK_END });
    expect(row.pct).toBe(85);
    expect(row.near).toBe(true);
    expect(row.over).toBe(false);
  });
});
