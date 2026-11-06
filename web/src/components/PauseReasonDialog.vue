<script setup>
// 挂起原因弹窗：计划页与今日页的挂起动作共用（原因可选填，预设 + 自定义）
import { ref, watch } from 'vue';
import { PAUSE_REASONS } from '../stores/plan.js';

const props = defineProps({ show: Boolean });
const emit = defineEmits(['update:show', 'confirm']);

const reason = ref('');
const custom = ref('');

watch(
  () => props.show,
  (v) => {
    if (v) {
      reason.value = '';
      custom.value = '';
    }
  }
);

function confirm() {
  const finalReason = custom.value.trim() || reason.value.trim() || null;
  emit('confirm', { reason: finalReason });
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
    <div class="pause-sheet">
      <div class="sheet-title-sm">挂起当前计划</div>
      <div class="muted" style="margin-bottom: 10px">挂起后可随时恢复执行；原因将计入时间分配分析。</div>
      <div class="reason-grid">
        <button
          v-for="r in PAUSE_REASONS"
          :key="r"
          class="reason-chip"
          :class="{ active: reason === r }"
          @click="reason = r"
        >
          {{ r }}
        </button>
      </div>
      <van-field v-model="custom" placeholder="或自定义原因…（选填）" />
      <van-button type="primary" block round style="margin-top: 12px" @click="confirm">确认挂起</van-button>
    </div>
  </van-popup>
</template>

<style scoped>
.pause-sheet {
  padding: 16px 16px 8px;
}
.sheet-title-sm {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 6px;
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
</style>
