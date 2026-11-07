<script setup>
// 同步状态点：显示当前同步状态；已连接时点击立即同步（手动兜底——日常全自动，无需点它），未连接时点击去设置页配置
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { useSyncStore } from '../stores/sync.js';
import { isLoggedIn } from '../auth/local.js';

const sync = useSyncStore();
const router = useRouter();

const hhmm = (ts) =>
  new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

const label = computed(() => {
  if (!isLoggedIn()) return '未连接';
  if (sync.status === 'syncing') return '同步中';
  if (sync.status === 'error') return '同步失败';
  if (sync.status === 'ok' && sync.lastSyncAt) return `已同步 ${hhmm(sync.lastSyncAt)}`;
  if (sync.status === 'ok') return '已同步';
  return '待同步';
});

function onClick() {
  if (!isLoggedIn()) {
    router.push('/settings');
    return;
  }
  sync.syncManual().then((ok) => {
    showToast(ok ? `已同步 ${hhmm(Date.now())}` : `同步失败：${sync.error || '稍后自动重试'}`);
  });
}
</script>

<template>
  <span class="sync-dot" :class="sync.status" @click="onClick">
    <i class="led"></i>{{ label }}
  </span>
</template>
