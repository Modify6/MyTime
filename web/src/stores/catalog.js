import { defineStore } from 'pinia';
import { getCategories, getGoals, putRow, softDelete, onChange } from '../db/repo.js';

export const useCatalogStore = defineStore('catalog', {
  state: () => ({ categories: [], goals: [], loaded: false }),
  getters: {
    sortedCategories: (s) =>
      s.categories.filter((c) => !c.deleted).sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt),
    activeGoals: (s) => s.goals.filter((g) => !g.deleted && !g.archived),
    archivedGoals: (s) => s.goals.filter((g) => !g.deleted && g.archived),
    categoryMap: (s) => Object.fromEntries(s.categories.map((c) => [c.id, c])),
    goalMap: (s) => Object.fromEntries(s.goals.map((g) => [g.id, g])),
  },
  actions: {
    async load() {
      [this.categories, this.goals] = await Promise.all([getCategories(), getGoals()]);
      this.loaded = true;
    },
    watch() {
      return onChange(() => this.load());
    },
    async saveCategory(c) {
      await putRow('categories', c);
    },
    async removeCategory(id) {
      await softDelete('categories', id);
    },
    async saveGoal(g) {
      await putRow('goals', g);
    },
    async removeGoal(id) {
      await softDelete('goals', id);
    },
    catName(id) {
      return this.categoryMap[id]?.name || '未分类';
    },
    catColor(id) {
      return this.categoryMap[id]?.color || '#90A4AE';
    },
    goalName(id) {
      return this.goalMap[id]?.name || '';
    },
  },
});
