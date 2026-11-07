import { defineStore } from 'pinia';
import { syncNow, schedulePush, onSyncEvent } from '../db/sync.js';
import { isLoggedIn, getServerUrl, getAutoBackup, getLastSyncAt, setLastSyncAt } from '../auth/local.js';
import { getMeta, setMeta, setWriteHook } from '../db/repo.js';
import { api } from '../api/client.js';
import { logInfo, logError, logWarn } from '../lib/logger.js';

export const useSyncStore = defineStore('sync', {
  state: () => ({
    status: 'idle', // idle | syncing | ok | error
    lastSyncAt: getLastSyncAt() || null, // 持久化：刷新后仍能显示上次同步时间
    error: '',
    _timer: null,
    _bound: false,
  }),
  actions: {
    // 在 App 挂载后调用一次：启动定时/联网/回前台/写后触发的自动同步
    setup() {
      if (this._bound) return;
      this._bound = true;
      // 本地写入 → 3 秒防抖上推（putRow 经 enqueue 触发 writeHook；拉取写入不触发，无循环）
      setWriteHook(() => schedulePush());
      onSyncEvent(({ type, message }) => {
        if (type === 'start') this.status = 'syncing';
        else if (type === 'done') {
          this.status = 'ok';
          this.lastSyncAt = Date.now();
          setLastSyncAt(this.lastSyncAt);
          this.error = '';
          logInfo('sync', `同步成功 · ${getServerUrl() || '本机服务'}`);
          this.maybeAutoBackup();
        } else if (type === 'error') {
          this.status = 'error';
          this.error = message;
          logError('sync', `同步失败: ${message}`);
        }
      });
      window.addEventListener('online', () => this.trigger());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.trigger();
      });
      this._timer = setInterval(() => this.trigger(), 30_000);
      this.trigger();
    },
    trigger() {
      if (!isLoggedIn()) return;
      syncNow();
    },
    async syncManual() {
      if (!isLoggedIn()) return false;
      logInfo('sync', '手动触发同步');
      await syncNow();
      if (this.status === 'error') logWarn('sync', `手动同步失败: ${this.error}`);
      return this.status !== 'error';
    },
    // 自动每日备份：同步成功后检查，距上次快照超过 24 小时则让服务端做一次快照
    async maybeAutoBackup() {
      if (!getAutoBackup()) return;
      try {
        const last = await getMeta('lastBackupAt', 0);
        if (Date.now() - last < 24 * 3_600_000) return;
        const res = await api.serverBackup();
        await setMeta('lastBackupAt', Date.now());
        logInfo('backup', `每日快照完成: ${res.name}（${Math.round(res.size / 1024)}KB）`);
      } catch (e) {
        logError('backup', `自动备份失败: ${e?.message || e}`);
      }
    },
  },
});
