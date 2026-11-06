<script setup>
// 调度弹窗：启动新计划时若当前有执行中的计划，强制处置——挂起（填原因）或 结束并完成（填原因）
import { ref, computed, watch } from 'vue';
import { usePlanStore } from '../stores/plan.js';
import { useTimerStore } from '../stores/timer.js';
import { fmtDur } from '../lib/time.js';

const props = defineProps({
  show: Boolean,
  newPlan: { type: Object, default: null }, // 即将启动的计划
});
const emit = defineEmits(['update:show', 'confirm']);

const planStore = usePlanStore();
const timer = useTimerStore();
const current = computed(() => planStore.activePlan);

const PAUSE_REASONS = ['临时插入更紧急的事', '等待外部条件', '被他人打断', '先处理其他事'];
const FINISH_REASONS = ['按计划完成', '提前完成', '当前计划不再继续'];

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
    <div class="handoff" v-if="current && newPlan">
      <div class="sheet-title">调度：启动「{{ newPlan.title }}」</div>
      <div class="current-box">
        当前执行中：<b>{{ current.title }}</b>
        <span class="muted">（已计入 {{ fmtDur(timer.elapsedMs) }}）</span>
      </div>

      <div class="mode-row">
        <button class="mode-btn" :class="{ active: mode === 'pause' }" @click="mode = 'pause'">
          <b>挂起当前</b>
          <span>稍后回来继续</span>
        </button>
        <button class="mode-btn finish" :class="{ active: mode === 'finish' }" @click="mode = 'finish'">
          <b>结束当前</b>
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
        确认并启动新计划
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
.current-box {
  background: var(--card-2);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  margin-bottom: 12px;
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
