<script setup>
// 计划详情：执行统计（总投入/段数/挂起次数/原因分布/预估vs实际）+ 履历时间线 + 关联事件
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { usePlanStore, PLAN_STATUS } from '../stores/plan.js';
import { useCatalogStore } from '../stores/catalog.js';
import { useTimerStore } from '../stores/timer.js';
import { getPlanEvents, getPlanLogs } from '../db/repo.js';
import { fmtDur } from '../lib/time.js';
import EventItem from '../components/EventItem.vue';
import PlanForm from '../components/PlanForm.vue';

const route = useRoute();
const router = useRouter();
const planStore = usePlanStore();
const catalog = useCatalogStore();
const timer = useTimerStore();

const events = ref([]);
const logs = ref([]);
const showForm = ref(false);
let un;

async function load() {
  await planStore.load();
  [events.value, logs.value] = await Promise.all([
    getPlanEvents(route.params.id),
    getPlanLogs(route.params.id),
  ]);
}
onMounted(async () => {
  un = planStore.watch(() => load());
  await load();
  await catalog.load();
});
onUnmounted(() => un?.());

const plan = computed(() => planStore.byId(route.params.id));
const KIND_LABEL = { planned: '提前规划', temp: '临时' };
const STATUS_LABEL = {
  [PLAN_STATUS.ACTIVE]: '执行中',
  [PLAN_STATUS.PAUSED]: '挂起中',
  [PLAN_STATUS.WAITING]: '等待执行',
  [PLAN_STATUS.DONE]: '已完成',
  [PLAN_STATUS.CANCELLED]: '已取消',
};

// —— 执行统计 ——
const totalMs = computed(() => events.value.reduce((s, e) => s + Math.max(0, (e.endAt ?? Date.now()) - e.startAt), 0));
const segCount = computed(() => events.value.length);
const pauseCount = computed(() => logs.value.filter((l) => l.action === 'pause').length);
const estimateDelta = computed(() => {
  if (!(plan.value?.estimateMs > 0) || totalMs.value <= 0) return null;
  return Math.round(((totalMs.value - plan.value.estimateMs) / plan.value.estimateMs) * 100);
});

// —— 中断原因分布 ——
const reasonStats = computed(() => {
  const m = new Map();
  for (const l of logs.value.filter((l) => l.action === 'pause')) {
    const key = l.reason || '未填写原因';
    m.set(key, (m.get(key) || 0) + 1);
  }
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
});

// —— 操作 ——
async function startIt() {
  try {
    await planStore.start(plan.value.id);
    showToast('已启动');
  } catch (e) {
    showToast(e.message || '启动失败');
  }
}
async function pauseIt() {
  await planStore.pauseActive('手动挂起');
  showToast('已挂起');
}
async function finishIt(status) {
  let reason = '';
  try {
    await showConfirmDialog({
      title: status === 'done' ? '完成该计划？' : '取消该计划？',
      message: '请填写原因（用于时间分配分析）：',
      showCancelButton: true,
      // Vant Confirm 不带输入框——用 prompt 样式的 Dialog 不支持；改为跳转编辑？简化：确认框确认后用默认原因，可在备注补充
    });
    reason = status === 'done' ? '确认完成' : '确认取消';
    await planStore.closeById(plan.value.id, status, reason);
    showToast(status === 'done' ? '已完成' : '已取消');
  } catch (e) {
    if (e?.message !== 'cancel') showToast('操作失败');
  }
}
async function removeIt() {
  await showConfirmDialog({ title: '删除计划？', message: '关联的事件记录会保留。' });
  await planStore.remove(plan.value.id);
  showToast('已删除');
  router.replace('/plans');
}

const ACTION_LABEL = {
  create: '创建计划',
  start: '启动执行',
  resume: '恢复执行',
  pause: '挂起',
  done: '标记完成',
  cancel: '取消计划',
};
</script>

<template>
  <div class="page" v-if="plan">
    <div class="page-head">
      <van-button size="small" round plain icon="arrow-left" @click="router.back()" />
      <div style="display: flex; gap: 8px">
        <van-button size="small" plain round @click="showForm = true">编辑</van-button>
        <van-button size="small" plain round type="danger" @click="removeIt">删除</van-button>
      </div>
    </div>

    <div class="card">
      <div class="head-row">
        <span class="chip" :style="{ '--c': catalog.catColor(plan.categoryId) }"><i class="dot"></i>{{ plan.title }}</span>
        <span class="chip kind">{{ KIND_LABEL[plan.kind] }}</span>
        <span class="chip" :style="{ '--c': '#9aa3b2' }">{{ STATUS_LABEL[plan.status] }}</span>
      </div>
      <div v-if="plan.pauseReason && plan.status === 'paused'" class="reason-line">挂起原因：{{ plan.pauseReason }}</div>
      <div v-if="plan.endReason" class="reason-line">结束原因：{{ plan.endReason }}</div>

      <div class="stat-grid" style="margin-top: 12px">
        <div class="cell"><div class="num">{{ fmtDur(totalMs) }}</div><div class="lab">总投入</div></div>
        <div class="cell"><div class="num">{{ segCount }}</div><div class="lab">执行段</div></div>
        <div class="cell"><div class="num">{{ pauseCount }}</div><div class="lab">挂起次数</div></div>
      </div>
      <div class="muted" style="margin-top: 8px" v-if="plan.estimateMs">
        预估 {{ fmtDur(plan.estimateMs) }}
        <template v-if="estimateDelta != null">
          · 实际{{ estimateDelta >= 0 ? '超出' : '快于' }}预估
          <b :style="{ color: estimateDelta > 0 ? '#f5a623' : '#34c273' }">{{ Math.abs(estimateDelta) }}%</b>
        </template>
      </div>

      <div class="plan-actions">
        <van-button
          v-if="plan.status === 'waiting' || plan.status === 'paused'"
          size="small"
          round
          type="primary"
          @click="startIt"
        >
          {{ plan.status === 'paused' ? '恢复执行' : '启动' }}
        </van-button>
        <van-button v-if="plan.status === 'active'" size="small" round plain type="warning" @click="pauseIt">挂起</van-button>
        <van-button
          v-if="plan.status !== 'done' && plan.status !== 'cancelled'"
          size="small"
          round plain
          @click="finishIt('done')"
        >
          标记完成
        </van-button>
        <van-button
          v-if="plan.status !== 'done' && plan.status !== 'cancelled'"
          size="small"
          round plain type="danger"
          @click="finishIt('cancelled')"
        >
          取消
        </van-button>
      </div>
    </div>

    <!-- 中断原因分布 -->
    <div class="card" v-if="reasonStats.length">
      <div class="section-title" style="margin-top: 0">
        <span>挂起原因分布</span>
        <span class="muted">时间分配分析</span>
      </div>
      <div class="bar-row" v-for="r in reasonStats" :key="r.reason">
        <span class="name" style="width: 110px">{{ r.reason }}</span>
        <div class="track">
          <div class="fill" :style="{ width: (r.count / reasonStats[0].count) * 100 + '%', background: '#f5a623' }"></div>
        </div>
        <span class="val">{{ r.count }} 次</span>
      </div>
      <div class="muted">挂起越频繁，说明计划被打断越多——可以反推时间块划分是否合理。</div>
    </div>

    <!-- 履历时间线 -->
    <div class="section-title"><span>执行履历</span></div>
    <div class="card">
      <template v-if="logs.length">
        <div class="log-line" v-for="l in [...logs].reverse()" :key="l.id">
          <span class="log-time">{{ new Date(l.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</span>
          <span class="log-action" :class="l.action">{{ ACTION_LABEL[l.action] || l.action }}</span>
          <span class="log-reason" v-if="l.reason">{{ l.reason }}</span>
        </div>
      </template>
      <div v-else class="empty-tip">暂无履历</div>
    </div>

    <!-- 关联事件（执行段） -->
    <div class="section-title"><span>执行段（{{ events.length }}）</span></div>
    <div class="card">
      <template v-if="events.length">
        <EventItem v-for="ev in [...events].sort((a, b) => b.startAt - a.startAt)" :key="ev.id" :event="ev" show-day @edit="() => {}" />
      </template>
      <div v-else class="empty-tip">还没有执行记录<br />启动计划后每段执行都会在这里留档</div>
    </div>

    <PlanForm v-model:show="showForm" :plan="plan" />
  </div>
  <div class="page" v-else>
    <div class="card"><div class="empty-tip">计划不存在或已删除</div></div>
  </div>
</template>

<style scoped>
.head-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.chip.kind {
  background: transparent;
  border: 1px solid var(--line);
}
.reason-line {
  font-size: 12.5px;
  color: var(--text-2);
  margin-top: 8px;
}
.plan-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.log-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
}
.log-line:last-child {
  border-bottom: 0;
}
.log-time {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  flex: none;
}
.log-action {
  font-weight: 600;
  color: var(--text-2);
  flex: none;
}
.log-action.pause {
  color: #f5a623;
}
.log-action.done {
  color: #34c273;
}
.log-action.cancel {
  color: var(--danger);
}
.log-reason {
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
