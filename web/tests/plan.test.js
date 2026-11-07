// 计划调度单测：start 处置全部运行中计时（计划迁移/手动落账/原因写入/跨设备并行）
// 隔离策略：fake-indexeddb 真库，每用例前删除并重建
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

let repo, schema, plan, timer;

beforeEach(async () => {
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  if (!globalThis.__mytimeIdbFactory) {
    globalThis.__mytimeIdbFactory = new IDBFactory();
    globalThis.indexedDB = globalThis.__mytimeIdbFactory;
    globalThis.IDBKeyRange = IDBKeyRange;
  }
  if (!schema) {
    repo = await import('../src/db/repo.js');
    schema = await import('../src/db/schema.js');
  }
  await schema.db.delete();
  await schema.db.open();
  const { usePlanStore } = await import('../src/stores/plan.js');
  const { useTimerStore } = await import('../src/stores/timer.js');
  setActivePinia(createPinia());
  plan = usePlanStore();
  timer = useTimerStore();
  await plan.load();
});

const mkPlan = async (title) => {
  const p = await plan.create({ title, categoryId: 'cat-work', kind: 'temp' });
  await plan.load(); // create 后回读，保证 byId 拿到完整行
  return plan.byId(p.id);
};

describe('plan store 调度核心', () => {
  it('手动打卡运行中：启动计划-全部挂起 → 手动事件落账+备注，计划 active', async () => {
    const manual = await timer.start({ title: '随手记', categoryId: 'cat-work' });
    const p = await mkPlan('写周报');

    await plan.start(p.id, { action: 'pause', reason: '临时插入更紧急的事' });

    const evs = await repo.getAllEvents();
    const stopped = evs.find((e) => e.id === manual.id);
    expect(stopped.endAt).not.toBeNull();
    expect(stopped.note).toContain('被抢占');
    expect(stopped.note).toContain('临时插入更紧急的事');

    await plan.load();
    expect(plan.byId(p.id).status).toBe('active');
    expect(timer.runningEvent.planId).toBe(p.id);
    expect(timer.running).toHaveLength(1);
  });

  it('计划运行中：启动另一计划-全部结束 → 原计划 done+endReason，事件落账', async () => {
    const p1 = await mkPlan('任务A');
    await plan.start(p1.id, null);
    const p2 = await mkPlan('任务B');

    await plan.start(p2.id, { action: 'finish', reason: '按计划完成' });

    await plan.load();
    expect(plan.byId(p1.id).status).toBe('done');
    expect(plan.byId(p1.id).endReason).toBe('按计划完成');
    expect(plan.byId(p2.id).status).toBe('active');
    expect(timer.running).toHaveLength(1);
    const logs = await repo.getPlanLogs(p1.id);
    expect(logs.some((l) => l.action === 'done' && l.reason === '按计划完成')).toBe(true);
  });

  it('有运行中且未给 handoff：start 抛错且不改变任何状态', async () => {
    await timer.start({ title: '手动中', categoryId: 'cat-work' });
    const p = await mkPlan('任务C');

    await expect(plan.start(p.id)).rejects.toThrow('请选择挂起或结束');

    await plan.load();
    expect(plan.byId(p.id).status).toBe('waiting');
    expect(timer.running).toHaveLength(1); // 原计时未被误伤
  });

  it('跨设备并行：两条 running（一计划一手动）→ 全部结束 → 全部落账', async () => {
    const p = await mkPlan('跨设备计划');
    // 模拟其他设备推来的两个并行 running 事件（本地库直接写入）
    const now = Date.now();
    await repo.putRow('events', {
      id: 'ev-remote-plan', title: '远端计划段', categoryId: 'cat-work', goalId: null,
      planId: p.id, startAt: now - 60000, endAt: null, note: '', estimateMs: null, createdAt: now,
    });
    await repo.putRow('events', {
      id: 'ev-remote-manual', title: '远端手动', categoryId: 'cat-work', goalId: null,
      planId: null, startAt: now - 30000, endAt: null, note: '', estimateMs: null, createdAt: now,
    });
    await timer.refresh();
    expect(timer.running).toHaveLength(2);

    const p2 = await mkPlan('接管任务');
    await plan.start(p2.id, { action: 'finish', reason: '清理并行' });

    const evs = await repo.getAllEvents();
    expect(evs.find((e) => e.id === 'ev-remote-plan').endAt).not.toBeNull();
    expect(evs.find((e) => e.id === 'ev-remote-manual').endAt).not.toBeNull();
    await plan.load();
    expect(plan.byId(p.id).status).toBe('done');
    expect(timer.running).toHaveLength(1);
    expect(timer.runningEvent.planId).toBe(p2.id);
  });

  it('计划已在执行但存在并行计时：仅处置其他事件，本计划计时段保留', async () => {
    const p = await mkPlan('保持运行');
    await plan.start(p.id, null);
    const firstSegId = timer.runningEvent.id;
    // 其他设备并行插入一个手动 running
    const now = Date.now();
    await repo.putRow('events', {
      id: 'ev-other', title: '别处的计时', categoryId: 'cat-work', goalId: null,
      planId: null, startAt: now - 10000, endAt: null, note: '', estimateMs: null, createdAt: now,
    });
    await timer.refresh();

    await plan.start(p.id, { action: 'pause', reason: '清理并行' });

    const evs = await repo.getAllEvents();
    expect(evs.find((e) => e.id === firstSegId).endAt).toBeNull(); // 本段仍在跑
    expect(evs.find((e) => e.id === 'ev-other').endAt).not.toBeNull();
    expect(timer.running).toHaveLength(1);
  });

  it('恢复 paused 计划：状态转 active 且日志记 resume', async () => {
    const p = await mkPlan('挂起后恢复');
    await plan.start(p.id, null);
    await plan.pauseActive('等待外部条件');
    await plan.load();
    expect(plan.byId(p.id).status).toBe('paused');

    await plan.start(p.id, null);
    await plan.load();
    expect(plan.byId(p.id).status).toBe('active');
    const logs = await repo.getPlanLogs(p.id);
    expect(logs.some((l) => l.action === 'resume')).toBe(true);
  });

  it('settleRunning：手动打卡路径处置全部后可开始新手动计时', async () => {
    await timer.start({ title: '旧打卡', categoryId: 'cat-work' });
    await plan.settleRunning({ action: 'pause', reason: '先处理其他事' });
    expect(timer.running).toHaveLength(0);

    const ev = await timer.start({ title: '新打卡', categoryId: 'cat-work' });
    expect(ev.planId).toBeNull();
    const evs = await repo.getAllEvents();
    expect(evs.find((e) => e.title === '旧打卡').endAt).not.toBeNull();
  });
});
