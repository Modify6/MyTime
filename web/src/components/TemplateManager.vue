<script setup>
// 事件组模板管理：模板列表（含每次执行统计）→ 一键实例化为待执行计划组
import { computed, onMounted, ref } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import { usePlanStore } from '../stores/plan.js';
import { templateStats } from '../stats/template.js';
import { getAllEvents, getEventsBetween } from '../db/repo.js';
import { fmtDur } from '../lib/time.js';
import dayjs from 'dayjs';

const emit = defineEmits(['instantiated']);
const planStore = usePlanStore();
const events = ref([]);
const showForm = ref(false);
const editing = ref(null);
const formName = ref('');
const formItems = ref([{ title: '', estimateMin: '' }]);
const expanded = ref(null); // 展开查看实例明细的模板 id
  // —— 从记录导入：选某天的真实记录勾选为子任务 ——
  const showImport = ref(false);
  const importDate = ref(dayjs().subtract(1, 'day').format('YYYY-MM-DD')); // 默认昨天（本地时区）
  const importEvents = ref([]);
  const importSel = ref(new Set());
  async function openImport() {
    importSel.value = new Set();
    showImport.value = true;
    await loadImportEvents();
  }
  async function loadImportEvents() {
    const d = new Date(importDate.value + 'T00:00:00');
    const start = d.getTime();
    importEvents.value = (await getEventsBetween(start, start + 86400000)).filter((e) => !e.deleted);
    importSel.value = new Set();
  }
  function toggleImport(id) {
    const next = new Set(importSel.value);
    next.has(id) ? next.delete(id) : next.add(id);
    importSel.value = next;
  }
  function confirmImport() {
    const picked = importEvents.value.filter((e) => importSel.value.has(e.id));
    if (!picked.length) return;
    for (const e of picked) {
      const minutes = Math.max(1, Math.round(((e.endAt ?? Date.now()) - e.startAt) / 60000));
      formItems.value.push({ title: e.title, estimateMin: String(minutes) });
    }
    showImport.value = false;
    showToast(`已导入 ${picked.length} 条记录为子任务（可继续删改）`);
  }

const stats = ref({});
async function load() {
  await Promise.all([planStore.loadTemplates(), planStore.load()]);
  events.value = await getAllEvents();
  const map = {};
  for (const t of planStore.templates)
    map[t.id] = templateStats({ events: events.value, plans: planStore.plans, templateId: t.id });
  stats.value = map;
}
onMounted(load);

function openForm(t = null) {
  editing.value = t;
  formName.value = t?.name || '';
  formItems.value =
    t?.items?.map((it) => ({ title: it.title, estimateMin: it.estimateMs ? Math.round(it.estimateMs / 60000) : '' })) ||
    [{ title: '', estimateMin: '' }];
  showForm.value = true;
}
function addItem() {
  formItems.value.push({ title: '', estimateMin: '' });
}
function removeItem(i) {
  formItems.value.splice(i, 1);
}
async function saveForm() {
  try {
    await planStore.saveTemplate({
      id: editing.value?.id,
      name: formName.value,
      items: formItems.value.map((it) => ({ title: it.title, estimateMs: Number(it.estimateMin) * 60000 || null })),
    });
    showForm.value = false;
    showToast('模板已保存');
    await load();
  } catch (e) {
    showToast(e.message);
  }
}
async function instantiate(t) {
  try {
    const r = await planStore.instantiateTemplate(t.id);
    showToast(`已创建 ${r.count} 个待执行计划，去「计划」页执行`);
    emit('instantiated');
    await load();
  } catch (e) {
    showToast(e.message);
  }
}
async function removeT(t) {
  try {
    await showConfirmDialog({ title: '删除模板？', message: `「${t.name}」将被删除，已创建的计划不受影响。` });
  } catch {
    return;
  }
  await planStore.removeTemplate(t.id);
  showToast('已删除');
  await load();
}
function toggleStats(id) {
  expanded.value = expanded.value === id ? null : id;
}
</script>

<template>
  <div>
    <div class="section-title" style="margin-top: 0">
      <span>事件组模板</span>
      <van-button size="mini" plain round icon="plus" @click="openForm(null)">新建模板</van-button>
    </div>
    <div class="muted" style="margin: -6px 0 10px">
      一组常用子任务存成模板——下次从模板一键创建整组待执行计划，并自动统计每次执行的总用时
    </div>

    <div class="card tpl-card" v-for="t in planStore.templates" :key="t.id">
      <div class="tpl-head" @click="toggleStats(t.id)">
        <b class="tpl-name">{{ t.name }}</b>
        <span class="muted">{{ t.items.length }} 个子任务</span>
      </div>
      <div class="tpl-items">
        <span v-for="(it, i) in t.items" :key="i" class="tpl-item">
          {{ it.title }}<template v-if="it.estimateMs"> · {{ fmtDur(it.estimateMs) }}</template>
        </span>
      </div>
      <div class="tpl-stats muted" v-if="stats[t.id]">
        <template v-if="stats[t.id].runCount">
          已执行 {{ stats[t.id].runCount }} 次 · 平均 {{ fmtDur(stats[t.id].avgMs) }} ·
          最多 {{ fmtDur(stats[t.id].maxMs) }} · 最少 {{ fmtDur(stats[t.id].minMs) }}
        </template>
        <template v-else>尚未执行过</template>
      </div>
      <div class="tpl-actions">
        <van-button size="small" type="primary" round @click="instantiate(t)">创建本组计划</van-button>
        <van-button size="small" plain round @click="openForm(t)">编辑</van-button>
        <van-button size="small" plain round type="danger" @click="removeT(t)">删除</van-button>
      </div>
      <div v-if="expanded === t.id && stats[t.id]?.instances.length" class="tpl-instances">
        <div v-for="inst in stats[t.id].instances" :key="inst.instanceId" class="tpl-inst">
          <span>{{ new Date(inst.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) }} 创建 · {{ inst.planCount }} 个子任务</span>
          <span>实际 {{ fmtDur(inst.actMs) }}<template v-if="inst.estMs"> / 预估 {{ fmtDur(inst.estMs) }}</template></span>
        </div>
      </div>
    </div>

    <div v-if="!planStore.templates.length" class="card">
      <div class="empty-tip">还没有模板——点右上「新建模板」创建第一组</div>
    </div>

    <van-popup v-model:show="showForm" position="bottom" round class="popup-safe" :style="{ height: '72vh' }">
      <div class="tpl-form">
        <div class="tpl-form-title">{{ editing ? '编辑模板' : '新建模板' }}</div>
        <van-field v-model="formName" label="名称" placeholder="模板名称（如：晨间例会）" />
        <div class="tpl-items-label">
          子任务（可设预估用时）
          <button class="tpl-import-btn" @click="openImport">从记录导入</button>
        </div>
        <div v-if="showImport" class="tpl-import">
          <div class="tpl-import-head">
            <input type="date" v-model="importDate" @change="loadImportEvents" />
            <span class="muted">{{ importEvents.length }} 条记录</span>
          </div>
          <label v-for="e in importEvents" :key="e.id" class="tpl-import-row">
            <input type="checkbox" :checked="importSel.has(e.id)" @change="toggleImport(e.id)" />
            <span class="tpl-import-title">{{ e.title }}</span>
            <span class="muted">{{ new Date(e.startAt).toTimeString().slice(0, 5) }}–{{ e.endAt ? new Date(e.endAt).toTimeString().slice(0, 5) : '进行中' }}</span>
          </label>
          <div v-if="!importEvents.length" class="muted" style="padding: 6px 0">该日期无记录</div>
          <van-button size="small" type="primary" round :disabled="!importSel.size" @click="confirmImport">
            导入选中的 {{ importSel.size }} 条
          </van-button>
        </div>
        <div v-for="(it, i) in formItems" :key="i" class="tpl-item-row">
          <van-field v-model="it.title" placeholder="子任务标题" />
          <van-field v-model="it.estimateMin" type="digit" placeholder="预估/分">
            <template #left-icon><span class="muted" style="font-size: 11px">分</span></template>
          </van-field>
          <van-button size="mini" plain round type="danger" @click="removeItem(i)">删</van-button>
        </div>
        <van-button size="small" plain block icon="plus" @click="addItem">加一个子任务</van-button>
        <div style="margin-top: 14px">
          <van-button type="primary" block round @click="saveForm">保存模板</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.tpl-card {
  padding-bottom: 10px;
}
.tpl-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  cursor: pointer;
}
.tpl-name {
  font-size: 14px;
}
.tpl-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}
.tpl-item {
  font-size: 11px;
  color: var(--text-2);
  background: var(--card-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 8px;
}
.tpl-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.tpl-instances {
  margin-top: 8px;
  border-top: 1px dashed var(--line);
  padding-top: 6px;
}
.tpl-inst {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-2);
  padding: 3px 0;
}
.tpl-form {
  padding: 18px 14px 12px;
  height: 100%;
  overflow-y: auto;
}
.tpl-form-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 10px;
}
.tpl-items-label {
  font-size: 12px;
  color: var(--text-3);
  margin: 10px 2px 6px;
}
.tpl-item-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.tpl-import-btn {
  float: right;
  border: 0;
  background: transparent;
  color: var(--brand);
  font-size: 12px;
  cursor: pointer;
}
.tpl-import {
  border: 1px dashed var(--line);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 8px;
}
.tpl-import-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.tpl-import-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 2px;
  font-size: 12px;
  border-bottom: 1px solid var(--line);
}
.tpl-import-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tpl-item-row .van-field {
  background: var(--card-2);
  border-radius: 6px;
  padding: 6px 8px;
}
</style>
