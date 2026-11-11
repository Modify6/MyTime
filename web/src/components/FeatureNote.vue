<script setup>
// 功能说明：页面头部的「?」入口，点击弹出该功能的用法说明
// 文案集中在 lib/feature-notes.js（rows: [{ h: 小节标题, p: 正文，支持 **强调** }]）
import { ref } from 'vue';
import { FEATURE_NOTES } from '../lib/feature-notes.js';

const props = defineProps({ k: { type: String, required: true } });
const show = ref(false);
const note = FEATURE_NOTES[props.k] || null;

// **强调** → 品牌色加粗片段
function segs(p) {
  return String(p || '')
    .split(/\*\*(.+?)\*\*/g)
    .map((s, i) => ({ s, em: i % 2 === 1 }))
    .filter((x) => x.s);
}
</script>

<template>
  <template v-if="note">
    <span class="fn-btn" title="功能说明" @click.stop="show = true">?</span>
    <van-popup v-model:show="show" position="bottom" round class="popup-safe">
      <div class="fn-sheet">
        <div class="fn-head">
          <span class="fn-badge">?</span>
          <div class="fn-title">{{ note.title }}</div>
        </div>
        <div class="fn-rows">
          <div class="fn-row" v-for="(r, i) in note.rows" :key="i">
            <div class="fn-h">{{ r.h }}</div>
            <p class="fn-p">
              <template v-for="(seg, j) in segs(r.p)" :key="j">
                <b v-if="seg.em">{{ seg.s }}</b>
                <span v-else>{{ seg.s }}</span>
              </template>
            </p>
          </div>
        </div>
        <van-button type="primary" block round @click="show = false">知道了</van-button>
      </div>
    </van-popup>
  </template>
</template>

<style scoped>
/* 入口按钮：右挂在页头右侧（与同步点成组），软色圆面而非细边圆圈 */
.fn-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--seg-bg);
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  flex: none;
  margin-left: auto;
  transition: background 0.15s, color 0.15s;
}
.fn-btn:active {
  background: var(--brand);
  color: #fff;
}
.fn-sheet {
  padding: 22px 20px calc(14px + env(safe-area-inset-bottom, 0px));
}
.fn-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.fn-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(79, 110, 247, 0.12);
  color: var(--brand);
  font-size: 14px;
  font-weight: 700;
  flex: none;
}
.fn-title {
  font-size: 16px;
  font-weight: 700;
}
.fn-rows {
  margin: 4px 0 6px;
}
.fn-row {
  padding: 11px 0;
  border-top: 1px solid var(--line);
}
.fn-row:first-child {
  border-top: 0;
}
.fn-h {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 4px;
}
.fn-h::before {
  content: '';
  width: 8px;
  height: 3px;
  border-radius: 2px;
  background: var(--brand);
}
.fn-p {
  font-size: 13.5px;
  color: var(--text);
  line-height: 1.85;
  margin: 0;
}
.fn-p b {
  color: var(--brand);
  font-weight: 600;
}
</style>
