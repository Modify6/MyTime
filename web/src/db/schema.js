import Dexie from 'dexie';

// 本地库：业务表 + outbox(待同步队列) + meta(同步游标) + logs(运行日志)
export const db = new Dexie('mytime');

db.version(1).stores({
  // 索引字段 only（非索引数据自动存储）
  events: 'id, categoryId, startAt, endAt, createdAt, updatedAt, deleted',
  categories: 'id, name, updatedAt, deleted',
  outbox: '++seq, key',
  meta: 'key',
  logs: '++id, at',
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

// v4：事件组模板 + 计划的模板来源/实例分组（v0.14.0 模板实例化）
db.version(4).stores({
  plans: 'id, updatedAt, status, kind, templateId, instanceId',
  templates: 'id, name, updatedAt, deleted',
});

// 临时调试钩子（E2E 排查用）
if (typeof window !== 'undefined') window.__mytimeDebug = { db };
