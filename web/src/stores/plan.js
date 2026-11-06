import { defineStore } from 'pinia';
import { getPlans, putRow, softDelete, appendPlanLog, getPlanEvents, onChange } from '../db/repo.js';
import { uuid } from '../lib/util.js';
import { logInfo } from '../lib/logger.js';
import { useTimerStore } from './timer.js';

export const PLAN_STATUS = {
  WAITING: 'waiting', // 等待执行
  ACTIVE: 'active', // 执行中
  PAUSED: 'paused', // 挂起（等待后续执行）
  DONE: 'done', // 完成
  CANCELLED: 'cancelled', // 取消
};

// 状态机合法转换（防非法跳转）
const CAN_TRANSITION = {
  waiting: ['active', 'done', 'cancelled'],
  active: ['paused', 'done', 'cancelled'],
  paused: ['active', 'done', 'cancelled'],
  done: [],
  cancelled: [],
};

// 挂起原因预设（调度弹窗 / 手动挂起共用）
export const PAUSE_REASONS = ['临时插入更紧急的事', '等待外部条件', '被他人打断', '先处理其他事'];

// 调度状态机：预排计划与临时计划统一管理
// - 同一时刻仅一个 active 计划（纯时间串行原则）
// - 启动新计划遇冲突时必须对当前计划做「挂起（填原因）」或「结束（填原因）」
// - 任何路径结束计时段（通知/磁贴/手动）→ reconcile 自动把计划转「挂起」，原因可补填
export const usePlanStore = defineStore('plan', {
  state: () => ({ plans: [], loaded: false, _reconciling: false }),
  getters: {
    activePlan: (s) => s.plans.find((p) => p.status === 'active') || null,
    pausedPlans: (s) =>
      s.plans.filter((p) => p.status === 'paused').sort((a, b) => b.updatedAt - a.updatedAt),
    waitingPlans: (s) =>
      s.plans.filter((p) => p.status === 'waiting').sort((a, b) => a.createdAt - b.createdAt),
    finishedPlans: (s) =>
      s.plans
        .filter((p) => p.status === 'done' || p.status === 'cancelled')
        .sort((a, b) => b.updatedAt - a.updatedAt),
    byId: (s) => (id) => s.plans.find((p) => p.id === id) || null,
  },
  actions: {
    async load() {
      this.plans = await getPlans();
      this.loaded = true;
    },
    watch() {
      return onChange(() => this.reconcile());
    },
    async create({ title, categoryId, goalId = null, estimateMs = null, kind = 'planned', note = '', plannedDate = null }) {
      if (!title?.trim()) throw new Error('请填写计划名称');
      if (!['planned', 'temp'].includes(kind)) throw new Error('计划类型非法');
      const plan = {
        id: uuid(),
        title: title.trim(),
        categoryId,
        goalId: goalId || null,
        estimateMs: estimateMs > 0 ? estimateMs : null,
        note: note || '',
        kind, // planned=提前规划 | temp=临时
        status: 'waiting',
        pauseReason: null,
        endReason: null,
        plannedDate: plannedDate || null,
        createdAt: Date.now(),
      };
      await putRow('plans', plan);
      await this.appendLog(plan.id, 'create', null);
      logInfo('plan', `新建${kind === 'planned' ? '预排' : '临时'}计划「${plan.title}」`);
      return plan;
    },
    async remove(id) {
      await softDelete('plans', id);
      logInfo('plan', '删除计划');
    },
    // 编辑保存（不改动状态机字段：status/pauseReason/endReason 由调度方法管理）
    async saveRaw(row) {
      const old = this.byId(row.id);
      if (!old) throw new Error('计划不存在');
      await putRow('plans', {
        ...row,
        status: old.status,
        pauseReason: old.pauseReason,
        endReason: old.endReason,
      });
    },

    // —— 调度核心：启动（支持对当前计划的挂起/结束，原因必填） ——
    async start(id, handoff = null) {
      const plan = this.byId(id);
      if (!plan || plan.deleted) throw new Error('计划不存在');
      if (!CAN_TRANSITION[plan.status].includes('active')) throw new Error(`当前状态(${plan.status})不能启动`);

      const timer = useTimerStore();
      const runningEv = timer.runningEvent;
      if (runningEv && runningEv.planId === id) return; // 已在执行该计划
      if (runningEv) {
        // 有其他执行中：必须给出处置方式与原因
        if (handoff?.action === 'finish') {
          await this._stopActive('done', 'done', handoff.reason);
        } else if (handoff?.action === 'pause') {
          await this._stopActive('paused', 'pause', handoff.reason);
        } else {
          throw new Error('当前有执行中的任务，请选择挂起或结束并填写原因');
        }
      } else if (timer.running.length) {
        // 手动打卡的运行中事件（无计划归属）：直接结束落账
        await timer.stopCurrent();
      }

      await timer.start({
        title: plan.title,
        categoryId: plan.categoryId,
        goalId: plan.goalId,
        planId: plan.id,
        estimateMs: plan.estimateMs,
      });
      await putRow('plans', { ...plan, status: 'active' });
      await this.appendLog(id, plan.status === 'paused' ? 'resume' : 'start', null);
      logInfo('plan', `${plan.status === 'paused' ? '恢复' : '启动'}计划「${plan.title}」`);
    },

    // —— 挂起 / 完成 / 取消 ——
    async pauseActive(reason = null) {
      await this._stopActive('paused', 'pause', reason);
    },
    async finishActive({ status = 'done', reason = null } = {}) {
      if (!['done', 'cancelled'].includes(status)) throw new Error('结束状态非法');
      await this._stopActive(status, status === 'done' ? 'done' : 'cancel', reason);
    },
    // 非运行中计划的结束（挂起/等待列表里直接完成或取消）
    async closeById(id, status, reason = null) {
      const plan = this.byId(id);
      if (!plan) throw new Error('计划不存在');
      if (!CAN_TRANSITION[plan.status].includes(status)) throw new Error(`当前状态(${plan.status})不能转为${status}`);
      await putRow('plans', { ...plan, status, endReason: reason || plan.endReason });
      await this.appendLog(id, status === 'done' ? 'done' : 'cancel', reason);
      logInfo('plan', `计划「${plan.title}」→ ${status}`);
    },

    // 内部：结束当前计时段并迁移计划状态
    async _stopActive(newStatus, logAction, reason = null) {
      const plan = this.activePlan;
      if (!plan) return;
      const timer = useTimerStore();
      if (timer.runningEvent) await timer.stopCurrent();
      await putRow('plans', {
        ...plan,
        status: newStatus,
        pauseReason: logAction === 'pause' ? reason || plan.pauseReason : plan.pauseReason,
        endReason: logAction !== 'pause' ? reason || plan.endReason : plan.endReason,
      });
      await this.appendLog(plan.id, logAction, reason);
    },

    async appendLog(planId, action, reason = null) {
      await appendPlanLog(planId, action, reason);
    },

    // —— 自愈：任何路径结束了计时段（通知/磁贴/直接结束打卡）→ 计划自动转挂起 ——
    async reconcile() {
      if (this._reconciling) return;
      this._reconciling = true;
      try {
        await this.load();
        const plan = this.activePlan;
        if (!plan) return;
        const timer = useTimerStore();
        if (timer.runningEvent?.planId === plan.id) return; // 仍在执行，正常
        const evs = await getPlanEvents(plan.id);
        const finished = evs.filter((e) => e.endAt != null).sort((a, b) => b.endAt - a.endAt)[0];
        if (finished) {
          await putRow('plans', { ...plan, status: 'paused' });
          await this.appendLog(plan.id, 'pause', '计时结束（原因待补充）');
          logInfo('plan', `计划「${plan.title}」计时段结束，已自动挂起`);
        }
      } finally {
        this._reconciling = false;
      }
    },
  },
});
