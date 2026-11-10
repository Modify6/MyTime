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
  state: () => ({ plans: [], loaded: false, _reconciling: false, templates: [] }),
  getters: {
    templateById: (s) => (id) => s.templates.find((t) => t.id === id) || null,
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

    // —— 调度核心：启动（处置全部运行中计时，原因必填） ——
    async start(id, handoff = null) {
      await this.load(); // 先回读库，避免依赖 watch 延迟导致拿到旧状态
      const plan = this.byId(id);
      if (!plan || plan.deleted) throw new Error('计划不存在');

      const timer = useTimerStore();
      // 强制刷新：拉取含跨设备事件的最新运行状态，缩小竞态窗口
      await timer.refresh();

      if (timer.running.some((e) => e.planId === id)) {
        // 已在执行该计划：修复状态错位；存在并行计时（跨设备产生）时仅处置其他事件
        if (plan.status !== 'active') {
          await putRow('plans', { ...plan, status: 'active' });
          await this.appendLog(id, 'resume', null);
        }
        if (timer.running.length > 1) {
          if (!handoff?.action) throw new Error('当前有执行中的任务，请选择挂起或结束并填写原因');
          await this._settleAllRunning(
            handoff.action === 'finish' ? 'done' : 'paused',
            handoff.action === 'finish' ? 'done' : 'pause',
            handoff.reason,
            id
          );
        }
        return;
      }

      if (!CAN_TRANSITION[plan.status].includes('active')) throw new Error(`当前状态(${plan.status})不能启动`);

      if (timer.running.length) {
        // 有运行中的计时：必须处置全部（挂起 or 结束），原因必填
        if (handoff?.action === 'finish') {
          await this._settleAllRunning('done', 'done', handoff.reason);
        } else if (handoff?.action === 'pause') {
          await this._settleAllRunning('paused', 'pause', handoff.reason);
        } else {
          throw new Error('当前有执行中的任务，请选择挂起或结束并填写原因');
        }
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

    // 手动打卡统一调度：按 handoff 处置全部运行中计时（有计划的迁移状态，手动的落账）
    async settleRunning(handoff) {
      if (!handoff?.action) throw new Error('请选择挂起或结束并填写原因');
      await this._settleAllRunning(
        handoff.action === 'finish' ? 'done' : 'paused',
        handoff.action === 'finish' ? 'done' : 'pause',
        handoff.reason
      );
    },

    // 处置全部运行中计时：有计划归属的按状态机迁移，手动打卡直接结束落账（被抢占说明写入备注）
    async _settleAllRunning(newStatus, logAction, reason = null, excludePlanId = null) {
      const timer = useTimerStore();
      for (const ev of [...timer.running]) {
        if (excludePlanId && ev.planId === excludePlanId) continue; // 保留该计划的计时段
        if (ev.planId) {
          const owner = this.byId(ev.planId);
          if (owner && CAN_TRANSITION[owner.status].includes(newStatus)) {
            await putRow('plans', {
              ...owner,
              status: newStatus,
              pauseReason: logAction === 'pause' ? reason || owner.pauseReason : owner.pauseReason,
              endReason: logAction !== 'pause' ? reason || owner.endReason : owner.endReason,
            });
            await this.appendLog(owner.id, logAction, reason);
          }
        }
        const preNote = ev.note ? `${ev.note}；` : '';
        await timer.stopCurrent({ eventId: ev.id, note: `${preNote}被抢占：${reason || '未填写原因'}` });
      }
    },

    // —— 挂起 / 完成 / 取消（仅作用于 active 计划的当前段） ——
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

    // 内部：结束 active 计划的当前计时段并迁移计划状态
    async _stopActive(newStatus, logAction, reason = null) {
      await this.load(); // 先回读库，避免依赖 watch 延迟导致拿到旧状态
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

    // —— 事件组模板：定义一组子任务，一键实例化为待执行计划组 ——
    async loadTemplates() {
      const rows = await getTemplates();
      this.templates = rows.map((t) => {
        let items = [];
        try { items = JSON.parse(t.items || '[]'); } catch {}
        return { ...t, items };
      });
    },
    async saveTemplate({ id, name, items }) {
      if (!name?.trim()) throw new Error('请填写模板名称');
      const clean = (items || []).filter((it) => it.title?.trim());
      if (!clean.length) throw new Error('至少保留一个子任务');
      const row = {
        id: id || uuid(),
        name: name.trim(),
        items: JSON.stringify(clean.map((it) => ({ title: it.title.trim(), estimateMs: it.estimateMs > 0 ? it.estimateMs : null }))),
        createdAt: id ? this.templateById(id)?.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
        deleted: 0,
      };
      await putRow('templates', row);
      await this.loadTemplates();
      logInfo('plan', id ? `更新模板「${row.name}」` : `新建模板「${row.name}」（${clean.length} 个子任务）`);
      return row;
    },
    async removeTemplate(id) {
      await softDelete('templates', id);
      await this.loadTemplates();
      logInfo('plan', '删除模板');
    },
    // 实例化：每个子任务生成一个 waiting 计划，共享 templateId + instanceId（统计按 instanceId 归组）
    async instantiateTemplate(templateId) {
      const t = this.templateById(templateId);
      if (!t || !t.items.length) throw new Error('模板不存在或为空');
      const instanceId = uuid();
      const now = Date.now();
      for (const it of t.items) {
        await putRow('plans', {
          id: uuid(),
          title: it.title,
          categoryId: 'cat-work',
          goalId: null,
          estimateMs: it.estimateMs || null,
          note: '',
          kind: 'planned',
          status: 'waiting',
          pauseReason: null,
          endReason: null,
          plannedDate: null,
          templateId,
          instanceId,
          createdAt: now,
        });
      }
      await this.load();
      logInfo('plan', `从模板「${t.name}」创建 ${t.items.length} 个待执行计划`);
      return { instanceId, count: t.items.length, name: t.name };
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
