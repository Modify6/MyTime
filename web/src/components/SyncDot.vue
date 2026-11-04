<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useSyncStore } from '../stores/sync.js';
import { isLoggedIn } from '../auth/local.js';

const sync = useSyncStore();
const router = useRouter();

const label = computed(() => {
  if (!isLoggedIn()) return '未连接';
  if (sync.status === 'syncing') return '同步中';
  if (sync.status === 'error') return '同步失败';
  if (sync.status === 'ok') return '已同步';
  return '待同步';
});
</script>

<template>
  <span class="sync-dot" :class="sync.status" @click="router.push('/settings')">
    <i class="led"></i>{{ label }}
  </span>
</template>
