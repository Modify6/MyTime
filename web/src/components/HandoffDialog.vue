<script setup>
// 调度弹窗：启动新事项（计划或手动打卡）时若有运行中的计时，强制处置——全部挂起（填原因）或 全部结束（填原因）
// 柳比歇夫原则：同一时刻只有一件事执行，列出全部运行中计时逐条明示去向
import { ref, computed, watch } from 'vue';
import { usePlanStore } from '../stores/plan.js';
import { useTimerStore } from '../stores/timer.js';
import { fmtDur } from '../lib/time.js';

const props = defineProps({
  show: Boolean,
  newPlan: { type: Object, default: null }, // 即将启动的计划（手动打卡时为 null）
  newLabel: { type: String, default: '' }, // 手动打卡场景：即将开始的描述，如「开始打卡：学习」
});
const emit = defineEmits(['update:show', 'confirm']);

const planStore = usePlanStore();
const timer = useTimerStore();

const PAUSE_REASONS = ['临时插入更紧急的事', '等待外部条件', '被他人打断', '先处理其他事'];
const FINISH_REASONS = ['按计划完成', '提前完成', '当前计划不再继续'];

// 全部运行中计时（含其他设备同步来的并行事件）
const runningItems = computed(() =>
  timer.running.map((ev) => {
    const plan = planStore.byId(ev.planId);
    return {
      ev,
      elapsed: Math.max(0, timer.now - ev.startAt),
      source: plan ? `计划 · ${plan.kind === 'planned' ? '提前规划' : '临时'}` : '手动打卡',
    };
  })
);

const headTitle = computed(() =>
  props.newPlan ? `调度：启动「${props.newPlan.title}」` : props.newLabel ? `调度：${props.newLabel}` : '调度'
);

const mode = ref('pause'); // pause | finish
const reason = ref('');
const custom = ref('');

watch(
  () => props.show,
  (v) => {
    if (v) {
      mode.value = 'pause';
      reason.value = '';
      custom.value = '';
    }
  }
);

const reasonError = computed(() =>
  !reason.value.trim() && !custom.value.trim() ? '请选择或填写原因' : ''
);

function confirm() {
  const finalReason = custom.value.trim() || reason.value.trim();
  if (!finalReason) return;
  emit('confirm', { action: mode.value, reason: finalReason });
  emit('update:show', false);
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
    <div class="handoff" v-if="runningItems.length">
      <div class="sheet-title">{{ headTitle }}</div>
      <div class="list-box">
        <div class="list-head">
          当前有 {{ runningItems.length }} 个计时进行中，启动后将全部处置：
        </div>
        <div v-for="it in runningItems" :key="it.ev.id" class="run-row">
          <div class="run-main">
            <b>{{ it.ev.title }}</b>
            <span class="src" :class="{ manual: !it.ev.planId }">{{ it.source }}</span>
          </div>
          <span class="muted">已计 {{ fmtDur(it.elapsed) }}</span>
          <span class="dest" :class="mode">{{ mode === 'pause' ? '→ 挂起' : '→ 结束落账' }}</span>
        </div>
      </div>

      <div class="mode-row">
        <button class="mode-btn" :class="{ active: mode === 'pause' }" @click="mode = 'pause'">
          <b>全部挂起</b>
          <span>稍后回来继续</span>
        </button>
        <button class="mode-btn finish" :class="{ active: mode === 'finish' }" @click="mode = 'finish'">
          <b>全部结束</b>
          <span>完成并落账</span>
        </button>
      </div>

      <div class="field-label">{{ mode === 'pause' ? '挂起原因（必填）' : '结束原因（必填）' }}</div>
      <div class="reason-grid">
        <button
          v-for="r in mode === 'pause' ? PAUSE_REASONS : FINISH_REASONS"
          :key="r"
          class="reason-chip"
          :class="{ active: reason === r }"
          @click="reason = r"
        >
          {{ r }}
        </button>
      </div>
      <van-field v-model="custom" placeholder="或自定义原因…" />

      <div class="err" v-if="reasonError">{{ reasonError }}</div>

      <van-button type="primary" block round :disabled="!!reasonError" @click="confirm">
        确认并{{ newPlan ? '启动新计划' : '开始新打卡' }}
      </van-button>
    </div>
  </van-popup>
</template>

<style scoped>
.handoff {
  padding: 16px 16px 8px;
}
.sheet-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 10px;
}
.list-box {
  background: var(--card-2);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  margin-bottom: 12px;
}
.list-head {
  color: var(--text-2);
  margin-bottom: 6px;
}
.run-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 7px 0;
  border-top: 1px solid var(--line);
}
.run-main {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 100%;
}
.src {
  font-size: 11px;
  color: #f5a623;
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 0 6px;
  line-height: 16px;
  flex: none;
}
.src.manual {
  color: var(--text-3);
}
.dest {
  font-size: 12px;
  font-weight: 600;
}
.dest.pause {
  color: var(--brand);
}
.dest.finish {
  color: var(--danger);
}
.mode-row {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.mode-btn {
  flex: 1;
  border: 1.5px solid var(--line);
  background: var(--card);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}
.mode-btn b {
  font-size: 14px;
  color: var(--text);
}
.mode-btn span {
  font-size: 11px;
  color: var(--text-3);
}
.mode-btn.active {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 8%, var(--card));
}
.mode-btn.finish.active {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, var(--card));
}
.reason-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.reason-chip {
  border: 1px solid var(--line);
  background: var(--card);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12.5px;
  color: var(--text-2);
  cursor: pointer;
}
.reason-chip.active {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 10%, var(--card));
  color: var(--brand);
  font-weight: 600;
}
.field-label {
  font-size: 12px;
  color: var(--text-3);
  margin: 4px 2px 8px;
}
.err {
  color: var(--danger);
  font-size: 12px;
  margin: 4px 2px 8px;
}
</style>
