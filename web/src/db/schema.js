import Dexie from 'dexie';

// 本地库：业务表 + outbox(待同步队列) + meta(同步游标) + logs(运行日志)
export const db = new Dexie('mytime');

db.version(1).stores({
  categories: 'id, updatedAt, sort',
  goals: 'id, updatedAt, archived',
  events: 'id, updatedAt, startAt, endAt, categoryId, goalId',
  outbox: '++seq, key',
  meta: 'key',
});

// v2：运行日志（环形缓冲，logger 负责裁剪）
db.version(2).stores({
  logs: '++seq, time',
});

// v3：计划系统（plans 计划 + planLogs 执行履历 + events 关联 planId）
db.version(3).stores({
  plans: 'id, updatedAt, status, kind',
  planLogs: 'id, planId, at',
  events: 'id, updatedAt, startAt, endAt, categoryId, goalId, planId',
});

// 临时调试钩子（E2E 排查用）
if (typeof window !== 'undefined') window.__mytimeDebug = { db };
