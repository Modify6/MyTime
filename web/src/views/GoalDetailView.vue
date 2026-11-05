<script setup>
// 目标详情：累计/次数/平均单次/进度，以及关联的全部事件
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { getAllEvents, onChange, putRow } from '../db/repo.js';
import { useCatalogStore } from '../stores/catalog.js';
import { totalMs, fmtDur, dailySeries } from '../stats/aggregate.js';
import EventItem from '../components/EventItem.vue';
import EChart from '../components/EChart.vue';
import EventEditor from '../components/EventEditor.vue';
import GoalForm from '../components/GoalForm.vue';

const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();

const allEvents = ref([]);
const showEditor = ref(false);
const editing = ref(null);
const showForm = ref(false);

let un;
async function load() {
  allEvents.value = (await getAllEvents()).sort((a, b) => b.startAt - a.startAt);
}
onMounted(async () => {
  un = onChange(() => { load(); catalog.load(); });
  await Promise.all([load(), catalog.loaded ? Promise.resolve() : catalog.load()]);
});
onUnmounted(() => un?.());

const goal = computed(() => catalog.goalMap[route.params.id]);
const events = computed(() => allEvents.value.filter((e) => e.goalId === route.params.id));
const ms = computed(() => totalMs(events.value));
const count = computed(() => events.value.length);
const avg = computed(() => (count.value ? Math.round(ms.value / count.value) : 0));
const progress = computed(() =>
  goal.value?.targetHours ? Math.min(100, (ms.value / (goal.value.targetHours * 3600000)) * 100) : null
);

// 近 30 天逐日投入趋势
const trend = computed(() => dailySeries(allEvents.value.filter((e) => e.goalId === route.params.id), { days: 30 }));
const trendOption = computed(() => ({
  grid: { left: 6, right: 6, top: 14, bottom: 4, containLabel: true },
  xAxis: {
    type: 'category',
    data: trend.value.map((p) => p.date.slice(5)),
    axisLabel: { fontSize: 9, color: '#9aa3b2', interval: 6 },
    axisLine: { lineStyle: { color: 'rgba(150,150,150,0.3)' } },
  },
  yAxis: {
    type: 'value',
    axisLabel: { fontSize: 9, color: '#9aa3b2', formatter: (m) => (m >= 60 ? Math.round(m / 60) + 'h' : m + 'm') },
    splitLine: { lineStyle: { color: 'rgba(150,150,150,0.15)' } },
  },
  tooltip: { trigger: 'axis', valueFormatter: (v) => fmtDur(v * 60000) },
  series: [
    {
      type: 'line',
      smooth: true,
      symbol: 'none',
      data: trend.value.map((p) => Math.round(p.ms / 60000)),
      itemStyle: { color: goal.value?.color || '#4f6ef7' },
      lineStyle: { width: 2 },
      areaStyle: { opacity: 0.15 },
    },
  ],
}));

function openEdit(ev) {
  editing.value = ev;
  showEditor.value = true;
}
async function toggleArchive() {
  await catalog.saveGoal({ ...goal.value, archived: goal.value.archived ? 0 : 1 });
  showToast(goal.value.archived ? '已取消归档' : '已归档');
}
async function removeGoal() {
  await showConfirmDialog({
    title: '删除目标？',
    message: '事件记录会保留，只是不再关联这个目标。',
  });
  const gid = goal.value.id;
  for (const ev of events.value) {
    if (ev.goalId === gid) await putRow('events', { ...ev, goalId: null });
  }
  await catalog.removeGoal(gid);
  showToast('已删除');
  router.replace('/goals');
}
</script>

<template>
  <div class="page" v-if="goal">
    <div class="page-head">
      <van-button size="small" round plain icon="arrow-left" @click="router.back()" />
      <div style="display: flex; gap: 8px">
        <van-button size="small" plain round @click="showForm = true">编辑</van-button>
        <van-button size="small" plain round @click="toggleArchive">{{ goal.archived ? '取消归档' : '归档' }}</van-button>
        <van-button size="small" plain round type="danger" @click="removeGoal">删除</van-button>
      </div>
    </div>

    <div class="card">
      <span class="chip" :style="{ '--c': goal.color, fontSize: '13px' }"><i class="dot"></i>{{ goal.name }}</span>
      <div v-if="goal.description" class="muted" style="margin-top: 8px">{{ goal.description }}</div>
      <div class="goal-nums">
        <div class="cell"><div class="num">{{ fmtDur(ms) }}</div><div class="lab">累计投入</div></div>
        <div class="cell"><div class="num">{{ count }}</div><div class="lab">次数</div></div>
        <div class="cell"><div class="num">{{ fmtDur(avg) }}</div><div class="lab">平均单次</div></div>
      </div>
      <div v-if="progress != null" class="progress-wrap">
        <div class="track">
          <div class="fill" :style="{ width: progress + '%', background: goal.color }"></div>
        </div>
        <div class="muted" style="margin-top: 4px">
          已完成 {{ progress.toFixed(0) }}% · 目标 {{ goal.targetHours }} 小时
        </div>
      </div>
    </div>

        <div class="card">
      <div class="section-title" style="margin-top: 0">近 30 天投入</div>
      <EChart :option="trendOption" height="150px" />
    </div>

    <div class="section-title"><span>关联事件</span></div>
    <div class="card">
      <template v-if="events.length">
        <EventItem v-for="ev in events" :key="ev.id" :event="ev" show-day @edit="openEdit" />
      </template>
      <div v-else class="empty-tip">还没有关联事件<br />打卡开始时选择这个目标即可关联</div>
    </div>

    <EventEditor v-model:show="showEditor" :event="editing" @saved="load" />
    <GoalForm v-model:show="showForm" :goal="goal" />
  </div>
  <div class="page" v-else>
    <div class="card"><div class="empty-tip">目标不存在或已删除</div></div>
  </div>
</template>

<style scoped>
.goal-nums {
  display: flex;
  margin-top: 14px;
}
.goal-nums .cell {
  flex: 1;
  text-align: center;
}
.goal-nums .num {
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.goal-nums .lab {
  font-size: 11px;
  color: var(--text-3);
}
.progress-wrap {
  margin-top: 12px;
}
.track {
  height: 8px;
  border-radius: 4px;
  background: var(--track);
  overflow: hidden;
}
.track .fill {
  height: 100%;
  border-radius: 4px;
  min-width: 2px;
}
</style>
