<script setup>
// 记录页：按月浏览、按日分组的完整历史，支持编辑与补录
import { computed, onMounted, onUnmounted, ref } from 'vue';
import dayjs from 'dayjs';
import { getEventsBetween, onChange } from '../db/repo.js';
import { monthRange, fmtDayLabel, fmtDur, shiftCursor } from '../lib/time.js';
import { totalMs, layoutDayLanes, overlapCount, blankSegments } from '../stats/aggregate.js';
import { useCatalogStore } from '../stores/catalog.js';
import EventItem from '../components/EventItem.vue';
import EventEditor from '../components/EventEditor.vue';
import { bindBackClose } from '../lib/native.js';
import FeatureNote from '../components/FeatureNote.vue';

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

// 当日时间重叠条数：柳比歇夫法要求串行记账，重叠多为补录交叉/忘打卡，提示用户点色块修正
const axisOverlap = computed(() => (axisDay.value ? overlapCount(dayEvents(axisDay.value)) : 0));

// 当日空白段（≥1h）：补录助手——最近一段一键预填补录
const axisBlanks = computed(() => {
  if (!axisDay.value) return [];
  const { dayStart, dayEnd } = dayBounds(axisDay.value);
  return blankSegments(dayEvents(axisDay.value), { start: dayStart, end: dayEnd, minMs: 3_600_000 });
});
const hhmm = (ts) => new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
function backfillBlank(b) {
  editing.value = { startAt: b.start, endAt: b.end }; // 无 id 草稿，EventEditor 自动补主键
  showEditor.value = true;
}

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

// —— 月历视图（列表 ⇄ 月历切换）——
const viewMode = ref('list'); // list | calendar
const selectedDay = ref(null);

// 当月日历格子：周一起始的前导空位 + 每天聚合（合计时长 + 分类色 + 热力等级）
const calCells = computed(() => {
  const first = dayjs(cursor.value).startOf('month');
  const daysInMonth = first.daysInMonth();
  const lead = (first.day() + 6) % 7; // 周一为一周之首
  const byDay = new Map(
    groups.value.map((g) => [
      g.key,
      {
        total: g.total,
        colors: [...new Set(g.list.map((e) => catalog.catColor(e.categoryId)))].slice(0, 3),
      },
    ])
  );
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = first.date(d).format('YYYY-MM-DD');
    const info = byDay.get(key);
    const ms = info?.total || 0;
    cells.push({
      key,
      day: d,
      total: ms,
      colors: info?.colors || [],
      level:
        ms >= 3 * 3_600_000 ? 4 : ms >= 1.5 * 3_600_000 ? 3 : ms >= 45 * 60_000 ? 2 : ms > 0 ? 1 : 0,
      isToday: dayjs().format('YYYY-MM-DD') === key,
    });
  }
  return cells;
});
const calSelected = computed(() => {
  const key = selectedDay.value;
  if (!key) return null;
  const g = groups.value.find((x) => x.key === key);
  return g ? { key, label: fmtDayLabel(dayjs(key).valueOf()), total: g.total, list: g.list } : null;
});
function selectDay(key) {
  selectedDay.value = selectedDay.value === key ? null : key;
}

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
      <FeatureNote k="records" />
      <van-button size="small" plain round icon="plus" @click="addRecord">补录</van-button>
    </div>

    <div class="month-nav card">
      <van-button size="small" round plain icon="arrow-left" @click="prev" />
      <span class="month-label">{{ monthLabel }}</span>
      <van-button size="small" round plain :disabled="dayjs(cursor).isAfter(dayjs(), 'month')" icon="arrow" @click="next" />
    </div>

    <div class="view-toggle">
      <button :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">列表</button>
      <button :class="{ active: viewMode === 'calendar' }" @click="viewMode = 'calendar'">月历</button>
    </div>

    <!-- 月历视图：每天合计 + 分类色条 + 热力底色，点日期展开当日明细 -->
    <template v-if="viewMode === 'calendar'">
      <div class="card cal-card">
        <div class="cal-week">
          <span v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w">{{ w }}</span>
        </div>
        <div class="cal-grid">
          <template v-for="(c, i) in calCells" :key="c ? c.key : 'b' + i">
            <div v-if="!c" class="cal-blank"></div>
            <button
              v-else
              class="cal-day"
              :class="['lv' + c.level, { today: c.isToday, sel: selectedDay === c.key }]"
              @click="selectDay(c.key)"
            >
              <span class="cal-num">{{ c.day }}</span>
              <span class="cal-total" v-if="c.total">{{ fmtDur(c.total) }}</span>
              <span class="cal-bars" v-if="c.colors.length">
                <i v-for="(col, i2) in c.colors" :key="i2" :style="{ background: col }"></i>
              </span>
            </button>
          </template>
        </div>
      </div>
      <div class="card" v-if="calSelected">
        <div class="section-title" style="margin-top: 0">
          <span>{{ calSelected.label }} · {{ fmtDur(calSelected.total) }}</span>
        </div>
        <EventItem v-for="ev in calSelected.list" :key="ev.id" :event="ev" @edit="openEdit" />
      </div>
      <div class="card" v-else>
        <div class="empty-tip">点日期查看当天明细</div>
      </div>
    </template>

    <template v-if="viewMode === 'list'">
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
      <div v-if="!groups.length" class="card">
        <div class="empty-tip">{{ monthLabel }} 暂无记录</div>
      </div>
    </template>

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
        <div class="hint" v-if="axisOverlap" style="text-align: center; margin-top: 4px">
          <span class="t-up">该日有 {{ axisOverlap }} 段记录时间重叠</span> ·
          同一时刻只记一件事，点色块<b>可修正</b>
        </div>
        <div class="hint" v-if="axisBlanks.length" style="text-align: center; margin-top: 4px">
          最近空档
          <span class="t-up">{{ hhmm(axisBlanks[axisBlanks.length - 1].start) }}–{{ hhmm(axisBlanks[axisBlanks.length - 1].end) }}</span>
          （{{ fmtDur(axisBlanks[axisBlanks.length - 1].end - axisBlanks[axisBlanks.length - 1].start) }}）
          <b style="cursor: pointer" @click="backfillBlank(axisBlanks[axisBlanks.length - 1])">点此补录</b>
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
.view-toggle {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
}
.view-toggle button {
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--text-2);
  border-radius: 999px;
  padding: 4px 16px;
  font-size: 12px;
}
.view-toggle button.active {
  border-color: var(--brand);
  color: var(--brand);
  font-weight: 600;
}
.cal-card {
  padding-bottom: 10px;
}
.cal-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 4px;
}
.cal-week span {
  text-align: center;
  font-size: 10px;
  color: var(--text-3);
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.cal-blank {
  min-height: 56px;
}
.cal-day {
  min-height: 56px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card-2);
  padding: 4px 3px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  text-align: center;
}
.cal-day.lv1 {
  background: color-mix(in srgb, #4f6ef7 8%, var(--card-2));
}
.cal-day.lv2 {
  background: color-mix(in srgb, #4f6ef7 16%, var(--card-2));
}
.cal-day.lv3 {
  background: color-mix(in srgb, #4f6ef7 28%, var(--card-2));
}
.cal-day.lv4 {
  background: color-mix(in srgb, #4f6ef7 42%, var(--card-2));
}
.cal-day.today {
  border-color: var(--brand);
}
.cal-day.sel {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 35%, transparent);
}
.cal-num {
  font-size: 11px;
  color: var(--text-2);
}
.cal-total {
  font-size: 9px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.cal-bars {
  display: flex;
  gap: 2px;
}
.cal-bars i {
  width: 6px;
  height: 6px;
  border-radius: 2px;
  display: inline-block;
}
</style>
