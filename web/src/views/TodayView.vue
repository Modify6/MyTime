<script setup>
// 今日页 = 打卡闭环主场：中央打卡按钮 + 环绕快捷球（历史习惯）+ 计时中卡片 + 时间线
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import { useTimerStore } from '../stores/timer.js';
import { useCatalogStore } from '../stores/catalog.js';
import { getEventsBetween, getAllEvents, onChange } from '../db/repo.js';
import { dayRange, fmtClock, fmtDur } from '../lib/time.js';
import { byCategory, totalMs } from '../stats/aggregate.js';
import { quickActivities, recommendStart } from '../stats/recommend.js';
import EventItem from '../components/EventItem.vue';
import StartSheet from '../components/StartSheet.vue';
import EventEditor from '../components/EventEditor.vue';
import QuickLaunch from '../components/QuickLaunch.vue';
import SyncDot from '../components/SyncDot.vue';

const timer = useTimerStore();
const catalog = useCatalogStore();

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

// 环绕快捷球（习惯优先，补齐到 6 个）与面板推荐位
const quickItems = computed(() =>
  quickActivities(allEvents.value, Date.now(), 6).map((q) => ({ ...q, color: catalog.catColor(q.categoryId) }))
);
const recs = computed(() => recommendStart(allEvents.value, Date.now(), 4));

// 一键开始：环绕球 / 推荐卡共用
async function quickStart(item) {
  if (timer.running.length) {
    showToast('已有进行中的计时，请先结束');
    return;
  }
  try {
    await timer.start({ title: item.title, categoryId: item.categoryId, goalId: item.goalId });
    showToast(`已开始：${item.title}`);
    showStart.value = false;
  } catch (e) {
    showToast(e.message || '开始失败');
  }
}

async function stop() {
  const ev = await timer.stopCurrent();
  if (ev) showToast(`已记录 ${fmtDur(ev.endAt - ev.startAt)}`);
}

async function discard() {
  await showConfirmDialog({
    title: '放弃本次计时？',
    message: '这条记录将被删除，不会计入统计。',
  });
  await timer.discardCurrent();
  showToast('已放弃');
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
      <SyncDot />
    </div>

    <!-- 计时中 -->
    <div v-if="timer.runningEvent" class="card run-card">
      <div class="run-title"><span class="live-dot"></span>{{ timer.runningEvent.title }}</div>
      <div class="run-clock">{{ fmtClock(timer.elapsedMs) }}</div>
      <div class="ev-chips" style="justify-content: center">
        <span class="chip" :style="{ '--c': catalog.catColor(timer.runningEvent.categoryId) }">
          <i class="dot"></i>{{ catalog.catName(timer.runningEvent.categoryId) }}
        </span>
        <span v-if="catalog.goalName(timer.runningEvent.goalId)" class="chip"
          :style="{ '--c': catalog.goalMap[timer.runningEvent.goalId]?.color }">
          <i class="dot"></i>{{ catalog.goalName(timer.runningEvent.goalId) }}
        </span>
      </div>
      <div class="run-actions">
        <van-button round plain type="danger" @click="discard">放弃</van-button>
        <van-button round plain @click="openEdit(timer.runningEvent)">备注</van-button>
        <van-button round type="primary" @click="stop">结束打卡</van-button>
      </div>
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
      <div v-else class="empty-tip">今天还没有记录<br />点上方快捷球开始第一次打卡</div>
    </div>

    <StartSheet v-model:show="showStart" :recs="recs" @quick="quickStart" />
    <EventEditor v-model:show="showEditor" :event="editing" @saved="load" />
  </div>
</template>

<style scoped>
.run-card {
  text-align: center;
  padding: 26px 16px 18px;
  animation: fadeUp 0.35s ease both;
}
.run-title {
  font-size: 17px;
  font-weight: 700;
}
.live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #34c273;
  margin-right: 7px;
  animation: blink 1.2s infinite;
}
.run-clock {
  font-size: 44px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  margin: 10px 0 8px;
  color: var(--brand);
  letter-spacing: 1px;
  animation: glowPulse 2.8s ease-in-out infinite;
  border-radius: 16px;
}
.run-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 14px;
}
.run-actions .van-button {
  min-width: 100px;
  padding: 0 12px;
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
