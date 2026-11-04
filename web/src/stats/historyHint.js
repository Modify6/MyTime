// 决策参照：开始一件事之前，看看历史上它花了多久（柳比歇夫法的核心反馈闭环）
import { dur } from './aggregate.js';

function summarize(matched) {
  if (!matched.length) return null;
  const ds = matched.map(dur).filter((d) => d > 0);
  if (!ds.length) return null;
  const last = matched.reduce((a, b) => (a.startAt > b.startAt ? a : b));
  const total = ds.reduce((a, b) => a + b, 0);
  return {
    count: matched.length,
    lastMs: dur(last),
    avgMs: Math.round(total / ds.length),
  };
}

// 同名事项的历史用时
export function titleHint(events, title) {
  const t = (title || '').trim();
  if (!t) return null;
  return summarize(events.filter((e) => (e.title || '').trim() === t && e.endAt != null && !e.deleted));
}

// 同分类的历史用时（事项名没匹配上时的次级参照）
export function categoryHint(events, categoryId) {
  if (!categoryId) return null;
  return summarize(events.filter((e) => e.categoryId === categoryId && e.endAt != null && !e.deleted));
}
