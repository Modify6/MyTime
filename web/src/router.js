import { createRouter, createWebHistory } from 'vue-router';
import TodayView from './views/TodayView.vue';
import RecordsView from './views/RecordsView.vue';
import StatsView from './views/StatsView.vue';
import GoalsView from './views/GoalsView.vue';
import GoalDetailView from './views/GoalDetailView.vue';
import SettingsView from './views/SettingsView.vue';

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
