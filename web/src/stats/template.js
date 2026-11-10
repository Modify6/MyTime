// 模板统计：按实例（instanceId）归组——每次执行的总用时 + 平均/最多/最少
// 纯函数；events 需含 planId 关联（plans 由模板实例化时写入 planId 关联）
export function templateStats({ events, plans, templateId }) {
  const tPlans = plans.filter((p) => p.templateId === templateId && !p.deleted);
  const instances = new Map();
  for (const p of tPlans) {
    const key = p.instanceId || p.id;
    if (!instances.has(key)) instances.set(key, { instanceId: key, createdAt: p.createdAt, planIds: [] });
    instances.get(key).planIds.push(p.id);
  }
  const msByPlan = new Map();
  for (const e of events) {
    if (e.deleted || e.planId == null) continue;
    msByPlan.set(e.planId, (msByPlan.get(e.planId) || 0) + Math.max(0, (e.endAt ?? Date.now()) - e.startAt));
  }
  const rows = [...instances.values()]
    .map((inst) => {
      const actMs = inst.planIds.reduce((s, pid) => s + (msByPlan.get(pid) || 0), 0);
      const estMs = inst.planIds.reduce((s, pid) => {
        const p = tPlans.find((x) => x.id === pid);
        return s + (p?.estimateMs > 0 ? p.estimateMs : 0);
      }, 0);
      return { instanceId: inst.instanceId, createdAt: inst.createdAt, planCount: inst.planIds.length, actMs, estMs };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const runs = rows.filter((r) => r.actMs > 0).map((r) => r.actMs);
  return {
    instances: rows,
    runCount: runs.length,
    avgMs: runs.length ? Math.round(runs.reduce((s, m) => s + m, 0) / runs.length) : null,
    maxMs: runs.length ? Math.max(...runs) : null,
    minMs: runs.length ? Math.min(...runs) : null,
  };
}
