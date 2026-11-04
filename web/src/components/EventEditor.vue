<script setup>
// 事件编辑/补录面板：编辑既有记录或手动补录过去的时段
import { computed, ref, watch } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import { useCatalogStore } from '../stores/catalog.js';
import { putRow, softDelete } from '../db/repo.js';
import { uuid } from '../lib/util.js';
import { toLocalInput, fromLocalInput } from '../lib/time.js';

const props = defineProps({
  show: Boolean,
  event: { type: Object, default: null }, // null = 手动补录新事件
});
const emit = defineEmits(['update:show', 'saved']);

const catalog = useCatalogStore();

const form = ref(null);
const splitAt = ref(null);
const running = computed(() => form.value && form.value.endAt == null);
// 已结束且超过 5 分钟的记录才可拆分
const canSplit = computed(
  () => form.value && form.value.endAt != null && form.value.endAt - form.value.startAt > 5 * 60_000
);

watch(
  () => props.show,
  (v) => {
    if (!v) return;
    if (props.event) {
      form.value = {
        ...props.event,
        estimateMin: props.event.estimateMs ? Math.round(props.event.estimateMs / 60000) : '',
      };
    } else {
      const now = Date.now();
      form.value = {
        id: uuid(),
        title: '',
        categoryId: catalog.sortedCategories[0]?.id || '',
        goalId: null,
        startAt: now - 60 * 60 * 1000,
        endAt: now,
        note: '',
        estimateMin: '',
        createdAt: now,
      };
    }
    // 拆分时间点默认为记录中点
    splitAt.value = canSplit.value
      ? Math.round((form.value.startAt + form.value.endAt) / 2)
      : null;
  }
);

async function save() {
  const f = form.value;
  if (!f.categoryId) return showToast('请选择分类');
  if (f.endAt != null && f.endAt < f.startAt) return showToast('结束时间不能早于开始时间');
  const estimateMs =
    f.estimateMin === '' || f.estimateMin == null
      ? null
      : Number(f.estimateMin) > 0
        ? Math.round(Number(f.estimateMin) * 60000)
        : null;
  if (f.estimateMin !== '' && f.estimateMin != null && !estimateMs) return showToast('预计用时需为正数（分钟）');
  const { estimateMin, ...row } = f;
  await putRow('events', { ...row, title: (f.title || '').trim() || '未命名事项', estimateMs });
  showToast('已保存');
  emit('update:show', false);
  emit('saved');
}

async function stopNow() {
  form.value = { ...form.value, endAt: Date.now() };
  await save();
}

async function doSplit() {
  const f = form.value;
  const s = splitAt.value;
  if (!s || s <= f.startAt || s >= f.endAt) return showToast('拆分时间需在起止时间之间');
  const ratio = (s - f.startAt) / (f.endAt - f.startAt);
  const est1 = f.estimateMs ? Math.max(1, Math.round(f.estimateMs * ratio)) : null;
  const est2 = f.estimateMs ? f.estimateMs - est1 : null;
  // 前半段：原记录截断
  await putRow('events', { ...f, endAt: s, estimateMs: est1, estimateMin: undefined });
  // 后半段：新记录，事项/分类/目标/备注继承
  await putRow('events', {
    id: uuid(),
    title: f.title,
    categoryId: f.categoryId,
    goalId: f.goalId,
    startAt: s,
    endAt: f.endAt,
    note: f.note,
    estimateMs: est2,
    createdAt: Date.now(),
  });
  showToast('已拆分为两条记录');
  emit('update:show', false);
  emit('saved');
}

async function remove() {
  await showConfirmDialog({ title: '删除这条记录？' });
  await softDelete('events', form.value.id);
  showToast('已删除');
  emit('update:show', false);
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    :style="{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }"
    @update:show="(v) => emit('update:show', v)"
  >
    <div v-if="form" class="sheet">
      <div class="sheet-title">{{ event ? '编辑记录' : '补录时段' }}</div>

      <van-field v-model="form.title" placeholder="事项名称" clearable />
      <van-field v-model="form.estimateMin" type="number" placeholder="预计用时（分钟，选填，用于计划对比）" />

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
        <div class="field-label">关联目标</div>
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

      <div class="field-label">开始时间</div>
      <input class="dt-input" type="datetime-local" :value="toLocalInput(form.startAt)" @input="form.startAt = fromLocalInput($event.target.value)" />

      <template v-if="!running">
        <div class="field-label">结束时间</div>
        <input class="dt-input" type="datetime-local" :value="toLocalInput(form.endAt)" @input="form.endAt = fromLocalInput($event.target.value)" />
      </template>
      <div v-else class="muted" style="margin-top: 10px">该事项正在计时中，结束时间由打卡决定。</div>

      <template v-if="canSplit">
        <div class="field-label">从中间拆成两条（两件事连着记了？）</div>
        <div class="split-row">
          <input
            class="dt-input"
            type="datetime-local"
            :value="toLocalInput(splitAt)"
            @input="splitAt = fromLocalInput($event.target.value)"
          />
          <van-button size="small" plain type="primary" @click="doSplit">拆分</van-button>
        </div>
      </template>

      <div class="field-label">备注</div>
      <van-field
        v-model="form.note"
        type="textarea"
        rows="2"
        autosize
        placeholder="补充说明（做了什么、产出、感受…）"
      />

      <div class="btn-row">
        <van-button v-if="event" plain type="danger" @click="remove">删除</van-button>
        <van-button v-if="running" type="primary" @click="stopNow">结束计时</van-button>
        <van-button type="primary" @click="save">保存</van-button>
      </div>
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
.field-label {
  font-size: 12px;
  color: var(--text-3);
  margin: 14px 2px 8px;
}
.dt-input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  background: #fafbfd;
  color: var(--text);
  font-family: inherit;
}
.split-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.split-row .dt-input {
  flex: 1;
}
.btn-row {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}
.btn-row .van-button {
  flex: 1;
}
</style>
