<script setup>
import { onMounted, onUnmounted } from 'vue';
import { showToast } from 'vant';
import { useTimerStore } from './stores/timer.js';
import { useCatalogStore } from './stores/catalog.js';
import { useSyncStore } from './stores/sync.js';
import { usePlanStore } from './stores/plan.js';
import { isLoggedIn } from './auth/local.js';
import { isNative, nativeTimer } from './lib/native.js';
import { fmtDur } from './lib/time.js';
import { getAllEvents, ensureSeed } from './db/repo.js';
import { uuid } from './lib/util.js';

const timer = useTimerStore();
const catalog = useCatalogStore();
const sync = useSyncStore();
const planStore = usePlanStore();
let unwatch;
let unwatchPlan;

onMounted(async () => {
  unwatch = timer.watch();
  catalog.watch();
  unwatchPlan = planStore.watch();
  await ensureSeed();
  await Promise.all([timer.refresh(), catalog.load()]);
  if (isLoggedIn()) sync.setup();
  // 原生 App：通知栏"结束打卡"按钮 → 正常落账
  if (isNative) {
    nativeTimer()?.addListener?.('timerStopRequested', async () => {
      const ev = await timer.stopCurrent();
      if (ev) showToast(`已记录 ${fmtDur(ev.endAt - ev.startAt)}`);
    });
    // 桌面小组件/快捷磁贴的深链动作
    const AppPlugin = window.Capacitor?.Plugins?.App;
    AppPlugin?.addListener?.('appUrlOpen', async (data) => {
      const url = data?.url || '';
      if (url.includes('widget/stop')) {
        const ev = await timer.stopCurrent();
        if (ev) showToast(`已记录 ${fmtDur(ev.endAt - ev.startAt)}`);
      } else if (url.includes('widget/start')) {
        await startLastFromWidget();
      }
    });
  }
});
onUnmounted(() => { unwatch?.(); unwatchPlan?.(); });

// 小组件「开始」：以最近一次已完成的事项为模板（事项/分类/目标继承）
async function startLastFromWidget() {
  if (timer.running.length) return showToast('已有进行中的计时');
  const rows = (await getAllEvents()).sort((a, b) => b.startAt - a.startAt);
  const last = rows.find((e) => e.endAt != null);
  if (!last) return showToast('还没有历史事项，先在 App 里打卡一次');
  try {
    await timer.start({ title: last.title, categoryId: last.categoryId, goalId: last.goalId });
    showToast(`已开始：${last.title}`);
  } catch (e) {
    showToast(e.message || '开始失败');
  }
}
</script>

<template>
  <router-view />
  <van-tabbar route safe-area-inset-bottom>
    <van-tabbar-item to="/" icon="clock-o">今日</van-tabbar-item>
    <van-tabbar-item to="/records" icon="orders-o">记录</van-tabbar-item>
    <van-tabbar-item to="/stats" icon="chart-trending-o">统计</van-tabbar-item>
    <van-tabbar-item to="/plans" icon="todo-list-o">计划</van-tabbar-item>
    <van-tabbar-item to="/goals" icon="aim">目标</van-tabbar-item>
    <van-tabbar-item to="/settings" icon="setting-o">设置</van-tabbar-item>
  </van-tabbar>
</template>
