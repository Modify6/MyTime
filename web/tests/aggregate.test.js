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
  heatmapData,
  hourlySeries,
  overlapCount,
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

describe('专注热力图', () => {
  // 固定 end：2026-11-05（周四）12:00
  const END = new Date(2026, 10, 5, 12, 0).getTime();
  const at = (dayOffset, hour) => new Date(2026, 10, 5 + dayOffset, hour).getTime();
  const events = [
    ev('1', '写论文', 'work', at(0, 9), at(0, 11)), // 今天 2h → lv4
    ev('2', '阅读', 'study', at(-1, 8), at(-1, 8) + 20 * 60_000), // 昨天 20分 → lv1
    ev('3', '范围外旧事', 'work', at(-100, 9), at(-100, 10)), // 网格外，不影响统计
  ];

  it('两周矩阵：14 格、当天深色、未来空白、范围外不计', () => {
    const r = heatmapData(events, { weeks: 2, end: END });
    expect(r.cells).toHaveLength(14);
    expect(r.cells.at(-1).level).toBe(-1); // 未来
    expect(r.cells[10].level).toBe(4); // end 当天（周四=第 11 格）
    expect(r.cells[9].level).toBe(1); // 昨天 20 分
    expect(r.total).toBe(2 * HOUR + 20 * 60_000);
    expect(r.activeDays).toBe(2);
  });

  it('levelOf 分档边界', () => {
    const r = heatmapData(
      [
        ev('a', 'x', 'work', at(0, 0), at(0, 0) + 29 * 60_000),
        ev('b', 'y', 'work', at(0, 0), at(0, 0) + 30 * 60_000),
      ],
      { weeks: 2, end: END }
    );
    // 同一天两段累计 59 分 → lv2（<1小时）
    const today = r.cells[10];
    expect(today.ms).toBe(59 * 60_000);
    expect(today.level).toBe(2);
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

describe('hourlySeries', () => {
  const END = new Date(2026, 10, 12, 12, 0, 0).getTime(); // 固定窗口终点
  const day0 = new Date(END); day0.setHours(0, 0, 0, 0); // 午夜锚点
  const at = (dayAgo, h, m = 0) => day0.getTime() - dayAgo * 86_400_000 + h * 3_600_000 + m * 60_000;

  it('按 startAt 小时归属，同小时跨天合计', () => {
    const events = [
      ev('a', 'x', 'cat-a', at(1, 9), at(1, 10)), // 昨天上午 9-10 点
      ev('b', 'x', 'cat-a', at(2, 9), at(2, 10)), // 前天同时段 1h
    ];
    const [row] = hourlySeries(events, { days: 30, end: END });
    expect(row.categoryId).toBe('cat-a');
    expect(row.hours[9]).toBe(2 * HOUR);
    expect(row.hours.reduce((s, v) => s + v, 0)).toBe(2 * HOUR);
  });

  it('窗口外事件不计入', () => {
    const events = [
      ev('a', 'x', 'cat-a', END + HOUR, END + 2 * HOUR), // 窗口后
      ev('b', 'x', 'cat-a', END - 31 * 86_400_000, END - 31 * 86_400_000 + HOUR), // 窗口前
    ];
    const rows = hourlySeries(events, { days: 30, end: END });
    expect(rows.length ? rows[0].hours.reduce((s, v) => s + v, 0) : 0).toBe(0);
  });

  it('进行中事件（endAt null）不计', () => {
    const events = [ev('a', 'x', 'cat-a', at(0, 10), null)];
    const rows = hourlySeries(events, { days: 30, end: END });
    expect(rows.length ? rows[0].hours.reduce((s, v) => s + v, 0) : 0).toBe(0);
  });

  it('按分类分组为独立 series，顺序按首次出现', () => {
    const events = [
      ev('a', 'x', 'cat-a', at(1, 9), at(1, 10)),
      ev('b', 'x', 'cat-b', at(1, 14), at(1, 15)),
      ev('c', 'x', 'cat-a', at(1, 15), at(1, 16)),
    ];
    const rows = hourlySeries(events, { days: 30, end: END });
    expect(rows.map((r) => r.categoryId)).toEqual(['cat-a', 'cat-b']);
    expect(rows[0].hours[9]).toBe(HOUR);
    expect(rows[0].hours[15]).toBe(HOUR);
    expect(rows[1].hours[14]).toBe(HOUR);
  });
});

describe('overlapCount', () => {
  const NOW = new Date(2026, 10, 12, 12, 0, 0).getTime();
  const at = (h, m = 0) => new Date(2026, 10, 12, h, m, 0).getTime();

  it('无重叠返回 0，首尾相接不算重叠', () => {
    expect(overlapCount([
      ev('a', 'x', 'c', at(9), at(10)),
      ev('b', 'x', 'c', at(10), at(11)), // 相接
      ev('c', 'x', 'c', at(11, 30), at(12)), // 有空隙
    ])).toBe(0);
  });

  it('交叉计数：与此前任意一段重叠即计 1', () => {
    // 9-11、10:30-13、11:06-13 → 蓝、橙两条与前面重叠
    expect(overlapCount([
      ev('a', 'x', 'c', at(9), at(11)),
      ev('b', 'x', 'c', at(10, 30), at(13)),
      ev('c', 'x', 'c', at(11, 6), at(13)),
    ])).toBe(2);
  });

  it('进行中事件（endAt null）按当前时刻参与，软删不计', () => {
    const r = overlapCount([
      ev('a', 'x', 'c', at(9), at(11)),
      ev('b', 'x', 'c', at(10, 30), null), // 进行中，与 a 重叠
      ev('c', 'x', 'c', at(20), at(21), { deleted: 1 }),
    ]);
    expect(r).toBe(1);
  });
});
