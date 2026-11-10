<script setup>
// 目标（大事）表单：名称、目标时长、颜色、说明
import { computed, ref, watch } from 'vue';
import { showToast } from 'vant';
import { useCatalogStore } from '../stores/catalog.js';
import { bindBackClose } from '../lib/native.js';
import { uuid } from '../lib/util.js';

const props = defineProps({
  show: Boolean,
  goal: { type: Object, default: null }, // null = 新建
});
const emit = defineEmits(['update:show', 'saved']);

const catalog = useCatalogStore();
bindBackClose(() => props.show, () => emit('update:show', false));
const PALETTE = ['#4f6ef7', '#7c4dff', '#00acc1', '#43a047', '#f0a800', '#ff7043', '#ec407a', '#8d6e63'];

const form = ref({});
watch(
  () => props.show,
  (v) => {
    if (!v) return;
    form.value = props.goal
      ? { targetType: 'total', ...props.goal }
      : { id: uuid(), name: '', description: '', color: PALETTE[0], targetType: 'total', targetHours: null, archived: 0, createdAt: Date.now() };
  }
);

const KINDS = [
  { v: 'total', label: '累计', hint: '目标投入总时长（小时，选填）' },
  { v: 'weekly', label: '每周', hint: '每周投入小时数（如 10）' },
  { v: 'monthly', label: '每月', hint: '每月投入小时数（如 40）' },
];
const kindHint = computed(() => KINDS.find((k) => k.v === (form.value.targetType || 'total'))?.hint || '');

async function save() {
  const f = form.value;
  if (!(f.name || '').trim()) return showToast('请填写目标名称');
  const target = f.targetHours === '' || f.targetHours == null ? null : Number(f.targetHours);
  if (target != null && (!Number.isFinite(target) || target <= 0)) return showToast('目标时长需为正数');
  await catalog.saveGoal({ ...f, name: f.name.trim(), targetHours: target, targetType: f.targetType || 'total' });
  showToast('已保存');
  emit('update:show', false);
  emit('saved');
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
      <div class="sheet-title">{{ goal ? '编辑目标' : '新建目标' }}</div>
      <van-field v-model="form.name" placeholder="目标名称（如：读完《奇特的一生》）" clearable />
      <div class="field-label">周期</div>
      <div class="kind-row">
        <button
          v-for="k in KINDS"
          :key="k.v"
          type="button"
          class="kind-chip"
          :class="{ active: (form.targetType || 'total') === k.v }"
          @click="form.targetType = k.v"
        >{{ k.label }}</button>
      </div>
      <van-field v-model="form.targetHours" type="number" :placeholder="kindHint" />
      <van-field v-model="form.description" type="textarea" rows="2" autosize placeholder="说明（为什么想做这件事）" />

      <div class="field-label">颜色</div>
      <div class="palette">
        <button
          v-for="c in PALETTE"
          :key="c"
          class="color-dot"
          :class="{ active: form.color === c }"
          :style="{ background: c }"
          @click="form.color = c"
        ></button>
      </div>

      <van-button type="primary" block round @click="save">保存</van-button>
    </div>
  </van-popup>
</template>

<style scoped>
.sheet {
  padding: 18px 16px 8px;
}
.sheet-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 12px;
}
.field-label {
  font-size: 12px;
  color: var(--text-3);
  margin: 14px 2px 8px;
}
.kind-row {
  display: flex;
  gap: 8px;
  padding: 0 2px;
}
.kind-chip {
  flex: 1;
  border: 1px solid var(--line);
  background: var(--card);
  color: var(--text-2);
  border-radius: 999px;
  padding: 6px 0;
  font-size: 13px;
}
.kind-chip.active {
  border-color: var(--brand);
  color: var(--brand);
  font-weight: 600;
  background: var(--card-3);
}
.palette {
  display: flex;
  gap: 12px;
  padding: 2px 2px 6px;
}
.color-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.color-dot.active {
  border-color: var(--text);
  box-shadow: 0 0 0 2px #fff inset;
}
.van-button {
  margin-top: 16px;
}
</style>
