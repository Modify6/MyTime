<script setup>
// 统计页：日/周/月汇总、分类占比、Top 事项、柳比歇夫式报告、环比上期
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { showToast } from 'vant';
import { getEventsBetween, getCategories, onChange } from '../db/repo.js';
import { rangeFor, shiftCursor, fmtDur } from '../lib/time.js';
import { byCategory, byTitle, totalMs, reportText } from '../stats/aggregate.js';
import EChart from '../components/EChart.vue';
import SyncDot from '../components/SyncDot.vue';
import { useCatalogStore } from '../stores/catalog.js';

const catalog = useCatalogStore();
const period = ref('day'); // day | week | month
const cursor = ref(Date.now());
const events = ref([]);
const prevEvents = ref([]);
const categories = ref([]);
const showReport = ref(false);

let un;
async function load() {
  const r = rangeFor(period.value, cursor.value);
  const pr = rangeFor(period.value, shiftCursor(period.value, cursor.value, -1));
  [events.value, prevEvents.value, categories.value] = await Promise.all([
    getEventsBetween(r.start, r.end),
    getEventsBetween(pr.start, pr.end),
    getCategories(),
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
</style>
