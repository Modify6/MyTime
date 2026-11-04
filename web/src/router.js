import { createRouter, createWebHistory } from 'vue-router';
import TodayView from './views/TodayView.vue';
import RecordsView from './views/RecordsView.vue';
import StatsView from './views/StatsView.vue';
import GoalsView from './views/GoalsView.vue';
import GoalDetailView from './views/GoalDetailView.vue';
import SettingsView from './views/SettingsView.vue';

// 页面保持静态导入：原生 WebView 内动态 import 的 chunk 加载不可靠（曾导致底部页签无法切换）。
// 体积优化改由 EChart 组件内按需加载 echarts 实现，路由本身不再拆包。
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'today', component: TodayView },
    { path: '/records', name: 'records', component: RecordsView },
    { path: '/stats', name: 'stats', component: StatsView },
    { path: '/goals', name: 'goals', component: GoalsView },
    { path: '/goals/:id', name: 'goal-detail', component: GoalDetailView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
});

export default router;
