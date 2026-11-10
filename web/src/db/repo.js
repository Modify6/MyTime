// 数据仓库层：所有本地写入的必经之路 —— 写 IndexedDB + 进 outbox 队列 + 通知订阅者刷新
import { db } from './schema.js';
import { shouldReplace } from './merge.js';
import { uuid } from '../lib/util.js';

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 本地写入钩子：enqueue（本地写）后触发，供同步层接线"写后防抖上推"。
// 独立于 onChange（那会连 adoptRow 拉取写入一起通知）——避免拉→推循环。
// 不直接 import sync.js：sync.js 依赖本模块，反向引用会造成环依赖。
let writeHook = null;
export function setWriteHook(fn) {
  writeHook = typeof fn === 'function' ? fn : null;
}

let scheduled = false;
function bump() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const fn of [...listeners]) {
      try {
        // listener 可能是 async（如 store.load）——同步 try/catch 接不住 await 后
        // 的 rejection（会逃逸成 unhandled rejection 干扰全局），统一转 Promise 捕获
        const r = fn();
        if (r && typeof r.catch === 'function') r.catch((e) => console.error(e));
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
  try {
    writeHook?.();
  } catch {}
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

// —— 计划系统 ——
export const getPlans = () => db.plans.toArray();
export const getPlanLogs = (planId) => db.planLogs.where('planId').equals(planId).toArray();
export const getAllPlanLogs = () => db.planLogs.toArray();
export const getTemplates = () => db.templates.toArray(); // items 为 JSON 字符串，读取方解析 // 复盘页按周期过滤用（个人量级全量可接受）
export const getPlanEvents = (planId) =>
  db.events.where('planId').equals(planId).and((e) => !e.deleted).toArray();
export const appendPlanLog = (planId, action, reason = null) =>
  putRow('planLogs', { id: uuid(), planId, action, reason, at: Date.now() });

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
