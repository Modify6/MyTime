<script setup>
// 计划表单：新建/编辑。类型二选一（提前规划 | 临时），预排计划可附预定日期
import { ref, watch, computed } from 'vue';
import { showToast } from 'vant';
import { usePlanStore } from '../stores/plan.js';
import { useCatalogStore } from '../stores/catalog.js';
import { uuid } from '../lib/util.js';

const props = defineProps({
  show: Boolean,
  plan: { type: Object, default: null }, // null = 新建
});
const emit = defineEmits(['update:show', 'saved']);

const planStore = usePlanStore();
const catalog = useCatalogStore();

const form = ref({});
const KINDS = [
  { key: 'planned', label: '提前规划', desc: '编排好，随时启动' },
  { key: 'temp', label: '临时', desc: '临时起意也要记录' },
];

const isEdit = computed(() => !!props.plan);

watch(
  () => props.show,
  (v) => {
    if (!v) return;
    form.value = props.plan
      ? { ...props.plan, estimateMin: props.plan.estimateMs ? Math.round(props.plan.estimateMs / 60000) : '' }
      : {
          id: uuid(),
          title: '',
          categoryId: catalog.sortedCategories[0]?.id || '',
          goalId: null,
          estimateMin: '',
          note: '',
          kind: 'planned',
          status: 'waiting',
          pauseReason: null,
          endReason: null,
          plannedDate: '',
          createdAt: Date.now(),
        };
  }
);

async function save() {
  const f = form.value;
  if (!(f.title || '').trim()) return showToast('请填写计划名称');
  if (!f.categoryId) return showToast('请选择分类');
  const estimateMs = f.estimateMin === '' || f.estimateMin == null ? null : Number(f.estimateMin) > 0 ? Math.round(Number(f.estimateMin) * 60000) : null;
  if (f.estimateMin !== '' && f.estimateMin != null && !estimateMs) return showToast('预计用时需为正数（分钟）');
  const { estimateMin, ...row } = f;
  try {
    if (isEdit.value) {
      await planStore.saveRaw({ ...row, title: f.title.trim(), estimateMs });
    } else {
      await planStore.create({
        title: f.title.trim(),
        categoryId: f.categoryId,
        goalId: f.goalId,
        estimateMs,
        kind: f.kind,
        note: f.note,
        plannedDate: f.plannedDate,
      });
    }
    showToast('已保存');
    emit('update:show', false);
    emit('saved');
  } catch (e) {
    showToast(e.message || '保存失败');
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
      <div class="sheet-title">{{ plan ? '编辑计划' : '新建计划' }}</div>

      <div class="field-label">计划类型</div>
      <div class="kind-row">
        <button
          v-for="k in KINDS"
          :key="k.key"
          class="kind-btn"
          :class="{ active: form.kind === k.key, disabled: isEdit }"
          :disabled="isEdit"
          @click="form.kind = k.key"
        >
          <b>{{ k.label }}</b>
          <span>{{ k.desc }}</span>
        </button>
      </div>

      <van-field v-model="form.title" placeholder="计划名称（如：写周报 / 整理房间）" clearable />
      <van-field v-model="form.estimateMin" type="number" placeholder="预计用时（分钟，选填）" />
      <van-field v-if="form.kind === 'planned'" v-model="form.plannedDate" type="date" placeholder="预定日期（选填）" />

      <div class="field-label">分类</div>
      <div class="cat-grid">
        <button
          v-for="c in catalog.sortedCategories"
          :key="c.id"
          class="cat-item"
          :class="{ active: form.categoryId === c.id }"
          :style="{ '--c': c.color }"
          @click="form.categoryId = c.id"
        >
          <i class="dot"></i>{{ c.name }}
        </button>
      </div>

      <template v-if="catalog.activeGoals.length">
        <div class="field-label">关联目标（可选，执行时长计入目标）</div>
        <div class="cat-grid">
          <button
            v-for="g in catalog.activeGoals"
            :key="g.id"
            class="cat-item"
            :class="{ active: form.goalId === g.id }"
            :style="{ '--c': g.color }"
            @click="form.goalId = form.goalId === g.id ? null : g.id"
          >
            <i class="dot"></i>{{ g.name }}
          </button>
        </div>
      </template>

      <div class="field-label">备注</div>
      <van-field v-model="form.note" type="textarea" rows="1" autosize placeholder="补充说明（选填）" />

      <van-button type="primary" block round style="margin-top: 14px" @click="save">保存</van-button>
    </div>
  </van-popup>
</template>

<style scoped>
.sheet {
  padding: 16px 16px 8px;
  max-height: 82vh;
  overflow-y: auto;
}
.sheet-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 10px;
}
.field-label {
  font-size: 12px;
  color: var(--text-3);
  margin: 12px 2px 8px;
}
.kind-row {
  display: flex;
  gap: 10px;
}
.kind-btn {
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
.kind-btn b {
  font-size: 14px;
  color: var(--text);
}
.kind-btn span {
  font-size: 11px;
  color: var(--text-3);
}
.kind-btn.active {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 8%, var(--card));
}
.kind-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
