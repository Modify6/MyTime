import { createRouter, createWebHistory } from 'vue-router';

// 路由级代码分割：每个页面独立 chunk，首屏不加载 echarts 等重组件
const TodayView = () => import('./views/TodayView.vue');
const RecordsView = () => import('./views/RecordsView.vue');
const StatsView = () => import('./views/StatsView.vue');
const GoalsView = () => import('./views/GoalsView.vue');
const GoalDetailView = () => import('./views/GoalDetailView.vue');
const SettingsView = () => import('./views/SettingsView.vue');

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
