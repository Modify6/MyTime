<script setup>
// 今日页 = 打卡闭环主场：中央打卡按钮 + 环绕快捷球（历史习惯）+ 计时中卡片 + 时间线
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import { useTimerStore } from '../stores/timer.js';
import { useCatalogStore } from '../stores/catalog.js';
import { usePlanStore } from '../stores/plan.js';
import PauseReasonDialog from '../components/PauseReasonDialog.vue';
import HandoffDialog from '../components/HandoffDialog.vue';
import { getEventsBetween, getAllEvents, onChange } from '../db/repo.js';
import { dayRange, fmtClock, fmtDur } from '../lib/time.js';
import { byCategory, totalMs } from '../stats/aggregate.js';
import { quickActivities, recommendStart } from '../stats/recommend.js';
import EventItem from '../components/EventItem.vue';
import StartSheet from '../components/StartSheet.vue';
import EventEditor from '../components/EventEditor.vue';
import QuickLaunch from '../components/QuickLaunch.vue';
import SyncDot from '../components/SyncDot.vue';
import FeatureNote from '../components/FeatureNote.vue';

const timer = useTimerStore();
const catalog = useCatalogStore();
const planStore = usePlanStore();

const todayEvents = ref([]);
const allEvents = ref([]);
const showStart = ref(false);
const showEditor = ref(false);
const editing = ref(null);

let un;
async function load() {
  const { start, end } = dayRange(Date.now());
  const [today, all] = await Promise.all([getEventsBetween(start, end), getAllEvents()]);
  todayEvents.value = today.sort((a, b) => b.startAt - a.startAt);
  allEvents.value = all;
}
onMounted(async () => {
  un = onChange(load);
  await load();
});
onUnmounted(() => un?.());

const catTotals = computed(() => byCategory(todayEvents.value));
const dayTotal = computed(() => totalMs(todayEvents.value));

// 计时中圆环：分类色弧 = 今日该分类已投入占今日总投入比例（含最小可见弧，首段不给空环）
const RING_CIRC = 2 * Math.PI * 86;
const runArcPct = computed(() => {
  const cid = timer.runningEvent?.categoryId;
  if (!cid || !dayTotal.value) return 0;
  const ms = catTotals.value.find((t) => t.categoryId === cid)?.ms || 0;
  return Math.min(100, Math.round((ms / dayTotal.value) * 100));
});
const runArcOffset = computed(() => RING_CIRC * (1 - Math.max(runArcPct.value, 3) / 100));
const runArcLabel = computed(() => (runArcPct.value > 0 ? `今日该分类 ${runArcPct.value}%` : '今天的第一段'));

// 环绕快捷球（习惯优先，补齐到 6 个）与面板推荐位
const quickItems = computed(() =>
  quickActivities(allEvents.value, Date.now(), 6).map((q) => ({ ...q, color: catalog.catColor(q.categoryId) }))
);
const recs = computed(() => recommendStart(allEvents.value, Date.now(), 4));

// 一键开始：环绕球 / 推荐卡共用（柳比歇夫串行原则：有运行中计时先调度处置）
const pendingQuick = ref(null);
const showHandoff = ref(false);
async function quickStart(item) {
  await timer.refresh();
  if (timer.running.length) {
    pendingQuick.value = item;
    showHandoff.value = true;
    return;
  }
  await doQuickStart(item);
}
async function doQuickStart(item) {
  try {
    await timer.start({ title: item.title, categoryId: item.categoryId, goalId: item.goalId });
    showToast(`已开始：${item.title}`);
    showStart.value = false;
  } catch (e) {
    showToast(e.message || '开始失败');
  }
}
async function onHandoffConfirm(handoff) {
  const item = pendingQuick.value;
  pendingQuick.value = null;
  try {
    await planStore.settleRunning(handoff);
    if (item) await doQuickStart(item);
  } catch (e) {
    showToast(e.message || '调度失败');
  }
}

async function stop() {
  const ev = await timer.stopCurrent();
  if (ev) {
    let msg = `已记录 ${fmtDur(ev.endAt - ev.startAt)}`;
    // 带预估时立即反馈计划偏差（柳比歇夫闭环的即时一环）
    if (ev.estimateMs > 0) {
      const pct = Math.round(((ev.endAt - ev.startAt - ev.estimateMs) / ev.estimateMs) * 100);
      msg += ` · 预估 ${fmtDur(ev.estimateMs)}（${pct >= 0 ? '+' : ''}${pct}%）`;
    }
    showToast(msg);
  }
}

async function discard() {
  await showConfirmDialog({
    title: '放弃本次计时？',
    message: '这条记录将被删除，不会计入统计。',
  });
  await timer.discardCurrent();
  showToast('已放弃');
}

// 计划挂起（今日页快捷入口，原因可选填）
const showPauseReason = ref(false);
const pauseReason = ref('');
const pauseCustom = ref('');
function confirmPause() {
  const reason = pauseCustom.value.trim() || pauseReason.value.trim() || null;
  planStore.pauseActive(reason).then(() => {
    showToast('已挂起，可在计划页恢复');
    showPauseReason.value = false;
    pauseReason.value = '';
    pauseCustom.value = '';
  });
}

function openEdit(ev) {
  editing.value = ev;
  showEditor.value = true;
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>今日</h1>
      <FeatureNote k="today" />
      <SyncDot />
    </div>

    <!-- 计时中：圆环仪式感（分类色弧 = 今日该分类已投入占比） -->
    <div v-if="timer.runningEvent" class="card run-card">
      <div class="run-head"><span class="live-dot"></span>{{ timer.runningEvent.title }}</div>
      <div class="run-ring">
        <svg viewBox="0 0 200 200">
          <circle class="run-track" cx="100" cy="100" r="86" />
          <circle
            class="run-arc"
            cx="100" cy="100" r="86"
            :style="{ '--rc': catalog.catColor(timer.runningEvent.categoryId) }"
            :stroke-dasharray="RING_CIRC"
            :stroke-dashoffset="runArcOffset"
          />
        </svg>
        <div class="run-center">
          <div class="run-clock">{{ fmtClock(timer.elapsedMs) }}</div>
          <div class="run-sub">{{ runArcLabel }}</div>
        </div>
      </div>
      <div class="ev-chips" style="justify-content: center">
        <span class="chip" :style="{ '--c': catalog.catColor(timer.runningEvent.categoryId) }">
          <i class="dot"></i>{{ catalog.catName(timer.runningEvent.categoryId) }}
        </span>
        <span v-if="planStore.byId(timer.runningEvent.planId)" class="chip"
          :style="{ '--c': '#f5a623' }">
          <i class="dot"></i>计划 · {{ planStore.byId(timer.runningEvent.planId)?.kind === 'planned' ? '提前规划' : '临时' }}
        </span>
        <span v-if="catalog.goalName(timer.runningEvent.goalId)" class="chip"
          :style="{ '--c': catalog.goalMap[timer.runningEvent.goalId]?.color }">
          <i class="dot"></i>{{ catalog.goalName(timer.runningEvent.goalId) }}
        </span>
      </div>
      <div class="run-ghosts">
        <span @click="discard">⊘ 放弃</span>
        <span v-if="timer.runningEvent.planId" @click="showPauseReason = true">⏸ 挂起</span>
        <span @click="openEdit(timer.runningEvent)">✎ 备注</span>
      </div>
      <button class="run-stop" @click="stop">■ 结束打卡</button>
      <div class="muted" style="text-align: center; margin-top: 10px">
        从 {{ new Date(timer.runningEvent.startAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }} 开始
      </div>
    </div>

    <!-- 空闲：中央打卡按钮 + 环绕快捷球 -->
    <template v-else>
      <QuickLaunch :items="quickItems" @quick="quickStart">
        <button class="hero-btn hero-center" @click="showStart = true">
          打卡<small>开始记录纯时间</small>
        </button>
      </QuickLaunch>
      <div v-if="todayEvents.length" class="muted" style="text-align: center">
        今日已专注 {{ fmtDur(dayTotal) }}
      </div>
      <div v-else class="muted" style="text-align: center">
        点周围的快捷球一键开始，或点打卡自己选
      </div>
    </template>

    <!-- 其他设备开始的计时（罕见冲突，列出可处理） -->
    <div v-if="timer.extraRunning.length" class="card">
      <div class="section-title" style="margin-top: 0">其他进行中的计时</div>
      <div v-for="ev in timer.extraRunning" :key="ev.id" class="ev-item" @click="openEdit(ev)">
        <div class="ev-main">
          <div class="ev-title">{{ ev.title }}</div>
          <div class="muted">点击处理（结束或删除）</div>
        </div>
      </div>
    </div>

    <!-- 今日小计 -->
    <div v-if="catTotals.length" class="card">
      <div class="section-title" style="margin-top: 0">今日分类小计</div>
      <div class="bar-row" v-for="t in catTotals" :key="t.categoryId">
        <span class="name">{{ catalog.catName(t.categoryId) }}</span>
        <div class="track">
          <div class="fill" :style="{ width: (dayTotal ? (t.ms / dayTotal) * 100 : 0) + '%', '--c': catalog.catColor(t.categoryId) }"></div>
        </div>
        <span class="val">{{ fmtDur(t.ms) }}</span>
      </div>
    </div>

    <!-- 今日时间线 -->
    <div class="section-title">
      <span>今日时间线</span>
      <van-button size="small" plain round icon="plus" @click="editing = null; showEditor = true">补录</van-button>
    </div>
    <div class="card">
      <template v-if="todayEvents.length">
        <EventItem v-for="ev in todayEvents" :key="ev.id" :event="ev" @edit="openEdit" />
      </template>
      <div v-else class="empty-tip">今天还没有记录<br />点上方<b>快捷球</b>开始第一次打卡</div>
    </div>

    <PauseReasonDialog v-model:show="showPauseReason" @confirm="({ reason }) => confirmPause(reason)" />
    <HandoffDialog
      v-model:show="showHandoff"
      :new-label="pendingQuick ? `开始打卡：${pendingQuick.title}` : ''"
      @confirm="onHandoffConfirm"
    />
    <StartSheet v-model:show="showStart" :recs="recs" @quick="quickStart" />
    <EventEditor v-model:show="showEditor" :event="editing" @saved="load" />
  </div>
</template>

<style scoped>
.run-card {
  text-align: center;
  padding: 22px 16px 16px;
  animation: fadeUp 0.35s ease both;
}
.run-head {
  font-size: 17px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #34c273;
  animation: blink 1.2s infinite;
}
.run-ring {
  position: relative;
  width: 200px;
  margin: 14px auto 10px;
}
.run-ring svg {
  display: block;
  width: 100%;
  transform: rotate(-90deg);
}
.run-track,
.run-arc {
  fill: none;
  stroke-width: 10;
  stroke-linecap: round;
}
.run-track {
  stroke: var(--track);
}
.run-arc {
  stroke: var(--rc, #90a4ae);
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--rc, #90a4ae) 45%, transparent));
  transition: stroke-dashoffset 0.6s ease;
}
.run-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.run-clock {
  font-size: 34px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  letter-spacing: 1px;
}
.run-sub {
  font-size: 11px;
  color: var(--text-3);
}
.run-ghosts {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}
.run-ghosts span {
  flex: 1;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-2);
  background: var(--seg-bg);
  border-radius: 999px;
  padding: 8px 0;
  cursor: pointer;
}
.run-ghosts span:active {
  color: var(--brand);
}
.run-stop {
  width: 100%;
  height: 46px;
  border: 0;
  border-radius: 23px;
  background: var(--brand);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.run-stop:active {
  opacity: 0.85;
}

/* 居中的主打卡按钮：呼吸光晕 + 旋转虚线环 */
.hero-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  z-index: 2;
  animation: glowPulse 2.8s ease-in-out infinite;
}
.hero-center::before {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  border: 2px dashed rgba(255, 255, 255, 0.4);
  animation: spinSlow 26s linear infinite;
  pointer-events: none;
}
.hero-center:active {
  transform: translate(-50%, -50%) scale(0.95);
  animation: none;
}
</style>
