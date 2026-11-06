<script setup>
// 计划结束原因弹窗：完成/取消统一走这里（结束原因计入时间分配分析）
import { ref, watch, computed } from 'vue';

const props = defineProps({
  show: Boolean,
  status: { type: String, default: 'done' }, // done | cancelled
});
const emit = defineEmits(['update:show', 'confirm']);

const REASONS = {
  done: ['按计划完成', '提前完成'],
  cancelled: ['不再继续', '有更重要的事', '重复创建'],
};
const reason = ref('');
const custom = ref('');

const title = computed(() => (props.status === 'done' ? '完成计划' : '取消计划'));

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
  const finalReason = custom.value.trim() || reason.value.trim();
  if (!finalReason) return;
  emit('confirm', { status: props.status, reason: finalReason });
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
    <div class="close-sheet">
      <div class="sheet-title-sm">{{ title }}</div>
      <div class="muted" style="margin-bottom: 10px">结束原因将计入时间分配分析。</div>
      <div class="reason-grid">
        <button
          v-for="r in REASONS[status] || REASONS.done"
          :key="r"
          class="reason-chip"
          :class="{ active: reason === r }"
          @click="reason = r"
        >
          {{ r }}
        </button>
      </div>
      <van-field v-model="custom" placeholder="或自定义原因…（选填）" />
      <van-button
        type="primary"
        block
        round
        style="margin-top: 12px"
        :disabled="!reason && !custom"
        @click="confirm"
      >
        确认
      </van-button>
    </div>
  </van-popup>
</template>

<style scoped>
.close-sheet {
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
