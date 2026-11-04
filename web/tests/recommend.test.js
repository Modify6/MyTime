import { describe, it, expect } from 'vitest';
import { habitItems, recommendStart, quickActivities, bucketOf, emojiFor } from '../src/stats/recommend.js';

// 固定"当前时间"：2026-11-04 12:30（周三·午间），保证测试确定性
const NOW = new Date(2026, 10, 4, 12, 30).getTime();
const D = 86_400_000;

const ev = (id, title, startAt, endAt, categoryId = 'cat-work', extra = {}) => ({
  id,
  title,
  categoryId,
  goalId: null,
  startAt,
  endAt,
  note: '',
  deleted: 0,
  createdAt: startAt,
  updatedAt: startAt,
  ...extra,
});

describe('bucketOf 时段划分', () => {
  it('覆盖全天含凌晨归入深夜', () => {
    expect(bucketOf(7).key).toBe('earlyMorning');
    expect(bucketOf(9).key).toBe('morning');
    expect(bucketOf(12).key).toBe('noon');
    expect(bucketOf(15).key).toBe('afternoon');
    expect(bucketOf(19).key).toBe('evening');
    expect(bucketOf(23).key).toBe('night');
    expect(bucketOf(2).key).toBe('night');
  });
});

describe('habitItems 习惯打分', () => {
  const events = [
    ev('1', '写论文', NOW - 1 * D, NOW - 1 * D + 3_600_000), // 昨天 12:30
    ev('2', '写论文', NOW - 2 * D, NOW - 2 * D + 3_600_000), // 前天 12:30
    ev('3', '午休', NOW - 3 * D, NOW - 3 * D + 1_800_000, 'cat-sleep'),
    ev('4', '午休', NOW - 10 * D, NOW - 10 * D + 1_800_000, 'cat-sleep'),
    ev('5', '旧事', NOW - 40 * D, NOW - 40 * D + 3_600_000),
  ];

  it('统计30天次数、时段重合与推荐理由', () => {
    const items = habitItems(events, NOW);
    const xie = items.find((i) => i.title === '写论文');
    expect(xie.count30).toBe(2);
    expect(xie.hourHits).toBe(2);
    expect(xie.reason).toBe('常在午间做');
    expect(xie.categoryId).toBe('cat-work');

    const wu = items.find((i) => i.title === '午休');
    expect(wu.count30).toBe(2);
    expect(wu.hourHits).toBe(2); // 12:30 开始，与当前时段完全重合
    expect(wu.reason).toBe('常在午间做');
  });

  it('30 天前的事件不计入次数', () => {
    const jiu = habitItems(events, NOW).find((i) => i.title === '旧事');
    expect(jiu.count30).toBe(0);
  });

  it('进行中的事项不参与推荐', () => {
    const running = [ev('1', '进行中', NOW - 3_600_000, null)];
    expect(habitItems(running, NOW)).toHaveLength(0);
  });
});

describe('recommendStart 推荐面板', () => {
  it('习惯优先，时段建议兜底', () => {
    const events = [
      ev('1', '写论文', NOW - 1 * D, NOW - 1 * D + 3_600_000),
      ev('2', '写论文', NOW - 2 * D, NOW - 2 * D + 3_600_000),
    ];
    const recs = recommendStart(events, NOW, 4);
    expect(recs[0].title).toBe('写论文');
    expect(recs.some((r) => r.title === '午餐')).toBe(true);
    expect(recs.length).toBeLessThanOrEqual(4);
  });

  it('无历史时全靠时段推荐', () => {
    const recs = recommendStart([], NOW, 4);
    expect(recs.map((r) => r.title)).toEqual(['午餐', '午休']);
  });
});

describe('quickActivities 快捷按钮', () => {
  it('无历史时给默认快捷项（时段优先）', () => {
    const q = quickActivities([], NOW, 6);
    expect(q).toHaveLength(6);
    expect(q[0].title).toBe('午餐');
    expect(q[0].categoryId).toBe('cat-meal');
  });

  it('有历史时习惯排最前并携带目标关联', () => {
    const events = [
      ev('1', '写论文', NOW - 1 * D, NOW - 1 * D + 3_600_000, 'cat-work', { goalId: 'g1' }),
      ev('2', '写论文', NOW - 2 * D, NOW - 2 * D + 3_600_000),
    ];
    const q = quickActivities(events, NOW, 6);
    expect(q[0].title).toBe('写论文');
    expect(q[0].goalId).toBe('g1');
    expect(q).toHaveLength(6);
  });
});

describe('emojiFor', () => {
  it('分类映射与兜底', () => {
    expect(emojiFor('cat-sleep')).toBe('😴');
    expect(emojiFor('custom-id')).toBe('⏱️');
  });
});
