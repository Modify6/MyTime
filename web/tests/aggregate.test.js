import { describe, it, expect } from 'vitest';
import { dur, totalMs, byCategory, byTitle, fmtDur, reportText } from '../src/stats/aggregate.js';
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

describe('LWW 合并规则', () => {
  it('远端更新才覆盖', () => {
    expect(shouldReplace(null, { updatedAt: 1 })).toBe(true);
    expect(shouldReplace({ updatedAt: 10 }, { updatedAt: 11 })).toBe(true);
    expect(shouldReplace({ updatedAt: 10 }, { updatedAt: 10 })).toBe(false);
    expect(shouldReplace({ updatedAt: 10 }, { updatedAt: 9 })).toBe(false);
    expect(shouldReplace({ updatedAt: 10 }, null)).toBe(false);
  });
});
