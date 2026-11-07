// 同步引擎：推本端变更（LWW 合并到服务端）→ 拉服务端增量 → 推进游标；离线静默失败，恢复后自动重试
import { db } from './schema.js';
import { adoptRow, getMeta, setMeta } from './repo.js';
import { api } from '../api/client.js';
import { getToken } from '../auth/local.js';

const listeners = new Set();
export function onSyncEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(type, message) {
  for (const fn of [...listeners]) {
    try {
      fn({ type, message });
    } catch {}
  }
}

let syncing = false;

// 写后防抖上推：本地写入（putRow → enqueue → writeHook）后 3 秒内合并为一次推送。
// 独立于 30s 轮询/前台切换——让"另一台设备 ≤30s 可见"缩到"≤3s 已出本机"。
let pushTimer = null;
export function schedulePush(delay = 3000) {
  if (!getToken()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    syncNow();
  }, delay);
}

export async function syncNow() {
  if (syncing || !getToken()) return;
  syncing = true;
  emit('start');
  try {
    // outbox 在网络请求期间可能继续增长，循环推拉直到清空（设上限防意外死循环）
    for (let round = 0; round < 5; round++) {
      const pending = await db.outbox.toArray();
      const since = await getMeta('cursor', 0);
      const res = await api.sync({
        since,
        changes: pending.map((c) => ({ table: c.table, rows: [c.row] })),
      });
      // 按 seq 精确出队，避免误删请求期间新增的条目
      if (pending.length) await db.outbox.bulkDelete(pending.map((c) => c.seq));

      let maxRev = 0;
      for (const { table, row } of res.changes || []) {
        if (row && typeof row.serverRev === 'number' && row.serverRev > maxRev) maxRev = row.serverRev;
        await adoptRow(table, row);
      }
      // 游标回退 1ms：消除同一毫秒内新写入被跳过的边界（重复拉取是幂等的）
      await setMeta('cursor', Math.max(maxRev, res.serverTime) - 1);

      if (!(await db.outbox.count())) break;
    }
    emit('done');
  } catch (e) {
    emit('error', e?.message || '同步失败');
  } finally {
    syncing = false;
  }
}
