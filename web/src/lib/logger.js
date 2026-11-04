// 应用内运行日志：Dexie 环形缓冲（保留最近 500 条），设置页可查看/复制/导出
// 用途：APK 装到真机后排查问题（同步失败、原生通知、报错等），日志自带版本号
import { db } from '../db/schema.js';

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

let trimCounter = 0;

export async function log(level, tag, msg) {
  try {
    await db.logs.add({ time: Date.now(), level, tag, msg: String(msg).slice(0, 500) });
    // 每 50 条做一次裁剪，避免频繁 count
    if (++trimCounter % 50 === 0) {
      const count = await db.logs.count();
      if (count > 500) {
        const excess = await db.logs.orderBy('seq').limit(count - 500).primaryKeys();
        await db.logs.bulkDelete(excess);
      }
    }
  } catch {
    // 日志自身绝不能影响主流程
  }
}

export const logInfo = (tag, msg) => log('info', tag, msg);
export const logWarn = (tag, msg) => log('warn', tag, msg);
export const logError = (tag, msg) => log('error', tag, msg);

export function initLogger() {
  window.addEventListener('error', (e) => log('error', 'window', e.message));
  window.addEventListener('unhandledrejection', (e) => log('error', 'promise', String(e.reason)));
  logInfo('app', `启动 v${APP_VERSION} · ${navigator.userAgent.slice(0, 100)}`);
}

export async function getLogs(limit = 200) {
  return db.logs.orderBy('seq').reverse().limit(limit).toArray();
}

export async function logsToText(limit = 200) {
  const rows = await getLogs(limit);
  const head = `MyTime 运行日志 v${APP_VERSION} · ${new Date().toLocaleString('zh-CN')}\n`;
  return (
    head +
    rows
      .reverse()
      .map((r) => `[${new Date(r.time).toLocaleString('zh-CN')}] ${r.level.toUpperCase()} [${r.tag}] ${r.msg}`)
      .join('\n')
  );
}

export const clearLogs = () => db.logs.clear();
