<script setup>
import { onMounted, onUnmounted } from 'vue';
import { showToast } from 'vant';
import { useTimerStore } from './stores/timer.js';
import { useCatalogStore } from './stores/catalog.js';
import { useSyncStore } from './stores/sync.js';
import { isLoggedIn } from './auth/local.js';
import { isNative, nativeTimer } from './lib/native.js';
import { fmtDur } from './lib/time.js';

const timer = useTimerStore();
const catalog = useCatalogStore();
const sync = useSyncStore();
let unwatch;

onMounted(async () => {
  unwatch = timer.watch();
  catalog.watch();
  await Promise.all([timer.refresh(), catalog.load()]);
  if (isLoggedIn()) sync.setup();
  // 原生 App：通知栏"结束打卡"按钮 → 正常落账
  if (isNative) {
    nativeTimer()?.addListener?.('timerStopRequested', async () => {
      const ev = await timer.stopCurrent();
      if (ev) showToast(`已记录 ${fmtDur(ev.endAt - ev.startAt)}`);
    });
  }
});
onUnmounted(() => unwatch?.());
</script>

<template>
  <router-view />
  <van-tabbar route safe-area-inset-bottom>
    <van-tabbar-item to="/" icon="clock-o">今日</van-tabbar-item>
    <van-tabbar-item to="/records" icon="orders-o">记录</van-tabbar-item>
    <van-tabbar-item to="/stats" icon="chart-trending-o">统计</van-tabbar-item>
    <van-tabbar-item to="/goals" icon="aim">目标</van-tabbar-item>
    <van-tabbar-item to="/settings" icon="setting-o">设置</van-tabbar-item>
  </van-tabbar>
</template>
