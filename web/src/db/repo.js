// 数据仓库层：所有本地写入的必经之路 —— 写 IndexedDB + 进 outbox 队列 + 通知订阅者刷新
import { db } from './schema.js';
import { shouldReplace } from './merge.js';

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let scheduled = false;
function bump() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
  });
}

export const tableOf = (table) => db[table];

async function enqueue(table, row) {
  const key = `${table}:${row.id}`;
  await db.transaction('rw', db.outbox, async () => {
    // 合并同一实体的历史待推条目，只推最新状态
    await db.outbox.where('key').equals(key).delete();
    await db.outbox.add({ key, table, row });
  });
}

// 本地编辑：盖当前时间戳并待同步
export async function putRow(table, row) {
  const r = { ...row, updatedAt: Date.now(), deleted: row.deleted ? 1 : 0 };
  await tableOf(table).put(r);
  await enqueue(table, r);
  bump();
  return r;
}

export async function softDelete(table, id) {
  const row = await tableOf(table).get(id);
  if (!row) return;
  await putRow(table, { ...row, deleted: 1 });
}

// 采纳一条远端/导入行（保留其 updatedAt 参与 LWW）；push=true 时推送（导入场景）
export async function adoptRow(table, row, { push = false } = {}) {
  if (!row || !row.id) return false;
  const local = await tableOf(table).get(row.id);
  if (!shouldReplace(local, row)) return false;
  const r = { ...row, deleted: row.deleted ? 1 : 0 };
  await tableOf(table).put(r);
  if (push) await enqueue(table, r);
  bump();
  return true;
}

// —— 查询辅助（个人量级，内存过滤足够） ——
export const getCategories = () => db.categories.toArray();
export const getGoals = () => db.goals.toArray();

// 事件归属其 startAt 所在时段
export const getEventsBetween = (start, end) =>
  db.events
    .where('startAt')
    .between(start, end, true, true)
    .and((e) => !e.deleted)
    .toArray();

export const getRunningEvents = () => db.events.filter((e) => !e.deleted && e.endAt == null).toArray();
export const getAllEvents = () => db.events.filter((e) => !e.deleted).toArray();

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}

// 首次启动播种默认分类（与服务器同 id，连接同步后会被服务端版本一致化）
const DEFAULT_CATEGORIES = [
  ['cat-sleep', '睡眠', '#7C4DFF'],
  ['cat-meal', '餐饮', '#FF7043'],
  ['cat-work', '工作', '#1E88E5'],
  ['cat-study', '学习', '#43A047'],
  ['cat-sport', '运动', '#00ACC1'],
  ['cat-commute', '通勤', '#8D6E63'],
  ['cat-fun', '娱乐', '#EC407A'],
  ['cat-chores', '家务', '#F0A800'],
  ['cat-other', '其他', '#90A4AE'],
];

export async function ensureSeed() {
  const n = await db.categories.count();
  if (n > 0) return;
  const now = Date.now();
  await db.categories.bulkPut(
    DEFAULT_CATEGORIES.map(([id, name, color], i) => ({
      id,
      name,
      color,
      sort: i,
      createdAt: now,
      updatedAt: now,
      deleted: 0,
    }))
  );
}
