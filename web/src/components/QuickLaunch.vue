<script setup>
// 环绕主打卡按钮的快捷打卡球：位置由椭圆轨道分布，逐个弹入 + 悬浮呼吸
import { emojiFor } from '../stats/recommend.js';

const props = defineProps({ items: { type: Array, default: () => [] } });
defineEmits(['quick']);

// 在主按钮周围按椭圆均匀分布（x 用百分比适配宽度，y 用像素）
function posStyle(i) {
  const n = props.items.length || 1;
  const angle = ((-90 + (i * 360) / n) * Math.PI) / 180;
  const x = Math.cos(angle) * 36;
  const y = Math.sin(angle) * 110;
  return {
    left: `calc(50% + ${x.toFixed(2)}%)`,
    top: `calc(50% + ${y.toFixed(1)}px)`,
    '--pop-delay': `${i * 70}ms`,
    '--float-delay': `${0.5 + i * 0.35}s`,
  };
}

function short(t) {
  t = t || '';
  return t.length > 4 ? t.slice(0, 4) : t;
}
</script>

<template>
  <div class="orbit">
    <div v-for="(q, i) in items" :key="q.title" class="orbit-pos" :style="posStyle(i)">
      <button class="orbit-btn" :style="{ '--c': q.color }" @click="$emit('quick', q)">
        <span class="orb-float">
          <span class="orb-emoji">{{ emojiFor(q.categoryId) }}</span>
          <span class="orb-name">{{ short(q.title) }}</span>
        </span>
      </button>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.orbit {
  position: relative;
  height: 306px;
  width: 100%;
}
.orbit-pos {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 1;
}
.orbit-btn {
  border: 1.5px solid color-mix(in srgb, var(--c) 45%, transparent);
  background: color-mix(in srgb, var(--c) 12%, #fff);
  box-shadow: 0 4px 14px rgba(20, 30, 60, 0.1);
  width: 62px;
  height: 62px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) var(--pop-delay) backwards;
  transition: box-shadow 0.2s;
}
.orbit-btn:active {
  box-shadow: 0 2px 8px rgba(20, 30, 60, 0.18);
}
.orbit-btn:active .orb-float {
  transform: scale(0.88);
}
.orb-float {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  animation: floatY 3.4s ease-in-out var(--float-delay) infinite;
  transition: transform 0.15s;
}
.orb-emoji {
  font-size: 18px;
  line-height: 1.1;
}
.orb-name {
  font-size: 10.5px;
  line-height: 1.2;
  color: var(--text-2);
  max-width: 54px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
