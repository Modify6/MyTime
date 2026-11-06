<script setup>
// 打卡开始面板：顶部智能推荐（习惯 + 时段分析），下方手动选择
import { computed, ref, watch } from 'vue';
import { showToast } from 'vant';
import { useCatalogStore } from '../stores/catalog.js';
import { useTimerStore } from '../stores/timer.js';
import { getAllEvents } from '../db/repo.js';
import { titleHint, categoryHint } from '../stats/historyHint.js';
import { emojiFor } from '../stats/recommend.js';
import { fmtDur } from '../lib/time.js';
import { bindBackClose } from '../lib/native.js';

const props = defineProps({
  show: Boolean,
  recs: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:show', 'quick', 'started']);

const catalog = useCatalogStore();
const timer = useTimerStore();
bindBackClose(() => props.show, () => emit('update:show', false));

const title = ref('');
const categoryId = ref('');
const goalId = ref(null);
const allEvents = ref([]);
const starting = ref(false);

// 预计用时：标题命中历史习惯时自动预填其平均用时（四舍五入到 5 分钟）
const EST_OPTIONS = [
  { min: 15, label: '15分' },
  { min: 30, label: '30分' },
  { min: 45, label: '45分' },
  { min: 60, label: '1小时' },
  { min: 90, label: '1.5小时' },
  { min: 120, label: '2小时' },
];
const estimateMin = ref(null);
const estimateTouched = ref(false);

watch(title, (t) => {
  if (estimateTouched.value) return;
  const h = titleHint(allEvents.value, t);
  estimateMin.value = h ? Math.max(5, Math.round(h.avgMs / 60000 / 5) * 5) : null;
});

watch(
  () => props.show,
  async (v) => {
    if (!v) return;
    allEvents.value = await getAllEvents();
    title.value = '';
    goalId.value = null;
    estimateMin.value = null;
    estimateTouched.value = false;
    categoryId.value = catalog.sortedCategories[0]?.id || '';
  }
);

// 最近用过的事项（去重、按最近时间倒序），一键回填
const recentTitles = computed(() => {
  const seen = new Map();
  for (const e of allEvents.value) {
    const t = (e.title || '').trim();
    if (t && !seen.has(t)) seen.set(t, e);
    if (seen.size >= 8) break;
  }
  return [...seen.values()];
});

const hint = computed(() => {
  const th = titleHint(allEvents.value, title.value);
  if (th) return th;
  return categoryHint(allEvents.value, categoryId.value);
});

async function start() {
  if (starting.value) return;
  if (!categoryId.value) return showToast('请先在设置里添加分类');
  starting.value = true;
  try {
    await timer.start({
      title: title.value,
      categoryId: categoryId.value,
      goalId: goalId.value,
      estimateMs: estimateMin.value ? estimateMin.value * 60000 : null,
    });
    showToast('已开始计时');
    emit('update:show', false);
    emit('started');
  } catch (e) {
    showToast(e.message || '开始失败');
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    class="popup-safe"
    @update:show="(v) => emit('update:show', v)"
  >
    <div class="sheet">
      <div class="sheet-title">开始一件事</div>

      <!-- 智能推荐 -->
      <template v-if="recs.length">
        <div class="rec-title">为你推荐</div>
        <div class="rec-row">
          <button
            v-for="(r, i) in recs"
            :key="r.title"
            class="rec-card"
            :style="{ '--c': catalog.catColor(r.categoryId), '--i': i }"
            @click="emit('quick', r)"
          >
            <span class="rec-emoji">{{ emojiFor(r.categoryId) }}</span>
            <span class="rec-name">{{ r.title }}</span>
            <span class="rec-reason">{{ r.reason }}</span>
          </button>
        </div>
        <div class="divider">或手动选择</div>
      </template>

      <van-field v-model="title" placeholder="你在做什么？（如：写论文 / 英语听力）" clearable />

      <div v-if="recentTitles.length" class="sug-row">
        <button v-for="e in recentTitles" :key="e.id" class="sug" @click="title = e.title; categoryId = e.categoryId; goalId = e.goalId">
          {{ e.title }}
        </button>
      </div>

      <div class="hint-box" v-if="hint">
        <span class="hint-label">历史参照</span>
        上次 {{ fmtDur(hint.lastMs) }} · 平均 {{ fmtDur(hint.avgMs) }} · 共 {{ hint.count }} 次
      </div>

      <div class="field-label">预计用时（选填，结束时可对比偏差）</div>
      <div class="cat-grid">
        <button
          v-for="opt in EST_OPTIONS"
          :key="opt.min"
          class="cat-item"
          :class="{ active: estimateMin === opt.min }"
          @click="estimateTouched = true; estimateMin = estimateMin === opt.min ? null : opt.min"
        >
          {{ opt.label }}
        </button>
      </div>

      <div class="field-label">分类</div>
      <div class="cat-grid">
        <button
          v-for="c in catalog.sortedCategories"
          :key="c.id"
          class="cat-item"
          :class="{ active: categoryId === c.id }"
          :style="{ '--c': c.color }"
          @click="categoryId = c.id"
        >
          <i class="dot"></i>{{ c.name }}
        </button>
      </div>

      <template v-if="catalog.activeGoals.length">
        <div class="field-label">关联目标（可选）</div>
        <div class="cat-grid">
          <button
            v-for="g in catalog.activeGoals"
            :key="g.id"
            class="cat-item"
            :class="{ active: goalId === g.id }"
            :style="{ '--c': g.color }"
            @click="goalId = goalId === g.id ? null : g.id"
          >
            <i class="dot"></i>{{ g.name }}
          </button>
        </div>
      </template>

      <van-button type="primary" block round :loading="starting" class="start-btn" @click="start">
        开始计时
      </van-button>
    </div>
  </van-popup>
</template>

<style scoped>
.sheet {
  padding: 18px 16px 8px;
  max-height: 76vh;
  overflow-y: auto;
}
.sheet-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 12px;
}
.rec-title {
  font-size: 12px;
  color: var(--text-3);
  margin: 0 2px 8px;
}
.rec-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 6px;
}
.rec-card {
  flex: none;
  width: 116px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
  background: color-mix(in srgb, var(--c) 9%, var(--card));
  padding: 10px 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  cursor: pointer;
  text-align: left;
  animation: popIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) calc(var(--i) * 70ms) backwards;
  transition: transform 0.15s;
}
.rec-card:active {
  transform: scale(0.94);
}
.rec-emoji {
  font-size: 22px;
  line-height: 1.2;
}
.rec-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rec-reason {
  font-size: 10.5px;
  color: var(--text-3);
}
.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-3);
  font-size: 11px;
  margin: 14px 0 6px;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}
.field-label {
  font-size: 12px;
  color: var(--text-3);
  margin: 14px 2px 8px;
}
.sug-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 10px 2px 2px;
}
.sug {
  flex: none;
  border: 1px solid var(--line);
  background: var(--card-3);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}
.hint-box {
  margin: 12px 2px 2px;
  padding: 9px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand) 10%, var(--card));
  color: var(--brand);
  font-size: 12.5px;
}
.hint-label {
  font-weight: 700;
  margin-right: 8px;
}
.start-btn {
  margin-top: 18px;
}
</style>
