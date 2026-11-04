<script setup>
// 统计页：日/周/月汇总、分类占比、Top 事项、柳比歇夫式报告、环比上期
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { showToast } from 'vant';
import { getEventsBetween, getCategories, onChange } from '../db/repo.js';
import { rangeFor, shiftCursor, fmtDur } from '../lib/time.js';
import {
  byCategory,
  byTitle,
  totalMs,
  reportText,
  estimateCompare,
  estimateByCategory,
  heatmapData,
} from '../stats/aggregate.js';
import { getAllEvents } from '../db/repo.js';
import dayjs from 'dayjs';
import EChart from '../components/EChart.vue';
import SyncDot from '../components/SyncDot.vue';
import { useCatalogStore } from '../stores/catalog.js';

const catalog = useCatalogStore();
const period = ref('day'); // day | week | month
const cursor = ref(Date.now());
const events = ref([]);
const prevEvents = ref([]);
const categories = ref([]);
const heatEvents = ref([]);
const showReport = ref(false);

let un;
async function load() {
  const r = rangeFor(period.value, cursor.value);
  const pr = rangeFor(period.value, shiftCursor(period.value, cursor.value, -1));
  [events.value, prevEvents.value, categories.value, heatEvents.value] = await Promise.all([
    getEventsBetween(r.start, r.end),
    getEventsBetween(pr.start, pr.end),
    getCategories(),
    getAllEvents(),
  ]);
}
onMounted(async () => {
  un = onChange(load);
  await load();
});
onUnmounted(() => un?.());
watch([period, cursor], load);

const range = computed(() => rangeFor(period.value, cursor.value));

// 时段标签
function dayLabelOf(startMs) {
  const d = new Date(startMs);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
const weekLabel = computed(() => {
  const r = range.value;
  const a = new Date(r.start), b = new Date(r.end - 1);
  return `${a.getMonth() + 1}月${a.getDate()}日 – ${b.getMonth() + 1}月${b.getDate()}日`;
});
const monthLabel = computed(() => {
  const d = new Date(range.value.start);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
});
const headLabel = computed(() =>
  period.value === 'day' ? dayLabelOf(range.value.start) : period.value === 'week' ? weekLabel.value : monthLabel.value
);

const total = computed(() => totalMs(events.value));
const delta = computed(() => {
  const prevTotal = totalMs(prevEvents.value);
  if (!prevTotal) return null;
  return Math.round(((total.value - prevTotal) / prevTotal) * 100);
});

const catTotals = computed(() => byCategory(events.value));
const topItems = computed(() => byTitle(events.value, 8));

// 计划 vs 实际（仅有预估的事件）
const planActual = computed(() => estimateCompare(events.value));
const planByCat = computed(() => estimateByCategory(events.value));
const planMax = computed(() =>
  Math.max(1, ...planByCat.value.flatMap((r) => [r.estMs, r.actMs]))
);

// 专注热力图（近半年，独立于当前时段）
const heat = computed(() => heatmapData(heatEvents.value, { weeks: 24, end: Date.now() }));

function jumpToDay(key) {
  period.value = 'day';
  cursor.value = dayjs(key).startOf('day').valueOf();
}

const pieOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    valueFormatter: (v) => fmtDur(v * 60000),
  },
  series: [
    {
      type: 'pie',
      radius: ['48%', '72%'],
      center: ['50%', '50%'],
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
      label: { show: true, formatter: '{b}', fontSize: 11, color: '#6b7280' },
      data: catTotals.value.map((t) => ({
        name: categories.value.find((c) => c.id === t.categoryId)?.name || '未分类',
        value: Math.round(t.ms / 60000),
        itemStyle: { color: categories.value.find((c) => c.id === t.categoryId)?.color || '#90A4AE' },
      })),
    },
  ],
}));

const report = computed(() =>
  reportText({ rangeStart: range.value.start, events: events.value, categories: categories.value })
);

async function copyReport() {
  try {
    await navigator.clipboard.writeText(report.value);
    showToast('已复制');
  } catch {
    showToast('复制失败，请长按文本手动复制');
  }
}

const prev = () => (cursor.value = shiftCursor(period.value, cursor.value, -1));
const next = () => (cursor.value = shiftCursor(period.value, cursor.value, 1));
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>统计</h1>
      <SyncDot />
    </div>

    <div class="stats-nav">
      <van-button size="small" round plain icon="arrow-left" @click="prev" />
      <div class="nav-mid">
        <div class="seg">
          <button :class="{ active: period === 'day' }" @click="period = 'day'">日</button>
          <button :class="{ active: period === 'week' }" @click="period = 'week'">周</button>
          <button :class="{ active: period === 'month' }" @click="period = 'month'">月</button>
        </div>
      </div>
      <van-button size="small" round plain icon="arrow" @click="next" />
    </div>
    <div class="muted" style="text-align: center; margin: 6px 0 12px">{{ headLabel }}</div>

    <div class="card">
      <div class="stat-grid">
        <div class="cell">
          <div class="num">{{ fmtDur(total) }}</div>
          <div class="lab">合计纯时间</div>
        </div>
        <div class="cell">
          <div class="num">{{ events.length }}</div>
          <div class="lab">记录条数</div>
        </div>
        <div class="cell">
          <div class="num" :style="{ color: delta == null ? 'inherit' : delta > 0 ? '#f5a623' : '#34c273' }">
            {{ delta == null ? '—' : (delta > 0 ? '+' : '') + delta + '%' }}
          </div>
          <div class="lab">较上期</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-title" style="margin-top: 0">
        <span>专注热力图</span>
        <span class="muted">近半年 · {{ heat.activeDays }} 天有记录 · 共 {{ fmtDur(heat.total) }}</span>
      </div>
      <div class="heat">
        <div class="heat-labels">
          <span v-for="(l, i) in ['一', '', '三', '', '五', '', '']" :key="i">{{ l }}</span>
        </div>
        <div class="heat-grid">
          <button
            v-for="c in heat.cells"
            :key="c.key"
            class="heat-cell"
            :class="'lv' + c.level"
            :title="c.ms != null ? c.key + ' · ' + fmtDur(c.ms) : ''"
            @click="c.level >= 0 && jumpToDay(c.key)"
          ></button>
        </div>
      </div>
      <div class="muted" style="margin-top: 6px">颜色越深投入越多 · 点格子在下方查看那一天的明细</div>
    </div>

    <div v-if="planActual" class="card">
      <div class="section-title" style="margin-top: 0">
        <span>计划 vs 实际</span>
        <span class="muted">{{ planActual.count }} 条有预估</span>
      </div>
      <div class="pa-summary">
        预估 {{ fmtDur(planActual.estMs) }} · 实际 {{ fmtDur(planActual.actMs) }}
        <b :style="{ color: planActual.pct > 0 ? '#f5a623' : '#34c273' }">
          （{{ planActual.pct > 0 ? '+' : '' }}{{ planActual.pct }}%）
        </b>
      </div>
      <div class="muted" style="margin: 2px 0 8px">偏差为实际相对预估：正 = 超出预估，负 = 快于预估</div>
      <div class="pa-row" v-for="r in planByCat" :key="r.categoryId">
        <span class="name">{{ catalog.catName(r.categoryId) }}</span>
        <div class="pa-bars">
          <div class="track">
            <div class="fill est" :style="{ width: (r.estMs / planMax) * 100 + '%' }"></div>
          </div>
          <div class="track">
            <div class="fill act" :style="{ width: (r.actMs / planMax) * 100 + '%', '--c': catalog.catColor(r.categoryId) }"></div>
          </div>
        </div>
        <span class="val">{{ fmtDur(r.actMs) }}</span>
      </div>
      <div class="pa-legend">
        <span><i class="swatch" style="background: #c3c9d4"></i>预估</span>
        <span><i class="swatch" style="background: var(--brand)"></i>实际</span>
      </div>
    </div>

    <div v-if="catTotals.length" class="card">
      <div class="section-title" style="margin-top: 0">分类占比</div>
      <EChart :option="pieOption" height="240px" />
    </div>

    <div v-if="topItems.length" class="card">
      <div class="section-title" style="margin-top: 0">Top 事项</div>
      <div class="bar-row" v-for="(t, i) in topItems" :key="i">
        <span class="name">{{ t.title }}</span>
        <div class="track">
          <div class="fill" :style="{ width: (t.ms / topItems[0].ms) * 100 + '%' }"></div>
        </div>
        <span class="val">{{ fmtDur(t.ms) }} · {{ t.count }}次</span>
      </div>
    </div>

    <div class="card">
      <div class="section-title" style="margin-top: 0">
        <span>柳比歇夫报告</span>
        <van-button size="small" plain round icon="records" @click="copyReport">复制</van-button>
      </div>
      <pre class="report-pre">{{ report }}</pre>
    </div>
  </div>
</template>

<style scoped>
.stats-nav {
  display: flex;
  align-items: center;
  gap: 10px;
}
.nav-mid {
  flex: 1;
}
.pa-summary {
  font-size: 14px;
  margin-bottom: 4px;
}
.pa-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}
.pa-row .name {
  width: 64px;
  flex: none;
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
.pa-bars {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pa-bars .track {
  height: 7px;
  border-radius: 4px;
  background: #f0f2f8;
  overflow: hidden;
}
.pa-bars .fill {
  height: 100%;
  border-radius: 4px;
  min-width: 2px;
}
.pa-bars .fill.est {
  background: #c3c9d4;
}
.pa-bars .fill.act {
  background: var(--c, var(--brand));
}
.pa-row .val {
  width: 70px;
  flex: none;
  font-size: 11px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.pa-legend {
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: var(--text-3);
  margin-top: 4px;
}
.pa-legend .swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 4px;
}
.heat {
  display: flex;
  gap: 4px;
  overflow-x: auto;
}
.heat-labels {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 2px;
  font-size: 9px;
  line-height: 12px;
  color: var(--text-3);
  flex: none;
  width: 12px;
}
.heat-grid {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  grid-auto-flow: column;
  grid-auto-columns: 12px;
  gap: 2px;
}
.heat-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 0;
  padding: 0;
  cursor: pointer;
  background: #eef0f5;
}
.heat-cell.lv1 {
  background: #cdd8fb;
}
.heat-cell.lv2 {
  background: #9db4f8;
}
.heat-cell.lv3 {
  background: #6d8ef9;
}
.heat-cell.lv4 {
  background: #4f6ef7;
}
.heat-cell.lv-1 {
  background: transparent;
  cursor: default;
}
</style>
