<script setup>
// 功能说明：页面头部的小「?」入口，点击弹出该功能的用法说明
// 文案集中在 lib/feature-notes.js；用法：<FeatureNote k="plan" />
import { ref } from 'vue';
import { FEATURE_NOTES } from '../lib/feature-notes.js';

const props = defineProps({ k: { type: String, required: true } });
const show = ref(false);
const note = FEATURE_NOTES[props.k] || null;
</script>

<template>
  <template v-if="note">
    <span class="fn-btn" title="功能说明" @click.stop="show = true">?</span>
    <van-popup v-model:show="show" position="bottom" round class="popup-safe">
      <div class="fn-sheet">
        <div class="fn-title">{{ note.title }}</div>
        <div class="fn-body">
          <p v-for="(p, i) in note.body" :key="i">{{ p }}</p>
        </div>
        <van-button type="primary" block round @click="show = false">知道了</van-button>
      </div>
    </van-popup>
  </template>
</template>

<style scoped>
.fn-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--line);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
  flex: none;
}
.fn-btn:active {
  color: var(--brand);
  border-color: var(--brand);
}
.fn-sheet {
  padding: 20px 18px 12px;
}
.fn-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 10px;
}
.fn-body p {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.8;
  margin: 0 0 10px;
}
</style>
