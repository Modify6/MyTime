import { defineStore } from 'pinia';
import { syncNow, onSyncEvent } from '../db/sync.js';
import { isLoggedIn, getServerUrl } from '../auth/local.js';
import { logInfo, logWarn, logError } from '../lib/logger.js';

export const useSyncStore = defineStore('sync', {
  state: () => ({
    status: 'idle', // idle | syncing | ok | error
    lastSyncAt: null,
    error: '',
    _timer: null,
    _bound: false,
  }),
  actions: {
    // 在 App 挂载后调用一次：启动定时/联网/回前台触发的自动同步
    setup() {
      if (this._bound) return;
      this._bound = true;
      onSyncEvent(({ type, message }) => {
        if (type === 'start') this.status = 'syncing';
        else if (type === 'done') {
          this.status = 'ok';
          this.lastSyncAt = Date.now();
          this.error = '';
          logInfo('sync', `同步成功 · ${getServerUrl() || '本机服务'}`);
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
  },
});
