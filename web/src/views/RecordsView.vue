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

// —— 单日时间轴弹层：竖向时间标尺（参照 Atimelogger / 日历类 App）——
// 自适应时间范围与行高；条带宽度按"自身存续期间的最大并发泳道数"等分——
// 不重叠的条带恢复全宽，重叠/相接的条带并排（日历类标准行为）
const axisDay = ref(null);

function dayBounds(key) {
  const dayStart = dayjs(key).startOf('day').valueOf();
  return { dayStart, dayEnd: dayStart + 86_400_000 };
}
// 当日相关事件：含"昨晚开始今晨结束"的跨天事件（截断到当日），含正在计时的进行中事件
function dayEvents(key) {
  const { dayStart, dayEnd } = dayBounds(key);
  return events.value.filter((e) => e.startAt < dayEnd && (e.endAt ?? Date.now()) > dayStart);
}

// 自适应时间范围：事件最早/最晚时刻取整到整小时再各外扩 1 小时；无事件回落 00-24
const axisRange = computed(() => {
  if (!axisDay.value) return { start: 0, end: 24 };
  const { dayStart, dayEnd } = dayBounds(axisDay.value);
  const evs = dayEvents(axisDay.value);
  if (!evs.length) return { start: 0, end: 24 };
  let min = 24, max = 0;
  for (const e of evs) {
    min = Math.min(min, Math.max(0, (e.startAt - dayStart) / 3_600_000));
    max = Math.max(max, Math.min(24, ((e.endAt ?? Date.now()) - dayStart) / 3_600_000));
  }
  const start = Math.max(0, Math.floor(min) - 1);
  const end = Math.min(24, Math.max(Math.ceil(max) + 1, start + 1));
  return { start, end };
});
const axisHours = computed(() => {
  const { start, end } = axisRange.value;
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
});
const pxPerHour = computed(() => {
  const { start, end } = axisRange.value;
  return Math.min(72, Math.max(28, 560 / (end - start)));
});
const trackHeight = computed(() => (axisRange.value.end - axisRange.value.start) * pxPerHour.value);

const axisIsToday = computed(() => axisDay.value && dayjs(axisDay.value).isSame(dayjs(), 'day'));
const axisNowTop = computed(() => {
  if (!axisIsToday.value || !axisDay.value) return null;
  const { dayStart } = dayBounds(axisDay.value);
  const top = ((Date.now() - dayStart) / 3_600_000 - axisRange.value.start) * pxPerHour.value;
  return Math.max(0, Math.min(trackHeight.value, top));
});

// 事件条带：宽度 = 100 / 与自己时间相交的条带所涉及的最大并发泳道数；
// 高度按真实时长比例（下限 6px——秒级碎片渲染为细条），高度 ≥18px 才显示文字
const axisLanes = computed(() => {
  if (!axisDay.value) return [];
  const { dayStart, dayEnd } = dayBounds(axisDay.value);
  const { start: rStart } = axisRange.value;
  const pph = pxPerHour.value;

  // 展平为条带（含泳道号与当日截断区间）
  const bands = [];
  layoutDayLanes(dayEvents(axisDay.value)).forEach((lane, li) =>
    lane.forEach((s) => {
      const st = Math.max(s.start, dayStart);
      const en = Math.min(s.end ?? Date.now(), dayEnd);
      bands.push({ event: s.event, li, st, en, color: catalog.catColor(s.event.categoryId) });
    })
  );

  return bands.map((b) => {
    // 与 b 时间相交（半开区间）的条带 → 涉及的泳道数 c → 等分宽度，b 按泳道号排位偏移
    const crossing = bands.filter((o) => o.st < b.en && o.en > b.st);
    const lanesInvolved = [...new Set(crossing.map((o) => o.li))].sort((a, z) => a - z);
    const c = Math.max(1, lanesInvolved.length);
    const pos = lanesInvolved.indexOf(b.li);
    const top = ((b.st - dayStart) / 3_600_000 - rStart) * pph;
    const height = Math.max(((b.en - b.st) / 3_600_000) * pph, 6);
    return {
      event: b.event,
      top,
      height,
      left: pos * (100 / c),
      width: 100 / c,
      color: b.color,
      label: `${b.event.title} · ${fmtDur(b.en - b.st)}`,
      showText: height >= 18,
    };
  });
});
const axisStats = computed(() => {
  if (!axisDay.value) return null;
  const { dayStart, dayEnd } = dayBounds(axisDay.value);
  let recorded = 0;
  for (const e of dayEvents(axisDay.value))
    recorded += Math.min(e.endAt ?? Date.now(), dayEnd) - Math.max(e.startAt, dayStart);
  return { recorded: Math.max(0, recorded), idle: Math.max(0, 86_400_000 - Math.max(0, recorded)) };
});

const axisDayShow = computed({
  get: () => axisDay.value != null,
  set: (v) => {
    if (!v) axisDay.value = null;
  },
});
bindBackClose(axisDayShow, () => (axisDay.value = null));
function openAxis(key) {
  axisDay.value = key;
}
function shiftDay(d) {
  axisDay.value = dayjs(axisDay.value).add(d, 'day').format('YYYY-MM-DD');
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
        <div class="axis-head">
          <van-button size="small" round plain icon="arrow-left" @click="shiftDay(-1)" />
          <span class="axis-title">{{ fmtDayLabel(axisDay) }}</span>
          <van-button size="small" round plain icon="arrow" @click="shiftDay(1)" />
        </div>
        <div class="axis-sub" v-if="axisStats">
          记录 {{ fmtDur(axisStats.recorded) }} · 空白 {{ fmtDur(axisStats.idle) }}
        </div>

        <div class="axis-body">
          <div class="axis-gutter">
            <span
              v-for="h in axisHours"
              :key="h"
              class="axis-hour"
              :style="{ top: (h - axisRange.start) * pxPerHour - 6 + 'px' }"
            >{{ String(h).padStart(2, '0') }}:00</span>
          </div>
          <div class="axis-track" :style="{ height: trackHeight + 'px' }">
            <div
              v-for="h in axisHours"
              :key="'l' + h"
              class="axis-hourline"
              :style="{ top: (h - axisRange.start) * pxPerHour + 'px' }"
            />
            <div v-if="axisIsToday && axisNowTop != null" class="axis-now" :style="{ top: axisNowTop + 'px' }" />
            <div
              v-for="(b, bi) in axisLanes"
              :key="bi"
              class="axis-block"
              :style="{ top: b.top + 'px', left: b.left + '%', width: b.width + '%', height: b.height + 'px', background: b.color }"
              @click="openEdit(b.event)"
            >
              <span v-if="b.showText" class="axis-block-text">{{ b.label }}</span>
            </div>
            <div v-if="!axisLanes.length" class="axis-empty">该日暂无记录</div>
          </div>
        </div>
        <div class="axis-hint">‹ › 切换日期 · 点色块可编辑该条记录</div>
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
  padding: 16px 14px 10px;
}
.axis-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.axis-title {
  font-size: 15px;
  font-weight: 700;
  min-width: 130px;
  text-align: center;
}
.axis-sub {
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  margin: 6px 0 10px;
}
.axis-body {
  display: flex;
  gap: 6px;
  max-height: 56vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.axis-gutter {
  position: relative;
  width: 40px;
  flex: none;
}
.axis-hour {
  position: absolute;
  right: 0;
  font-size: 10px;
  color: var(--text-3);
  line-height: 12px;
  transform: translateY(-50%);
}
.axis-track {
  position: relative;
  flex: 1;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card-2);
  overflow: hidden;
}
.axis-hourline {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--line);
  opacity: 0.45;
}
.axis-now {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--danger);
  z-index: 2;
}
.axis-block {
  position: absolute;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  z-index: 1;
}
.axis-block:active {
  filter: brightness(1.15);
}
.axis-block-text {
  display: block;
  font-size: 11px;
  color: #fff;
  padding: 0 5px;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.axis-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-3);
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
