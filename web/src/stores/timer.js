import { defineStore } from 'pinia';
import { getRunningEvents, putRow, onChange } from '../db/repo.js';
import { uuid } from '../lib/util.js';
import { nativeTimer, isNative } from '../lib/native.js';
import { logInfo, logError } from '../lib/logger.js';

// 计时器：同一时刻只允许一个进行中的事件（柳比歇夫"纯时间"串行记录）
// 进行中事件也参与同步 —— 手机上开始、电脑上结束天然可用
export const useTimerStore = defineStore('timer', {
  state: () => ({ running: [], now: Date.now(), _tick: null }),
  getters: {
    runningEvent: (s) => s.running[0] || null,
    extraRunning: (s) => (s.running.length > 1 ? s.running.slice(1) : []),
    elapsedMs: (s) => (s.running[0] ? Math.max(0, s.now - s.running[0].startAt) : 0),
  },
  actions: {
    async refresh() {
      this.running = (await getRunningEvents()).sort((a, b) => b.startAt - a.startAt);
      this._ensureTick();
    },
    // 订阅仓库变更（本地写入或同步拉取后自动刷新），返回取消函数
    watch() {
      return onChange(() => this.refresh());
    },
    _ensureTick() {
      if (this.running.length && !this._tick) {
        this._tick = setInterval(() => (this.now = Date.now()), 1000);
      } else if (!this.running.length && this._tick) {
        clearInterval(this._tick);
        this._tick = null;
      }
    },
    async start({ title, categoryId, goalId = null }) {
      if (this.running.length) throw new Error('已有进行中的计时，请先结束');
      const ev = {
        id: uuid(),
        title: (title || '').trim() || '未命名事项',
        categoryId,
        goalId: goalId || null,
        startAt: Date.now(),
        endAt: null,
        note: '',
        createdAt: Date.now(),
      };
      await putRow('events', ev);
      await this.refresh();
      // 原生 App：启动通知栏常驻计时（灵动岛式胶囊的数据源）
      const nt = nativeTimer();
      if (nt) {
        try {
          nt.ensureNotificationPermission?.();
          nt.start({ title: ev.title, startAt: ev.startAt });
          logInfo('timer', `已开始「${ev.title}」· 原生通知已启动`);
        } catch (e) {
          logError('timer', `原生通知启动失败: ${e?.message || e}`);
        }
      } else {
        logInfo('timer', `已开始「${ev.title}」${isNative ? '' : '（网页环境，无常驻通知）'}`);
      }
      return ev;
    },
    async stopCurrent({ note, goalId } = {}) {
      const ev = this.runningEvent;
      if (!ev) return null;
      const patch = { ...ev, endAt: Date.now() };
      if (note !== undefined) patch.note = note;
      if (goalId !== undefined) patch.goalId = goalId || null;
      await putRow('events', patch);
      await this.refresh();
      nativeTimer()?.stop();
      logInfo('timer', `已结束「${ev.title}」用时 ${Math.round((patch.endAt - ev.startAt) / 1000)}秒`);
      return patch;
    },
    async discardCurrent() {
      const ev = this.runningEvent;
      if (!ev) return;
      await putRow('events', { ...ev, deleted: 1 });
      await this.refresh();
      nativeTimer()?.stop();
      logInfo('timer', `已放弃「${ev.title}」`);
    },
  },
});
