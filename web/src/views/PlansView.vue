<script setup>
// 计划页：预排与临时计划统一管理，分区展示（执行中/挂起/等待/已完成）
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import { useRouter } from 'vue-router';
import { usePlanStore, PLAN_STATUS } from '../stores/plan.js';
import { useTimerStore } from '../stores/timer.js';
import { useCatalogStore } from '../stores/catalog.js';
import { getPlanEvents } from '../db/repo.js';
import { fmtDur } from '../lib/time.js';
import PlanForm from '../components/PlanForm.vue';
import HandoffDialog from '../components/HandoffDialog.vue';
import PauseReasonDialog from '../components/PauseReasonDialog.vue';
import PlanCloseDialog from '../components/PlanCloseDialog.vue';
import FeatureNote from '../components/FeatureNote.vue';
import TemplateManager from '../components/TemplateManager.vue';

const router = useRouter();
const planStore = usePlanStore();
const timer = useTimerStore();
const catalog = useCatalogStore();

const planTab = ref('plans'); // plans | templates
const delActions = computed(() => [
  { name: '仅删除此条（时间数据保留）', whole: false },
  { name: `删除整组（${delSheet.value.groupSize} 个，时间数据保留）`, whole: true, color: '#e5484d' },
]);
const showForm = ref(false);
const editingPlan = ref(null);
const handoffPlan = ref(null);
const showHandoff = ref(false);
let un;

onMounted(async () => {
  un = planStore.watch();
  await Promise.all([planStore.load(), catalog.load()]);
});
onUnmounted(() => un?.());

const KIND_LABEL = { planned: '提前规划', temp: '临时' };
const STATUS_LABEL = {
  [PLAN_STATUS.ACTIVE]: '执行中',
  [PLAN_STATUS.PAUSED]: '挂起中',
  [PLAN_STATUS.WAITING]: '等待执行',
  [PLAN_STATUS.DONE]: '已完成',
  [PLAN_STATUS.CANCELLED]: '已取消',
};

const activeList = computed(() => planStore.plans.filter((p) => p.status === 'active'));
const pausedList = computed(() => planStore.pausedPlans);
const waitingPlanned = computed(() => planStore.waitingPlans.filter((p) => p.kind === 'planned'));
const waitingTemp = computed(() => planStore.waitingPlans.filter((p) => p.kind === 'temp'));

function kindLabel(p) {
  return KIND_LABEL[p.kind] || '计划';
}
function statusLabel(p) {
  return STATUS_LABEL[p.status] || p.status;
}
function statusColor(p) {
  return { active: '#34c273', paused: '#f5a623', waiting: '#9aa3b2', done: '#4f6ef7', cancelled: '#9aa3b2' }[p.status];
}

function openForm() {
  editingPlan.value = null;
  showForm.value = true;
}
function editPlan(p) {
  editingPlan.value = p;
  showForm.value = true;
}

// 启动：有冲突时弹调度窗
async function startPlan(p) {
  console.log("[startPlan] called:", p.id, p.title, p.status);
  try {
    await planStore.start(p.id);
    console.log('[startPlan] store.start 完成');
    showToast(`已启动「${p.title}」`);
  } catch (e) {
    console.log("[startPlan] ERROR:", e.message);
    if (String(e.message).includes('请选择挂起或结束')) {
      handoffPlan.value = p;
      showHandoff.value = true;
    } else {
      showToast(e.message || '启动失败');
    }
  }
}
async function onHandoffConfirm(handoff) {
  try {
    await planStore.start(handoffPlan.value.id, handoff);
    showToast(`已启动「${handoffPlan.value.title}」`);
  } catch (e) {
    showToast(e.message || '启动失败');
  }
}
async function resumePlan(p) {
  await startPlan(p);
}
async function pauseActiveWithReason(reason) {
  await planStore.pauseActive(reason);
  showToast('已挂起');
}
const showPauseDialog = ref(false);
const closeStatus = ref('done');
const closeTarget = ref(null);
const showCloseDialog = ref(false);
function openPauseDialog() {
  showPauseDialog.value = true;
}
async function onPauseConfirm({ reason }) {
  await pauseActiveWithReason(reason);
}
async function onCloseConfirm({ status, reason }) {
  await finishPlan(closeTarget.value, status, reason);
}
function openCloseDialog(p, status) {
  closeTarget.value = p;
  closeStatus.value = status;
  showCloseDialog.value = true;
}
async function finishPlan(p, status, reason) {
  try {
    await planStore.closeById(p.id, status, reason);
    showToast(status === 'done' ? '已完成' : '已取消');
  } catch (e) {
    showToast(e.message || '操作失败');
  }
}
const delSheet = ref({ show: false, plan: null, groupSize: 1 });
async function removePlan(p) {
  const groupSize = p.instanceId
    ? planStore.plans.filter((x) => x.instanceId === p.instanceId && !x.deleted).length
    : 1;
  if (groupSize > 1) {
    delSheet.value = { show: true, plan: p, groupSize };
    return;
  }
  await confirmRemove(p, false);
}
async function confirmRemove(p, wholeGroup) {
  try {
    await showConfirmDialog({
      title: wholeGroup ? '删除整组计划？' : '删除该计划？',
      message: wholeGroup
        ? `将删除整组 ${delSheet.value.groupSize} 个计划，已记录的时间数据会保留。`
        : '仅删除这条计划记录，已记录的时间数据会保留。',
    });
  } catch {
    return;
  }
  if (wholeGroup) await planStore.removeGroup(delSheet.value.plan.instanceId);
  else await planStore.remove(p.id);
  showToast('已删除（时间数据保留）');
}
function onDelSelect(action) {
  const plan = delSheet.value.plan;
  if (!plan) return;
  confirmRemove(plan, action.whole === true);
}

function openDetail(p) {
  router.push(`/plans/${p.id}`);
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>计划</h1>
      <FeatureNote k="plan" />
      <van-button v-if="planTab === 'plans'" size="small" plain round icon="plus" @click="openForm">新建</van-button>
    </div>

    <div class="plan-tabs">
      <button :class="{ active: planTab === 'plans' }" @click="planTab = 'plans'">计划</button>
      <button :class="{ active: planTab === 'templates' }" @click="planTab = 'templates'">模板</button>
    </div>

    <!-- 模板管理 -->
    <TemplateManager v-if="planTab === 'templates'" @instantiated="planTab = 'plans'" />

    <!-- 执行中 -->
    <template v-if="planTab === 'plans' && activeList.length">
      <div class="section-title">执行中</div>
      <div class="card plan-card" v-for="p in activeList" :key="p.id">
        <div class="plan-head" @click="openDetail(p)">
          <span class="chip" :style="{ '--c': catalog.catColor(p.categoryId) }"><i class="dot"></i>{{ p.title }}</span>
          <span class="chip kind">{{ kindLabel(p) }}</span>
        </div>
        <div class="plan-meta muted">
          预计 {{ p.estimateMs ? fmtDur(p.estimateMs) : '—' }} · 已计入 {{ fmtDur(timer.elapsedMs) }}
        </div>
        <div class="plan-actions">
          <van-button size="small" round plain type="warning" @click.stop="openPauseDialog">挂起</van-button>
          <van-button size="small" round plain type="primary" @click.stop="openDetail(p)">详情</van-button>
        </div>
      </div>
    </template>

    <!-- 挂起中 -->
    <template v-if="pausedList.length">
      <div class="section-title">挂起中（等待后续执行）</div>
      <div class="card plan-card" v-for="p in pausedList" :key="p.id">
        <div class="plan-head" @click="openDetail(p)">
          <span class="chip" :style="{ '--c': catalog.catColor(p.categoryId) }"><i class="dot"></i>{{ p.title }}</span>
          <span class="chip kind">{{ kindLabel(p) }}</span>
        </div>
        <div class="plan-meta muted" v-if="p.pauseReason">挂起原因：{{ p.pauseReason }}</div>
        <div class="plan-actions">
          <van-button size="small" round type="primary" @click.stop="resumePlan(p)">恢复执行</van-button>
          <van-button size="small" round plain @click.stop="openCloseDialog(p, 'done')">标记完成</van-button>
          <van-button size="small" round plain type="danger" @click.stop="openCloseDialog(p, 'cancelled')">取消</van-button>
        </div>
      </div>
    </template>

    <!-- 等待执行：预排 -->
    <template v-if="planTab === 'plans'">
      <div class="section-title">
        <span>提前规划</span>
        <span class="muted">编排好，随时启动</span>
      </div>
      <div class="card">
        <template v-if="waitingPlanned.length">
        <div class="plan-row" v-for="p in waitingPlanned" :key="p.id">
          <div class="plan-main" @click="openDetail(p)">
            <div class="plan-title">{{ p.title }}</div>
            <div class="plan-meta muted">
              预计 {{ p.estimateMs ? fmtDur(p.estimateMs) : '—' }}
              <template v-if="p.plannedDate"> · 预定 {{ p.plannedDate }}</template>
            </div>
          </div>
          <div class="plan-actions">
            <van-button size="small" round type="primary" @click.stop="startPlan(p)">启动</van-button>
            <van-button size="small" round plain @click.stop="editPlan(p)">编辑</van-button>
            <van-button size="small" round plain type="danger" @click.stop="removePlan(p)">删除</van-button>
          </div>
        </div>
      </template>
      <div v-else class="empty-tip">暂无预排计划<br />点「新建」提前编排要做的事</div>
      </div>
    </template>

    <!-- 等待执行：临时 -->
    <template v-if="planTab === 'plans'">
      <div class="section-title">
        <span>临时计划（等待执行）</span>
      </div>
      <div class="card">
        <template v-if="waitingTemp.length">
        <div class="plan-row" v-for="p in waitingTemp" :key="p.id">
          <div class="plan-main" @click="openDetail(p)">
            <div class="plan-title">{{ p.title }} <span class="chip kind">临时</span></div>
            <div class="plan-meta muted">预计 {{ p.estimateMs ? fmtDur(p.estimateMs) : '—' }}</div>
          </div>
          <div class="plan-actions">
            <van-button size="small" round type="primary" @click.stop="startPlan(p)">启动</van-button>
            <van-button size="small" round plain @click.stop="editPlan(p)">编辑</van-button>
            <van-button size="small" round plain type="danger" @click.stop="removePlan(p)">删除</van-button>
          </div>
        </div>
      </template>
      <div v-else class="empty-tip">暂无等待中的临时计划</div>
      </div>
    </template>

    <!-- 已完成 / 已取消 -->
    <template v-if="planTab === 'plans'">
      <div class="section-title">已完成 / 已取消</div>
      <div class="card">
        <template v-if="planStore.finishedPlans.length">
        <div class="plan-row" v-for="p in planStore.finishedPlans" :key="p.id">
          <div class="plan-main" @click="openDetail(p)">
            <div class="plan-title" style="color: var(--text-2)">{{ p.title }}</div>
            <div class="plan-meta muted">
              {{ statusLabel(p) }}<template v-if="p.endReason"> · {{ p.endReason }}</template>
            </div>
          </div>
          <van-button size="small" round plain type="danger" @click.stop="removePlan(p)">删除</van-button>
        </div>
      </template>
      <div v-else class="empty-tip">暂无归档</div>
      </div>
    </template>

    <van-action-sheet
      :show="delSheet.show"
      :actions="delActions"
      cancel-text="取消"
      close-on-click-action
      @select="onDelSelect"
      @update:show="delSheet.show = false"
    />
    <PlanForm v-model:show="showForm" :plan="editingPlan" />
    <HandoffDialog v-model:show="showHandoff" :new-plan="handoffPlan" @confirm="onHandoffConfirm" />
    <PauseReasonDialog v-model:show="showPauseDialog" @confirm="onPauseConfirm" />
    <PlanCloseDialog v-model:show="showCloseDialog" :status="closeStatus" @confirm="onCloseConfirm" />
  </div>
</template>

<style scoped>
.plan-tabs {
  display: flex;
  background: var(--card-2);
  border-radius: 999px;
  padding: 3px;
  margin-bottom: 12px;
}
.plan-tabs button {
  flex: 1;
  border: 0;
  background: transparent;
  border-radius: 999px;
  padding: 7px 0;
  font-size: 13px;
  color: var(--text-2);
}
.plan-tabs button.active {
  background: var(--card);
  color: var(--text);
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.plan-card {
  cursor: default;
}
.plan-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.chip.kind {
  background: transparent;
  border: 1px solid var(--line);
}
.plan-meta {
  margin-top: 6px;
  font-size: 12px;
}
.plan-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.plan-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.plan-row:last-child {
  border-bottom: 0;
}
.plan-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.plan-title {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
