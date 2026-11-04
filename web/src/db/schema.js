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
