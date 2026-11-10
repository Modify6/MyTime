<script setup>
// 统计页：日/周/月/复盘 四分段；v0.14.0 视觉升级——色带/七柱/趋势/环形中心/堆叠对比
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { showToast } from 'vant';
import { getEventsBetween, getCategories, getAllPlanLogs, getPlans, getAllEvents, onChange } from '../db/repo.js';
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
import { buildReview, categoryFlow, pauseReasonTrend } from '../stats/review.js';
import { goalProgress, budgetProgress, GOAL_KIND_LABEL } from '../stats/goals.js';
import dayjs from 'dayjs';
import EChart from '../components/EChart.vue';
import SyncDot from '../components/SyncDot.vue';
import FeatureNote from '../components/FeatureNote.vue';
import { useCatalogStore } from '../stores/catalog.js';

const catalog = useCatalogStore();
const period = ref('day'); // day | week | month | review
const reviewGranularity = ref('week'); // 复盘粒度：周 | 月
// 深色模式跟随系统（饼图描边/标签颜色随之切换）
const isDark = ref(window.matchMedia?.('(prefers-color-scheme: dark)').matches || false);
window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', (e) => (isDark.value = e.matches));
const cursor = ref(Date.now());
const events = ref([]);
const prevEvents = ref([]);
const categories = ref([]);
const heatEvents = ref([]);
const plans = ref([]);
const planLogs = ref([]);

// 复盘模式下数据范围跟随复盘粒度（周/月）
const effPeriod = computed(() => (period.value === 'review' ? reviewGranularity.value : period.value));

let un;
async function load() {
  const r = rangeFor(effPeriod.value, cursor.value);
  const pr = rangeFor(effPeriod.value, shiftCursor(effPeriod.value, cursor.value, -1));
  [events.value, prevEvents.value, categories.value, heatEvents.value, plans.value, planLogs.value] = await Promise.all([
    getEventsBetween(r.start, r.end),
    getEventsBetween(pr.start, pr.end),
    getCategories(),
    getAllEvents(),
    getPlans(),
    getAllPlanLogs(),
  ]);
}
onMounted(async () => {
  un = onChange(load);
  await load();
});
onUnmounted(() => un?.());
watch([period, cursor, reviewGranularity], load);

const range = computed(() => rangeFor(effPeriod.value, cursor.value));
const prevRange = computed(() => rangeFor(effPeriod.value, shiftCursor(effPeriod.value, cursor.value, -1)));

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
  effPeriod.value === 'day' ? dayLabelOf(range.value.start) : effPeriod.value === 'week' ? weekLabel.value : monthLabel.value
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

// —— 复盘聚合（period === 'review'）——
const review = computed(() => {
  const args = {
    events: events.value,
    prevEvents: prevEvents.value,
    plans: plans.value,
    planLogs: planLogs.value,
    start: range.value.start,
    end: range.value.end,
    prevStart: prevRange.value.start,
    prevEnd: prevRange.value.end,
  };
  return {
    planRows: buildReview(args),
    catFlow: categoryFlow(args),
    pauseTrend: pauseReasonTrend(args),
  };
});
const flowMax = computed(() => Math.max(1, ...review.value.catFlow.map((f) => Math.max(f.nowMs, f.prevMs))));
const pauseMax = computed(() => Math.max(1, ...review.value.pauseTrend.rows.map((r) => r.n)));
const planRowMax = computed(() =>
  Math.max(1, ...review.value.planRows.flatMap((r) => [r.est || 0, r.actMs]))
);
const STATUS_LABEL = { waiting: '等待中', active: '进行中', paused: '已挂起', done: '已完成', cancelled: '已取消' };
function statusLabel(s) {
  return STATUS_LABEL[s] || s;
}

// —— 视觉升级（v0.14.0）：色带 / 七柱 / 趋势 / 堆叠对比 ——

// 目标进度（五模式统一卡片）：日模式显示本周+本月，周/月/复盘跟随所在周期
// 数据源用全量事件（heatEvents），保证日模式下也能算出整周/整月口径
const weekRange = computed(() => rangeFor('week', cursor.value));
const monthRange = computed(() => rangeFor('month', cursor.value));
const goalCards = computed(() => {
  const evs = heatEvents.value;
  const goals = catalog.goals;
  const weekly = goalProgress(goals, evs, { kind: 'weekly', start: weekRange.value.start, end: weekRange.value.end });
  const monthly = goalProgress(goals, evs, { kind: 'monthly', start: monthRange.value.start, end: monthRange.value.end });
  const withLabel = (rows, label) => rows.map((r) => ({ ...r, label }));
  if (period.value === 'week') return withLabel(weekly, GOAL_KIND_LABEL.weekly);
  if (period.value === 'month') return withLabel(monthly, GOAL_KIND_LABEL.monthly);
  if (period.value === 'review') {
    return reviewGranularity.value === 'week' ? withLabel(weekly, GOAL_KIND_LABEL.weekly) : withLabel(monthly, GOAL_KIND_LABEL.monthly);
  }
  return [...withLabel(weekly, GOAL_KIND_LABEL.weekly), ...withLabel(monthly, GOAL_KIND_LABEL.monthly)];
});

// 分类每周预算（上限）：日/周模式显示，超出琥珀警示
const budgetCards = computed(() => {
  if (period.value !== 'day' && period.value !== 'week') return [];
  return budgetProgress(catalog.categories, heatEvents.value, {
    start: weekRange.value.start,
    end: weekRange.value.end,
  });
});


// ① 单日分类色带：全天时间按分类着色铺满（泳道防重叠，细条堆叠；进行中事件画到当前时刻）
const dayBand = computed(() => {
  if (period.value !== 'day') return [];
  const dayStart = range.value.start;
  const dayEnd = range.value.end;
  const now = Date.now();
  const segs = events.value
    .filter((e) => !e.deleted && e.startAt < dayEnd && (e.endAt ?? now) > dayStart)
    .map((e) => ({ event: e, start: Math.max(e.startAt, dayStart), end: Math.min(e.endAt ?? now, dayEnd) }))
    .sort((a, b) => a.start - b.start);
  const lanes = [];
  for (const s of segs) {
    let lane = lanes.find((l) => s.start > l.end);
    if (!lane) {
      lane = { end: 0, items: [] };
      lanes.push(lane);
    }
    lane.items.push(s);
    lane.end = Math.max(lane.end, s.end);
  }
  return lanes.map((l) =>
    l.items.map((s) => ({
      id: s.event.id,
      title: s.event.title,
      left: ((s.start - dayStart) / 86_400_000) * 100,
      width: Math.max(((s.end - s.start) / 86_400_000) * 100, 0.6),
      color: catalog.catColor(s.event.categoryId),
    }))
  );
});

// ② 周视图七柱：7 天 × 分类堆叠柱（今天列高亮）
const weekBarsOption = computed(() => {
  if (period.value !== 'week') return null;
  const days = Array.from({ length: 7 }, (_, i) => dayjs(range.value.start).add(i, 'day'));
  const catIds = [...new Set(events.value.map((e) => e.categoryId).filter(Boolean))];
  const todayIdx = days.findIndex((d) => d.isSame(dayjs(), 'day'));
  const series = catIds.map((cid, si) => ({
    name: catalog.catName(cid),
    type: 'bar',
    stack: 'total',
    barWidth: 20,
    itemStyle: { color: catalog.catColor(cid), borderRadius: si === catIds.length - 1 ? [4, 4, 0, 0] : 0 },
    data: days.map((d) => {
      let ms = 0;
      for (const e of events.value) {
        if (e.deleted || e.categoryId !== cid) continue;
        if (dayjs(e.startAt).isSame(d, 'day')) ms += Math.max(0, (e.endAt ?? Date.now()) - e.startAt);
      }
      return Math.round(ms / 60000);
    }),
    ...(si === 0 && todayIdx >= 0
      ? { markArea: { silent: true, itemStyle: { color: 'rgba(79,110,247,0.08)' }, data: [[{ xAxis: days[todayIdx].format('M/D') }, { xAxis: days[todayIdx].format('M/D') }]] } }
      : {}),
  }));
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => fmtDur(v * 60000) },
    grid: { left: 6, right: 6, top: 18, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      data: days.map((d) => d.format('M/D')),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#8884' } },
      axisLabel: { fontSize: 10, color: '#98a2b3' },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#8882' } },
      axisLabel: { fontSize: 10, color: '#98a2b3', formatter: (v) => (v >= 60 ? Math.round(v / 6) / 10 + 'h' : v + 'm') },
    },
    series,
  };
});

// ③ 近 30 天趋势：每日投入迷你面积图
const trendOption = computed(() => {
  const days = Array.from({ length: 30 }, (_, i) => dayjs().subtract(29 - i, 'day'));
  const data = days.map((d) => {
    let ms = 0;
    for (const e of heatEvents.value) {
      if (e.deleted) continue;
      if (dayjs(e.startAt).isSame(d, 'day')) ms += Math.max(0, (e.endAt ?? Date.now()) - e.startAt);
    }
    return Math.round(ms / 60000);
  });
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => fmtDur(v * 60000) },
    grid: { left: 6, right: 6, top: 14, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      data: days.map((d) => d.format('M/D')),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#8884' } },
      axisLabel: { fontSize: 9, color: '#98a2b3', interval: 9 },
    },
    yAxis: { type: 'value', splitLine: { show: false }, axisLabel: { show: false } },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        data,
        lineStyle: { color: '#4f6ef7', width: 2 },
        areaStyle: { color: 'rgba(79,110,247,0.15)' },
      },
    ],
  };
});

// ⑥ 复盘时间流向：两条全宽堆叠色条（本期 vs 上期，按分类着色）
const flowStack = computed(() => {
  const rows = review.value.catFlow.filter((f) => f.nowMs > 0 || f.prevMs > 0);
  const seg = (key) => {
    const tot = rows.reduce((s, f) => s + f[key], 0) || 1;
    return rows.map((f) => ({ color: catalog.catColor(f.categoryId), name: catalog.catName(f.categoryId), pct: (f[key] / tot) * 100 }));
  };
  return {
    now: seg('nowMs'),
    prev: seg('prevMs'),
    nowTotal: rows.reduce((s, f) => s + f.nowMs, 0),
    prevTotal: rows.reduce((s, f) => s + f.prevMs, 0),
  };
});

const pieOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    valueFormatter: (v) => fmtDur(v * 60000),
  },
  title: {
    text: fmtDur(total.value),
    subtext: '总投入',
    left: 'center',
    top: '40%',
    textStyle: { fontSize: 17, fontWeight: 700, color: isDark.value ? '#e6e9f0' : '#1f2430' },
    subtextStyle: { fontSize: 10, color: '#98a2b3' },
  },
  legend: { show: false },
  series: [
    {
      type: 'pie',
      radius: ['48%', '72%'],
      center: ['50%', '50%'],
      itemStyle: { borderColor: isDark.value ? '#171c26' : '#ffffff', borderWidth: 2, borderRadius: 4 },
      label: { show: false },
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

const prev = () => (cursor.value = shiftCursor(effPeriod.value, cursor.value, -1));
const next = () => (cursor.value = shiftCursor(effPeriod.value, cursor.value, 1));
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>统计</h1>
      <FeatureNote k="stats" />
      <SyncDot />
    </div>

    <div class="stats-nav">
      <van-button size="small" round plain icon="arrow-left" @click="prev" />
      <div class="nav-mid">
        <div class="seg">
          <button :class="{ active: period === 'day' }" @click="period = 'day'">日</button>
          <button :class="{ active: period === 'week' }" @click="period = 'week'">周</button>
          <button :class="{ active: period === 'month' }" @click="period = 'month'">月</button>
          <button :class="{ active: period === 'review' }" @click="period = 'review'">复盘</button>
        </div>
      </div>
      <van-button size="small" round plain icon="arrow" @click="next" />
    </div>
    <div class="muted" style="text-align: center; margin: 6px 0 12px">{{ headLabel }}</div>
    <div class="rv-gran" v-if="period === 'review'">
      <button :class="{ active: reviewGranularity === 'week' }" @click="reviewGranularity = 'week'">按周</button>
      <button :class="{ active: reviewGranularity === 'month' }" @click="reviewGranularity = 'month'">按月</button>
    </div>

    <div class="card">
      <div class="stat-grid">
        <div class="cell">
          <van-icon class="cell-icon" name="clock-o" />
          <div class="num">{{ fmtDur(total) }}</div>
          <div class="lab">合计纯时间</div>
        </div>
        <div class="cell">
          <van-icon class="cell-icon" name="orders-o" />
          <div class="num">{{ events.length }}</div>
          <div class="lab">记录条数</div>
        </div>
        <div class="cell">
          <van-icon class="cell-icon" name="upgrade" />
          <div class="num" :style="{ color: delta == null ? 'inherit' : delta > 0 ? '#f5a623' : '#34c273' }">
            {{ delta == null ? '—' : (delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '') + delta + '%' }}
          </div>
          <div class="lab">较上期</div>
        </div>
      </div>
    </div>

    <!-- 目标进度与预算：每周/每月目标（下限）+ 分类每周预算（上限） -->
    <div class="card" v-if="goalCards.length || budgetCards.length">
      <div class="section-title" style="margin-top: 0">目标与预算</div>
      <div class="gp-row" v-for="r in goalCards" :key="r.goal.id">
        <div class="gp-head">
          <span class="gp-name">
            <span class="gp-kind">{{ r.label }}</span>
            <i class="gp-dot" :style="{ background: r.goal.color }"></i>{{ r.goal.name }}
          </span>
          <span class="gp-val" :class="{ done: r.done }">
            {{ fmtDur(r.ms) }} / {{ r.goal.targetHours }}h
          </span>
        </div>
        <div class="gp-track">
          <div class="gp-fill" :class="{ done: r.done, behind: r.behind }" :style="{ width: Math.min(100, r.pct) + '%' }"></div>
        </div>
        <div class="gp-sub">
          <span :class="{ done: r.done }">{{ r.pct }}%</span>
          <span v-if="r.done" class="gp-done">已达成</span>
          <template v-else-if="r.elapsedPct != null">
            <span class="muted">时间已过 {{ r.elapsedPct }}%</span>
            <span v-if="r.behind" class="gp-behind">节奏落后 · 还差 {{ fmtDur(r.remainMs) }}</span>
            <span v-else class="muted">还差 {{ fmtDur(r.remainMs) }}</span>
          </template>
          <span v-else class="muted">还差 {{ fmtDur(r.remainMs) }}</span>
        </div>
      </div>
      <div class="gp-row" v-for="b in budgetCards" :key="b.categoryId">
        <div class="gp-head">
          <span class="gp-name">
            <span class="gp-kind gp-kind-budget">预算</span>
            <i class="gp-dot" :style="{ background: b.color }"></i>{{ b.name }}
          </span>
          <span class="gp-val" :class="{ 'gp-over': b.over }">
            {{ fmtDur(b.ms) }} / {{ b.budgetMs / 3_600_000 }}h
          </span>
        </div>
        <div class="gp-track">
          <div class="gp-fill" :class="{ over: b.over, near: b.near }" :style="{ width: Math.min(100, b.pct) + '%' }"></div>
        </div>
        <div class="gp-sub">
          <span :class="{ 'gp-over': b.over, 'gp-near': b.near }">{{ b.pct }}%</span>
          <span v-if="b.over" class="gp-over">已超出 {{ fmtDur(b.overMs) }} · 本周</span>
          <span v-else-if="b.near" class="gp-behind">接近预算 · 剩 {{ fmtDur(b.budgetMs - b.ms) }}</span>
          <span v-else class="muted">本周剩 {{ fmtDur(b.budgetMs - b.ms) }}</span>
        </div>
      </div>
    </div>

    <!-- 单日分类色带：全天时间按分类着色 -->
    <div class="card" v-if="period === 'day' && dayBand.length">
      <div class="section-title" style="margin-top: 0">
        <span>时间分布</span>
        <span class="muted">0 — 24 时</span>
      </div>
      <div class="band">
        <div class="band-lane" v-for="(lane, li) in dayBand" :key="li">
          <div
            v-for="b in lane"
            :key="b.id"
            class="band-seg"
            :style="{ left: b.left + '%', width: b.width + '%', background: b.color }"
            :title="b.title"
          ></div>
        </div>
      </div>
      <div class="band-ticks"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
    </div>

    <!-- 周视图七柱：7 天分类堆叠，今天高亮 -->
    <div class="card" v-if="period === 'week' && weekBarsOption">
      <div class="section-title" style="margin-top: 0">
        <span>每日投入</span>
        <span class="muted">按分类堆叠 · 高亮列 = 今天</span>
      </div>
      <EChart :option="weekBarsOption" height="200px" />
    </div>

    <!-- 近 30 天趋势 -->
    <div class="card" v-if="period !== 'review'">
      <div class="section-title" style="margin-top: 0">
        <span>近 30 天趋势</span>
        <span class="muted">每日投入</span>
      </div>
      <EChart :option="trendOption" height="120px" />
    </div>

    <!-- 复盘模式：计划 vs 实际 + 时间流向堆叠 + 挂起原因 -->
    <template v-if="period === 'review'">
      <div class="card">
        <div class="section-title" style="margin-top: 0">
          <span>计划 vs 实际</span>
          <span class="muted">{{ review.planRows.length }} 个计划有投入</span>
        </div>
        <div v-if="review.planRows.length">
          <div class="rv-plan" v-for="r in review.planRows" :key="r.planId">
            <div class="rv-plan-head">
              <b class="rv-plan-title">{{ r.title }}</b>
              <span class="rv-status" :class="'st-' + r.status">{{ statusLabel(r.status) }}</span>
            </div>
            <div class="pa-bars" v-if="r.est">
              <div class="track">
                <div class="fill est" :style="{ width: (r.est / planRowMax) * 100 + '%' }"></div>
              </div>
              <div class="track">
                <div class="fill act" :style="{ width: (r.actMs / planRowMax) * 100 + '%' }"></div>
              </div>
            </div>
            <div class="rv-plan-val">
              <template v-if="r.notStarted">未启动 · 预估 {{ fmtDur(r.est) }}</template>
              <template v-else>
                实际 {{ fmtDur(r.actMs) }}
                <template v-if="r.pct != null">
                  · <b :style="{ color: r.pct > 0 ? '#f5a623' : '#34c273' }">{{ r.pct > 0 ? '+' : '' }}{{ r.pct }}%</b>
                </template>
                <template v-else> · 无预估对照</template>
              </template>
            </div>
          </div>
        </div>
        <div v-else class="muted">本周期没有计划投入——从「计划」页启动计划，或打卡时关联计划</div>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top: 0">
          <span>时间流向</span>
          <span class="muted">本期 vs 上期 · 按分类</span>
        </div>
        <div v-if="review.catFlow.length">
          <div class="flow-stack" v-if="flowStack.nowTotal || flowStack.prevTotal">
            <div class="fs-label"><span>本期</span><b>{{ fmtDur(flowStack.nowTotal) }}</b></div>
            <div class="fs-bar">
              <div v-for="(sg, i) in flowStack.now" :key="'n' + i" :style="{ width: sg.pct + '%', background: sg.color }" :title="sg.name"></div>
            </div>
            <div class="fs-label"><span>上期</span><b>{{ fmtDur(flowStack.prevTotal) }}</b></div>
            <div class="fs-bar">
              <div v-for="(sg, i) in flowStack.prev" :key="'p' + i" :style="{ width: sg.pct + '%', background: sg.color, opacity: 0.45 }" :title="sg.name"></div>
            </div>
          </div>
          <div class="pa-row" v-for="f in review.catFlow" :key="f.categoryId">
            <span class="name">{{ catalog.catName(f.categoryId) }}</span>
            <div class="pa-bars">
              <div class="track">
                <div class="fill act" :style="{ width: (f.nowMs / flowMax) * 100 + '%', '--c': catalog.catColor(f.categoryId) }"></div>
              </div>
              <div class="track">
                <div class="fill prev" :style="{ width: (f.prevMs / flowMax) * 100 + '%' }"></div>
              </div>
            </div>
            <span class="val">
              {{ fmtDur(f.nowMs) }}
              <b :style="{ color: f.diff > 0 ? '#f5a623' : f.diff < 0 ? '#34c273' : 'inherit' }">
                {{ f.diff > 0 ? '+' : '' }}{{ f.diff < 0 ? '−' : '' }}{{ f.diff ? fmtDur(Math.abs(f.diff)) : '—' }}
              </b>
            </span>
          </div>
          <div class="pa-legend">
            <span><i class="swatch" style="background: var(--brand)"></i>本期</span>
            <span><i class="swatch" style="background: #98a2b3"></i>上期</span>
          </div>
        </div>
        <div v-else class="muted">本周期暂无记录</div>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top: 0">
          <span>挂起原因</span>
          <span class="muted">共 {{ review.pauseTrend.total }} 次 · 上期 {{ review.pauseTrend.prevTotal }} 次</span>
        </div>
        <div v-if="review.pauseTrend.rows.length">
          <div class="pa-row" v-for="r in review.pauseTrend.rows" :key="r.reason">
            <span class="name">{{ r.reason }}</span>
            <div class="track" style="flex: 1">
              <div class="fill" style="background: #f5a623" :style="{ width: (r.n / pauseMax) * 100 + '%' }"></div>
            </div>
            <span class="val">
              {{ r.n }} 次
              <span class="muted">上期 {{ r.prevN }}</span>
            </span>
          </div>
        </div>
        <div v-else class="muted">本周期无挂起——执行节奏稳定 👍</div>
      </div>
    </template>

    <template v-else>
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
          <span><i class="swatch" style="background: var(--est-bar)"></i>预估</span>
          <span><i class="swatch" style="background: var(--brand)"></i>实际</span>
        </div>
      </div>

      <div v-if="catTotals.length" class="card">
        <div class="section-title" style="margin-top: 0">分类占比</div>
        <EChart :option="pieOption" height="220px" />
        <div class="donut-legend">
          <div class="dl-row" v-for="t in catTotals" :key="t.categoryId">
            <i class="dl-dot" :style="{ background: catalog.catColor(t.categoryId) }"></i>
            <span class="dl-name">{{ catalog.catName(t.categoryId) }}</span>
            <span class="dl-pct">{{ total ? Math.round((t.ms / total) * 100) : 0 }}%</span>
            <span class="dl-val">{{ fmtDur(t.ms) }}</span>
          </div>
        </div>
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
    </template>
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
.cell-icon {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 16px;
  color: var(--text-3);
  opacity: 0.6;
}
.stat-grid .cell {
  position: relative;
}
.stat-grid .cell .num {
  font-size: 17px;
  white-space: nowrap;
}
.band {
  background: var(--card-2);
  border-radius: 8px;
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.band-lane {
  position: relative;
  height: 12px;
}
.band-seg {
  position: absolute;
  top: 0;
  height: 12px;
  border-radius: 3px;
}
.band-ticks {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-3);
  margin-top: 4px;
}
.gp-row {
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.gp-row:last-child {
  border-bottom: 0;
}
.gp-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.gp-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gp-kind {
  flex: none;
  font-size: 10px;
  color: var(--brand);
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 0 5px;
  line-height: 15px;
}
.gp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.gp-val {
  flex: none;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.gp-val.done {
  color: #34c273;
  font-weight: 600;
}
.gp-track {
  margin-top: 7px;
  height: 8px;
  border-radius: 4px;
  background: var(--track);
  overflow: hidden;
}
.gp-fill {
  height: 100%;
  border-radius: 4px;
  min-width: 2px;
  transition: width 0.3s;
}
.gp-fill.done {
  background: #34c273;
}
.gp-fill.behind {
  background: #f5a623;
}
.gp-sub {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  margin-top: 4px;
  color: var(--text-2);
}
.gp-sub .done {
  color: #34c273;
  font-weight: 600;
}
.gp-done {
  color: #34c273;
}
.gp-behind {
  color: #f5a623;
}
.gp-kind-budget {
  color: #f5a623;
}
.gp-fill.over {
  background: #ee5a5a;
}
.gp-fill.near {
  background: #f5a623;
}
.gp-over {
  color: #ee5a5a;
  font-weight: 600;
}
.gp-near {
  color: #f5a623;
}
.donut-legend {
  margin-top: 4px;
}
.dl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--line);
}
.dl-row:last-child {
  border-bottom: 0;
}
.dl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.dl-name {
  flex: 1;
  color: var(--text-2);
}
.dl-pct {
  width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
}
.dl-val {
  width: 70px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.flow-stack {
  margin-bottom: 10px;
}
.fs-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-3);
  margin: 4px 0 3px;
}
.fs-label b {
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.fs-bar {
  display: flex;
  height: 14px;
  border-radius: 7px;
  overflow: hidden;
  background: var(--track);
}
.fs-bar div {
  height: 100%;
}
.rv-gran {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
}
.rv-gran button {
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--text-2);
  border-radius: 999px;
  padding: 4px 16px;
  font-size: 12px;
}
.rv-gran button.active {
  border-color: var(--brand);
  color: var(--brand);
  font-weight: 600;
}
.rv-plan {
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.rv-plan:last-child {
  border-bottom: 0;
}
.rv-plan-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.rv-plan-title {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rv-status {
  flex: none;
  font-size: 10px;
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 0 6px;
  line-height: 16px;
}
.rv-status.st-done,
.rv-status.st-active {
  color: #34c273;
}
.rv-status.st-paused {
  color: #f5a623;
}
.rv-status.st-waiting,
.rv-status.st-cancelled {
  color: var(--text-3);
}
.rv-plan-val {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 4px;
}
.pa-bars .fill.prev {
  background: #98a2b3;
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
  background: var(--track);
  overflow: hidden;
}
.pa-bars .fill {
  height: 100%;
  border-radius: 4px;
  min-width: 2px;
}
.pa-bars .fill.est {
  background: var(--est-bar);
}
.pa-bars .fill.act {
  background: var(--c, var(--brand));
}
.pa-row .val {
  width: 88px;
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
  align-items: stretch;
}
.heat-labels {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  gap: 2px;
  font-size: 9px;
  color: var(--text-3);
  flex: none;
  width: 14px;
}
.heat-grid {
  flex: 1;
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  aspect-ratio: 24 / 7;
}
.heat-cell {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  border: 0;
  padding: 0;
  cursor: pointer;
  background: var(--heat-empty);
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
