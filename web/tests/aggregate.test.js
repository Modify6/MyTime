import { describe, it, expect } from 'vitest';
import {
  dur,
  totalMs,
  byCategory,
  byTitle,
  fmtDur,
  reportText,
  estimateCompare,
  estimateByCategory,
} from '../src/stats/aggregate.js';
import { titleHint, categoryHint } from '../src/stats/historyHint.js';
import { shouldReplace } from '../src/db/merge.js';

const MIN = 60_000;
const HOUR = 3_600_000;

const ev = (id, title, categoryId, startAt, endAt, extra = {}) => ({
  id,
  title,
  categoryId,
  startAt,
  endAt,
  note: '',
  deleted: 0,
  createdAt: startAt,
  updatedAt: startAt,
  ...extra,
});

describe('fmtDur', () => {
  it('格式化时长', () => {
    expect(fmtDur(0)).toBe('0');
    expect(fmtDur(38_000)).toBe('38秒');
    expect(fmtDur(45 * MIN)).toBe('45分钟');
    expect(fmtDur(HOUR + 25 * MIN)).toBe('1小时25分');
    expect(fmtDur(3 * HOUR)).toBe('3小时');
  });
});

describe('聚合', () => {
  const events = [
    ev('1', '写论文', 'work', 0, 2 * HOUR),
    ev('2', '开会', 'work', 3 * HOUR, 4 * HOUR),
    ev('3', '英语听力', 'study', 5 * HOUR, 5 * HOUR + 50 * MIN),
    ev('4', '进行中', 'study', 6 * HOUR, null), // 不计时长
    ev('5', '写论文', 'work', 7 * HOUR, 8 * HOUR),
  ];

  it('dur/totalMs', () => {
    expect(dur(events[3])).toBe(0);
    expect(totalMs(events)).toBe(2 * HOUR + HOUR + 50 * MIN + HOUR);
  });

  it('byCategory 排序并过滤 0', () => {
    const r = byCategory(events);
    expect(r[0]).toEqual({ categoryId: 'work', ms: 4 * HOUR });
    expect(r[1].categoryId).toBe('study');
  });

  it('byTitle 按事项聚合', () => {
    const r = byTitle(events);
    expect(r[0].title).toBe('写论文');
    expect(r[0].count).toBe(2);
    expect(r[0].ms).toBe(3 * HOUR);
  });

  it('reportText 包含合计与分类', () => {
    const text = reportText({
      rangeStart: 0,
      events,
      categories: [
        { id: 'work', name: '工作' },
        { id: 'study', name: '学习' },
      ],
    });
    expect(text).toContain('合计纯时间 4小时50分');
    expect(text).toContain('【工作】4小时（82.8%）');
    expect(text).toContain('- 写论文 3小时');
  });
});

describe('historyHint（决策参照）', () => {
  const events = [
    ev('1', '写论文', 'work', 0, HOUR),
    ev('2', '写论文', 'work', 10 * HOUR, 10 * HOUR + 3 * HOUR),
    ev('3', '跑步', 'sport', 20 * HOUR, 20 * HOUR + 30 * MIN),
  ];

  it('同名事项：上次/平均/次数', () => {
    const h = titleHint(events, '写论文');
    expect(h.count).toBe(2);
    expect(h.lastMs).toBe(3 * HOUR);
    expect(h.avgMs).toBe(2 * HOUR);
  });

  it('分类次级参照', () => {
    expect(categoryHint(events, 'sport').avgMs).toBe(30 * MIN);
    expect(titleHint(events, '不存在')).toBe(null);
    expect(titleHint(events, '  ')).toBe(null);
  });
});

describe('计划 vs 实际', () => {
  const events = [
    ev('1', '写论文', 'work', 0, HOUR, { estimateMs: 2 * HOUR }), // 实际1h / 预估2h
    ev('2', '开会', 'work', 2 * HOUR, 3 * HOUR, { estimateMs: HOUR }), // 实际1h / 预估1h
    ev('3', '无预估', 'other', 4 * HOUR, 5 * HOUR),
    ev('4', '进行中', 'work', 6 * HOUR, null, { estimateMs: HOUR }), // 进行中不计
  ];

  it('estimateCompare 汇总并计算偏差', () => {
    const r = estimateCompare(events);
    expect(r.count).toBe(2);
    expect(r.estMs).toBe(3 * HOUR);
    expect(r.actMs).toBe(2 * HOUR);
    expect(r.pct).toBe(-33); // (2-3)/3
  });

  it('无预估事件返回 null', () => {
    expect(estimateCompare([ev('9', 'x', 0, HOUR)])).toBe(null);
  });

  it('estimateByCategory 按分类汇总', () => {
    const r = estimateByCategory(events);
    expect(r).toHaveLength(1);
    expect(r[0].categoryId).toBe('work');
    expect(r[0].estMs).toBe(3 * HOUR);
    expect(r[0].actMs).toBe(2 * HOUR);
  });

  it('报告含预估偏差行', () => {
    const text = reportText({
      rangeStart: 0,
      events,
      categories: [{ id: 'work', name: '工作' }],
    });
    expect(text).toContain('预估 3小时 · 实际 2小时（偏差 -33%）');
  });
});

describe('LWW 合并规则', () => {
  it('远端更新才覆盖', () => {
    expect(shouldReplace(null, { updatedAt: 1 })).toBe(true);
    expect(shouldReplace({ updatedAt: 10 }, { updatedAt: 11 })).toBe(true);
    expect(shouldReplace({ updatedAt: 10 }, { updatedAt: 10 })).toBe(false);
    expect(shouldReplace({ updatedAt: 10 }, { updatedAt: 9 })).toBe(false);
    expect(shouldReplace({ updatedAt: 10 }, null)).toBe(false);
  });
});
