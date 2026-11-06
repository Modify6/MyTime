<script setup>
// 记录页：按月浏览、按日分组的完整历史，支持编辑与补录
import { computed, onMounted, onUnmounted, ref } from 'vue';
import dayjs from 'dayjs';
import { getEventsBetween, onChange } from '../db/repo.js';
import { monthRange, fmtDayLabel, fmtDur, shiftCursor } from '../lib/time.js';
import { totalMs, layoutDayLanes } from '../stats/aggregate.js';
import { useCatalogStore } from '../stores/catalog.js';
import EventItem from '../components/EventItem.vue';
import EventEditor from '../components/EventEditor.vue';

const catalog = useCatalogStore();
// 单日时间轴弹层
const axisDay = ref(null);
const axisLanes = computed(() => {
  if (!axisDay.value) return [];
  const dayStart = dayjs(axisDay.value).startOf('day').valueOf();
  const dayEnd = dayStart + 86_400_000;
  const evs = events.value.filter((e) => e.startAt >= dayStart && e.startAt < dayEnd);
  return layoutDayLanes(evs).map((lane) =>
    lane.map((s) => ({
      event: s.event,
      left: ((s.start - dayStart) / 86_400_000) * 100,
      width: Math.max(((s.end - s.start) / 86_400_000) * 100, 0.8),
      color: catalog.catColor(s.event.categoryId),
    }))
  );
});
const axisDayShow = computed({
  get: () => axisDay.value != null,
  set: (v) => {
    if (!v) axisDay.value = null;
  },
});
function openAxis(key) {
  axisDay.value = key;
}

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
          <span style="display: flex; align-items: center; gap: 8px">
            <van-button size="mini" plain round @click.stop="openAxis(g.key)">时间轴</van-button>
            合计 {{ fmtDur(g.total) }}
          </span>
        </div>
        <div class="card">
          <EventItem v-for="ev in g.list" :key="ev.id" :event="ev" @edit="openEdit" />
        </div>
      </div>
    </template>
    <div v-else class="card">
      <div class="empty-tip">{{ monthLabel }} 暂无记录</div>
    </div>

    <van-popup v-model:show="axisDayShow" position="bottom" round class="popup-safe">
      <div class="axis-sheet" v-if="axisDay">
        <div class="axis-title">{{ fmtDayLabel(axisDay) }} · 24 小时时间轴</div>
        <div class="axis-hours"><span v-for="h in [0, 6, 12, 18, 24]" :key="h">{{ h }}</span></div>
        <div class="axis-track">
          <div class="axis-lane" v-for="(lane, li) in axisLanes" :key="li" :style="{ height: '22px' }">
            <div
              v-for="(b, bi) in lane"
              :key="bi"
              class="axis-block"
              :style="{ left: b.left + '%', width: b.width + '%', background: b.color }"
              :title="b.event.title"
            >
              <span class="axis-block-text">{{ b.event.title }}</span>
            </div>
          </div>
          <div v-if="!axisLanes.length" class="axis-empty">该日暂有记录块为空</div>
        </div>
      </div>
    </van-popup>

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
.axis-sheet {
  padding: 18px 16px 8px;
}
.axis-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 10px;
}
.axis-hours {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-3);
  margin-bottom: 2px;
}
.axis-track {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px;
  min-height: 30px;
  background: var(--card-2);
}
.axis-lane {
  position: relative;
  margin: 2px 0;
}
.axis-block {
  position: absolute;
  top: 2px;
  height: 18px;
  border-radius: 4px;
  overflow: hidden;
  opacity: 0.92;
}
.axis-block-text {
  font-size: 9px;
  color: #fff;
  padding-left: 3px;
  line-height: 18px;
  white-space: nowrap;
}
.axis-empty {
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
  padding: 6px 0;
}
.month-label {
  font-weight: 700;
  font-size: 15px;
}
</style>
