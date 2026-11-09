<script setup>
// 版本迭代史弹层：数据来自构建时注入的 CHANGELOG.md（发版三件套之一，天然与版本同步）
// 当前版本置顶高亮"当前"标签；小节按类型着色（新增绿/修复橙/安全红）
import { computed } from 'vue';
import { parseChangelog, sectionColor, APP_VERSION } from '../lib/changelog.js';

const props = defineProps({ show: Boolean });
const emit = defineEmits(['update:show']);

const releases = computed(() => parseChangelog());

// "当前线"判定：运行版本（本地构建可能比最新发布高一个 patch）落在哪个发布区间，
// 就把那条发布标为当前——本地自动版本也能对位到迭代史
function isCurrent(v, rels) {
  if (!APP_VERSION || APP_VERSION === 'dev') return false;
  const cmp = (a, b) => {
    const [a1, a2, a3] = a.split('.').map(Number);
    const [b1, b2, b3] = b.split('.').map(Number);
    return a1 - b1 || a2 - b2 || (a3 || 0) - (b3 || 0);
  };
  const idx = rels.findIndex((r) => cmp(APP_VERSION, r.version) >= 0); // 倒序列表第一个 ≤ 运行版本
  return idx >= 0 && rels[idx].version === v;
}
// 条目轻格式化：**粗体** 与 `代码`（数据源为仓库内 CHANGELOG，先转义再替换，安全）
function fmtItem(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code class="vh-code">$1</code>');
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    class="popup-safe"
    :style="{ height: '76vh' }"
    @update:show="(v) => emit('update:show', v)"
  >
    <div class="vh-sheet">
      <div class="vh-title">版本迭代</div>
      <div class="vh-list">
        <div v-for="rel in releases" :key="rel.version" class="vh-rel">
          <div class="vh-rel-head">
            <span class="vh-ver">v{{ rel.version }}</span>
            <span v-if="isCurrent(rel.version, releases)" class="vh-cur">当前</span>
            <span class="vh-date">{{ rel.date }}</span>
          </div>
          <div v-for="sec in rel.sections" :key="sec.title" class="vh-sec">
            <div class="vh-sec-title" :style="{ color: sectionColor(sec.title) }">{{ sec.title }}</div>
            <ul class="vh-items">
              <li v-for="(it, i) in sec.items" :key="i" v-html="fmtItem(it)"></li>
            </ul>
          </div>
        </div>
        <div v-if="!releases.length" class="vh-empty">暂无版本迭代信息</div>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.vh-sheet {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 18px 16px 8px;
}
.vh-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 10px;
  flex: none;
}
.vh-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 12px;
}
.vh-rel {
  padding: 10px 0 12px;
  border-bottom: 1px solid var(--line);
}
.vh-rel:last-child {
  border-bottom: 0;
}
.vh-rel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.vh-ver {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.vh-cur {
  font-size: 10px;
  color: var(--brand);
  border: 1px solid var(--brand);
  border-radius: 999px;
  padding: 0 6px;
  line-height: 16px;
}
.vh-date {
  font-size: 11px;
  color: var(--text-3);
  margin-left: auto;
}
.vh-sec {
  margin: 8px 0 4px;
}
.vh-sec-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}
.vh-items {
  margin: 0;
  padding-left: 16px;
}
.vh-items li {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.7;
  word-break: break-word;
}
.vh-items li :deep(b) {
  color: var(--text);
}
.vh-items li :deep(code) {
  font-size: 11px;
  background: var(--card-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 4px;
}
.vh-empty {
  text-align: center;
  color: var(--text-3);
  font-size: 12px;
  padding: 30px 0;
}
</style>
