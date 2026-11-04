<script setup>
// 记录页：按月浏览、按日分组的完整历史，支持编辑与补录
import { computed, onMounted, onUnmounted, ref } from 'vue';
import dayjs from 'dayjs';
import { getEventsBetween, onChange } from '../db/repo.js';
import { monthRange, fmtDayLabel, fmtDur, shiftCursor } from '../lib/time.js';
import { totalMs } from '../stats/aggregate.js';
import EventItem from '../components/EventItem.vue';
import EventEditor from '../components/EventEditor.vue';

const cursor = ref(Date.now());
const events = ref([]);
const showEditor = ref(false);
const editing = ref(null);

let un;
async function load() {
  const { start, end } = monthRange(cursor.value);
  events.value = (await getEventsBetween(start, end)).sort((a, b) => b.startAt - a.startAt);
}
onMounted(async () => {
  un = onChange(load);
  await load();
});
onUnmounted(() => un?.());

// 按开始时间所在日期分组（保持倒序）
const groups = computed(() => {
  const map = new Map();
  for (const e of events.value) {
    const key = dayjs(e.startAt).format('YYYY-MM-DD');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return [...map.entries()].map(([key, list]) => ({
    key,
    label: fmtDayLabel(dayjs(key).valueOf()),
    total: totalMs(list),
    list,
  }));
});

const monthLabel = computed(() => dayjs(cursor.value).format('YYYY年M月'));
const prev = () => (cursor.value = shiftCursor('month', cursor.value, -1));
const next = () => (cursor.value = shiftCursor('month', cursor.value, 1));

function openEdit(ev) {
  editing.value = ev;
  showEditor.value = true;
}
function addRecord() {
  editing.value = null;
  showEditor.value = true;
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>记录</h1>
      <van-button size="small" plain round icon="plus" @click="addRecord">补录</van-button>
    </div>

    <div class="month-nav card">
      <van-button size="small" round plain icon="arrow-left" @click="prev" />
      <span class="month-label">{{ monthLabel }}</span>
      <van-button size="small" round plain :disabled="dayjs(cursor).isAfter(dayjs(), 'month')" icon="arrow" @click="next" />
    </div>

    <template v-if="groups.length">
      <div v-for="g in groups" :key="g.key">
        <div class="section-title">
          <span>{{ g.label }}</span>
          <span>合计 {{ fmtDur(g.total) }}</span>
        </div>
        <div class="card">
          <EventItem v-for="ev in g.list" :key="ev.id" :event="ev" @edit="openEdit" />
        </div>
      </div>
    </template>
    <div v-else class="card">
      <div class="empty-tip">{{ monthLabel }} 暂无记录</div>
    </div>

    <EventEditor v-model:show="showEditor" :event="editing" @saved="load" />
  </div>
</template>

<style scoped>
.month-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
}
.month-label {
  font-weight: 700;
  font-size: 15px;
}
</style>
