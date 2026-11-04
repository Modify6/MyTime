<script setup>
// 目标页：把相关事件聚合成"大事"，给出累计投入与平均单次 —— 做成另一件大事的时间参照
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getAllEvents, onChange } from '../db/repo.js';
import { useCatalogStore } from '../stores/catalog.js';
import { totalMs, fmtDur } from '../stats/aggregate.js';
import GoalForm from '../components/GoalForm.vue';
import SyncDot from '../components/SyncDot.vue';

const router = useRouter();
const catalog = useCatalogStore();
const allEvents = ref([]);
const showForm = ref(false);
const editingGoal = ref(null);

let un;
async function load() {
  allEvents.value = await getAllEvents();
}
onMounted(async () => {
  un = onChange(() => { load(); catalog.load(); });
  await load();
});
onUnmounted(() => un?.());

const goalStats = computed(() =>
  catalog.activeGoals
    .map((g) => {
      const list = allEvents.value.filter((e) => e.goalId === g.id);
      const ms = totalMs(list);
      const count = list.length;
      return { goal: g, ms, count, avg: count ? Math.round(ms / count) : 0 };
    })
    .sort((a, b) => b.ms - a.ms)
);

const archived = computed(() => catalog.archivedGoals);

function openDetail(g) {
  router.push(`/goals/${g.id}`);
}
function add() {
  editingGoal.value = null;
  showForm.value = true;
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>目标</h1>
      <div style="display: flex; align-items: center; gap: 10px">
        <SyncDot />
        <van-button size="small" plain round icon="plus" @click="add">新建</van-button>
      </div>
    </div>

    <div class="intro card">
      给事件挂上一个"大事"，就能看到累计投入了多少时间 ——
      下次做类似的事，就知道它大概需要多久。
    </div>

    <template v-if="goalStats.length">
      <div v-for="s in goalStats" :key="s.goal.id" class="card goal-card" @click="openDetail(s.goal)">
        <div class="goal-head">
          <span class="chip" :style="{ '--c': s.goal.color }"><i class="dot"></i>{{ s.goal.name }}</span>
          <span v-if="s.goal.targetHours" class="muted">目标 {{ s.goal.targetHours }} 小时</span>
        </div>
        <div class="goal-nums">
          <div class="cell"><div class="num">{{ fmtDur(s.ms) }}</div><div class="lab">累计投入</div></div>
          <div class="cell"><div class="num">{{ s.count }}</div><div class="lab">次数</div></div>
          <div class="cell"><div class="num">{{ fmtDur(s.avg) }}</div><div class="lab">平均单次</div></div>
        </div>
        <div v-if="s.goal.targetHours" class="track">
          <div class="fill" :style="{ width: Math.min(100, (s.ms / (s.goal.targetHours * 3600000)) * 100) + '%', background: s.goal.color }"></div>
        </div>
      </div>
    </template>
    <div v-else class="card">
      <div class="empty-tip">还没有目标<br />点击右上角"新建"立一个大事</div>
    </div>

    <template v-if="archived.length">
      <div class="section-title">已归档</div>
      <div class="card">
        <div v-for="g in archived" :key="g.id" class="ev-item" @click="openDetail(g)">
          <div class="ev-main">
            <div class="ev-title" style="color: var(--text-2)">{{ g.name }}</div>
          </div>
        </div>
      </div>
    </template>

    <GoalForm v-model:show="showForm" :goal="editingGoal" />
  </div>
</template>

<style scoped>
.intro {
  font-size: 12.5px;
  color: var(--text-2);
  padding: 10px 14px;
}
.goal-card {
  cursor: pointer;
}
.goal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.goal-nums {
  display: flex;
  margin-top: 12px;
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
.track {
  margin-top: 12px;
  height: 8px;
  border-radius: 4px;
  background: #f0f2f8;
  overflow: hidden;
}
.track .fill {
  height: 100%;
  border-radius: 4px;
  min-width: 2px;
  transition: width 0.3s;
}
</style>
