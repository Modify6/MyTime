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
import { bindBackClose } from '../lib/native.js';

const catalog = useCatalogStore();

// —— 单日 24 小时时间轴弹层 ——
// 手机竖屏放不下 24h，改为横向滚动（每小时 32px）；跨天事件截断到当日；点色块直接编辑
const AXIS_HOUR_PX = 32;
const AXIS_WIDTH = 24 * AXIS_HOUR_PX; // 768px
const hourTicks = Array.from({ length: 13 }, (_, i) => i * 2); // 0,2,4...24

const axisDay = ref(null);
const axisNowPct = ref(null); // 今天时"现在"指示线位置（打开弹层那一刻快照）

function dayBounds(key) {
  const dayStart = dayjs(key).startOf('day').valueOf();
  return { dayStart, dayEnd: dayStart + 86_400_000 };
}
// 当日相关事件：含"昨晚开始今晨结束"的跨天事件（截断到当日），含正在计时的进行中事件
function dayEvents(key) {
  const { dayStart, dayEnd } = dayBounds(key);
  return events.value.filter((e) => e.startAt < dayEnd && (e.endAt ?? Date.now()) > dayStart);
}

const axisLanes = computed(() => {
  if (!axisDay.value) return [];
  const { dayStart, dayEnd } = dayBounds(axisDay.value);
  const evs = dayEvents(axisDay.value);
  return layoutDayLanes(evs).map((lane) =>
    lane.map((s) => {
      const st = Math.max(s.start, dayStart);
      const en = Math.min(s.end ?? Date.now(), dayEnd);
      const widthPct = ((en - st) / 86_400_000) * 100;
      return {
        event: s.event,
        left: ((st - dayStart) / 86_400_000) * 100,
        width: Math.max(widthPct, 0.4),
        widthPx: (widthPct / 100) * AXIS_WIDTH,
        color: catalog.catColor(s.event.categoryId),
      };
    })
  );
});
const axisStats = computed(() => {
  if (!axisDay.value) return null;
  const { dayStart, dayEnd } = dayBounds(axisDay.value);
  let recorded = 0;
  for (const e of dayEvents(axisDay.value))
    recorded += Math.min(e.endAt ?? Date.now(), dayEnd) - Math.max(e.startAt, dayStart);
  return { recorded: Math.max(0, recorded), idle: Math.max(0, 86_400_000 - Math.max(0, recorded)) };
});
const axisIsToday = computed(() => axisDay.value && dayjs(axisDay.value).isSame(dayjs(), 'day'));
const axisDayShow = computed({
  get: () => axisDay.value != null,
  set: (v) => {
    if (!v) axisDay.value = null;
  },
});
bindBackClose(axisDayShow, () => (axisDay.value = null));
function openAxis(key) {
  axisDay.value = key;
  axisNowPct.value = axisIsToday.value
    ? ((Date.now() - dayBounds(key).dayStart) / 86_400_000) * 100
    : null;
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
        <div class="axis-title">
          <span>{{ fmtDayLabel(axisDay) }} · 24 小时时间轴</span>
          <span class="axis-sum" v-if="axisStats">
            记录 {{ fmtDur(axisStats.recorded) }} · 空白 {{ fmtDur(axisStats.idle) }}
          </span>
        </div>

        <div class="axis-scroll">
          <div class="axis-inner" :style="{ width: AXIS_WIDTH + 'px' }">
            <div class="axis-hours">
              <span
                v-for="h in hourTicks"
                :key="h"
                :style="{ left: (h / 24) * 100 + '%', transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)' }"
              >{{ h }}</span>
            </div>
            <div class="axis-track">
              <div class="axis-gridline" v-for="h in hourTicks" :key="'g' + h" :style="{ left: (h / 24) * 100 + '%' }" />
              <div v-if="axisIsToday && axisNowPct != null" class="axis-now" :style="{ left: axisNowPct + '%' }" />
              <div class="axis-lane" v-for="(lane, li) in axisLanes" :key="li">
                <div
                  v-for="(b, bi) in lane"
                  :key="bi"
                  class="axis-block"
                  :style="{ left: b.left + '%', width: b.width + '%', background: b.color }"
                  @click="openEdit(b.event)"
                >
                  <span v-if="b.widthPx >= 30" class="axis-block-text">{{ b.event.title }}</span>
                </div>
              </div>
              <div v-if="!axisLanes.length" class="axis-empty">该日暂无记录块</div>
            </div>
          </div>
        </div>
        <div class="axis-hint">← 横向滑动查看全天 · 点色块可编辑该条记录 →</div>
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
  padding: 18px 16px 10px;
}
.axis-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.axis-title > span:first-child {
  white-space: nowrap;
}
.axis-sum {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-3);
}
.axis-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}
.axis-inner {
  position: relative;
}
.axis-hours {
  position: relative;
  height: 16px;
}
.axis-hours span {
  position: absolute;
  font-size: 10px;
  color: var(--text-3);
  line-height: 16px;
}
.axis-track {
  position: relative;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px 0;
  background: var(--card-2);
  overflow: hidden;
}
.axis-gridline {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line);
  opacity: 0.45;
}
.axis-now {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--danger);
  z-index: 2;
}
.axis-lane {
  position: relative;
  height: 24px;
  margin: 2px 0;
}
.axis-block {
  position: absolute;
  top: 1px;
  height: 22px;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
}
.axis-block:active {
  filter: brightness(1.15);
}
.axis-block-text {
  display: block;
  font-size: 10px;
  color: #fff;
  padding-left: 4px;
  line-height: 22px;
  white-space: nowrap;
}
.axis-empty {
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
  padding: 8px 0;
}
.axis-hint {
  font-size: 11px;
  color: var(--text-3);
  text-align: center;
  margin-top: 8px;
}
.month-label {
  font-weight: 700;
  font-size: 15px;
}
</style>
