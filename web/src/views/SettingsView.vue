<script setup>
// 设置页：多设备同步配置、分类管理、数据导出/导入
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import { useAuthStore } from '../stores/auth.js';
import { useSyncStore } from '../stores/sync.js';
import { useCatalogStore } from '../stores/catalog.js';
import { db } from '../db/schema.js';
import { adoptRow } from '../db/repo.js';
import { uuid } from '../lib/util.js';
import { getLogs, logsToText, clearLogs, APP_VERSION } from '../lib/logger.js';
import dayjs from 'dayjs';

const auth = useAuthStore();
const sync = useSyncStore();
const catalog = useCatalogStore();

const serverUrl = ref(auth.serverUrl);
const password = ref('');
const loggingIn = ref(false);

async function login() {
  if (loggingIn.value) return;
  loggingIn.value = true;
  try {
    await auth.testConnection(serverUrl.value); // 先验证可达性，密码错误会有更明确提示
    await auth.login(serverUrl.value, password.value);
    showToast('已连接，开始同步');
    password.value = '';
    sync.setup();
  } catch (e) {
    showToast(e.message || '连接失败');
  } finally {
    loggingIn.value = false;
  }
}

async function syncManual() {
  const ok = await sync.syncManual();
  showToast(ok ? '同步完成' : sync.error || '同步失败');
}

async function logout() {
  await showConfirmDialog({ title: '断开同步？', message: '本地数据不受影响，之后可重新连接。' });
  auth.logout();
  showToast('已断开');
}

// —— 分类管理 ——
const showCatForm = ref(false);
const catForm = ref({});
const PALETTE = ['#4f6ef7', '#7c4dff', '#00acc1', '#43a047', '#f0a800', '#ff7043', '#ec407a', '#8d6e63', '#90a4ae'];

function addCat() {
  catForm.value = { id: uuid(), name: '', color: PALETTE[catalog.sortedCategories.length % PALETTE.length], sort: catalog.sortedCategories.length, createdAt: Date.now() };
  showCatForm.value = true;
}
function editCat(c) {
  catForm.value = { ...c };
  showCatForm.value = true;
}
async function saveCat() {
  if (!(catForm.value.name || '').trim()) return showToast('请填写分类名称');
  await catalog.saveCategory({ ...catForm.value, name: catForm.value.name.trim() });
  showCatForm.value = false;
  showToast('已保存');
}
async function removeCat(c) {
  await showConfirmDialog({ title: `删除分类"${c.name}"？`, message: '已有事件会保留，统计中显示为"未分类"。' });
  await catalog.removeCategory(c.id);
  showToast('已删除');
}
async function moveCat(c, dir) {
  const list = catalog.sortedCategories;
  const i = list.findIndex((x) => x.id === c.id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const other = list[j];
  await catalog.saveCategory({ ...c, sort: j });
  await catalog.saveCategory({ ...other, sort: i });
}

// —— 导出 / 导入 ——
async function exportData() {
  const data = { version: 1, exportedAt: Date.now() };
  for (const t of ['categories', 'goals', 'events']) data[t] = await db[t].toArray();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mytime-backup-${dayjs().format('YYYYMMDD-HHmmss')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('已导出');
}

const importing = ref(false);
async function importData(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  importing.value = true;
  try {
    const data = JSON.parse(await file.text());
    let n = 0;
    for (const t of ['categories', 'goals', 'events']) {
      for (const row of data[t] || []) {
        if (await adoptRow(t, row, { push: true })) n++;
      }
    }
    await catalog.load();
    sync.trigger();
    showToast(n ? `已导入 ${n} 条记录` : '没有需要导入的新数据');
  } catch {
    showToast('导入失败：文件格式不正确');
  } finally {
    importing.value = false;
  }
}

const lastSyncLabel = computed(() =>
  sync.lastSyncAt ? dayjs(sync.lastSyncAt).format('HH:mm:ss') : '—'
);
const statusLabel = computed(() => {
  if (!auth.hasToken) return '未连接';
  if (sync.status === 'error') return `失败：${sync.error}`;
  if (sync.status === 'syncing') return '同步中…';
  if (sync.status === 'ok') return '正常';
  return '待同步';
});

// —— 安装到手机 ——
const isNativeApp = typeof window !== 'undefined' && !!window.Capacitor;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
const isAndroid = /android/i.test(navigator.userAgent || '');

// —— 运行日志 ——
const logs = ref([]);
let logTimer = null;

async function loadLogs() {
  logs.value = await getLogs(200);
}

function logLine(l) {
  return `[${dayjs(l.time).format('MM-DD HH:mm:ss')}] ${l.tag} · ${l.msg}`;
}

async function copyLogs() {
  try {
    await navigator.clipboard.writeText(await logsToText(200));
    showToast('日志已复制，可粘贴发给我排查');
  } catch {
    showToast('复制失败，请用"导出"');
  }
}

function exportLogs() {
  logsToText(500).then((text) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mytime-log-${dayjs().format('YYYYMMDD-HHmmss')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

async function doClear() {
  await showConfirmDialog({ title: '清空运行日志？' });
  await clearLogs();
  await loadLogs();
  showToast('已清空');
}

onMounted(() => {
  if (auth.hasToken) sync.setup();
  loadLogs();
  logTimer = setInterval(loadLogs, 10_000);
});
onUnmounted(() => clearInterval(logTimer));
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>设置</h1></div>

    <!-- 同步 -->
    <div class="card">
      <div class="section-title" style="margin-top: 0">多设备同步</div>
      <template v-if="!auth.hasToken">
        <van-field v-model="serverUrl" label="服务器" placeholder="留空 = 本机服务（同源）" clearable />
        <van-field v-model="password" label="密码" type="password" placeholder="服务端访问密码" />
        <div class="btn-row">
          <van-button type="primary" round block :loading="loggingIn" @click="login">连接并同步</van-button>
        </div>
        <div class="muted" style="margin-top: 10px">
          手机和电脑连同一个 Wi-Fi，服务器一栏填电脑地址（如 http://192.168.1.5:3128）即可多端同步。
        </div>
      </template>
      <template v-else>
        <div class="sync-line"><span class="muted">服务器</span><span>{{ auth.serverUrl || '本机服务' }}</span></div>
        <div class="sync-line"><span class="muted">状态</span><span>{{ statusLabel }}</span></div>
        <div class="sync-line"><span class="muted">上次同步</span><span>{{ lastSyncLabel }}</span></div>
        <div class="btn-row">
          <van-button round block plain type="primary" @click="syncManual">立即同步</van-button>
          <van-button round block plain @click="logout">断开</van-button>
        </div>
      </template>
    </div>

    <!-- 安装到手机 -->
    <div class="card">
      <div class="section-title" style="margin-top: 0">安装到手机</div>
      <template v-if="isNativeApp">
        <div class="guide-ok">✓ 当前已作为 App 运行，无需再安装</div>
      </template>
      <template v-else>
        <template v-if="isIOS">
          <div class="guide-step"><b>iPhone / iPad（用 Safari）</b></div>
          <div class="guide-step">1. 在 Safari 输入电脑显示的局域网地址（如 http://192.168.1.5:3128）</div>
          <div class="guide-step">2. 点底部中间的「分享」按钮</div>
          <div class="guide-step">3. 下滑选择「添加到主屏幕」→「添加」</div>
          <div class="guide-step">4. 桌面出现图标，打开即全屏运行，数据存在手机本地</div>
        </template>
        <template v-else-if="isAndroid">
          <div class="guide-step"><b>安卓（两种方式）</b></div>
          <div class="guide-step">① 安装 APK：电脑双击 apk.bat 打包出 MyTime.apk，传到手机直接安装（推荐）</div>
          <div class="guide-step">② PWA：Chrome 打开局域网地址 → 右上角 ⋮ → 「添加到主屏幕」</div>
          <div class="guide-step">装好后打开 App，在本页填电脑地址与密码即可同步</div>
        </template>
        <template v-else>
          <div class="guide-step">在手机浏览器访问电脑显示的局域网地址；安卓推荐用电脑上的 apk.bat 打包 APK 安装，iPhone 用 Safari「添加到主屏幕」。</div>
        </template>
      </template>
      <div class="muted" style="margin-top: 8px">
        要求手机与电脑同一 Wi-Fi。电脑关机时手机照常打卡（数据存本地），开机后自动补同步。
      </div>
    </div>

    <!-- 分类管理 -->
    <div class="card">
      <div class="section-title" style="margin-top: 0">
        <span>分类管理</span>
        <van-button size="small" plain round icon="plus" @click="addCat">新增</van-button>
      </div>
      <div v-for="(c, i) in catalog.sortedCategories" :key="c.id" class="cat-line">
        <span class="chip" :style="{ '--c': c.color }"><i class="dot"></i>{{ c.name }}</span>
        <span class="cat-ops">
          <van-icon name="arrow-up" @click="moveCat(c, -1)" />
          <van-icon name="arrow-down" @click="moveCat(c, 1)" />
          <van-icon name="edit" @click="editCat(c)" />
          <van-icon name="delete-o" @click="removeCat(c)" />
        </span>
      </div>
    </div>

    <!-- 数据 -->
    <div class="card">
      <div class="section-title" style="margin-top: 0">数据备份</div>
      <div class="btn-row">
        <van-button round block plain type="primary" @click="exportData">导出 JSON</van-button>
        <van-button round block plain :loading="importing" @click="$refs.file.click()">导入 JSON</van-button>
        <input ref="file" type="file" accept="application/json,.json" style="display: none" @change="importData" />
      </div>
      <div class="muted" style="margin-top: 8px">导出包含全部数据（含已删除记录的墓碑，用于多端同步一致性）。</div>
    </div>

    <!-- 运行日志 -->
    <div class="card">
      <div class="section-title" style="margin-top: 0">
        <span>运行日志 v{{ APP_VERSION }}</span>
        <div style="display: flex; gap: 6px">
          <van-button size="small" plain round @click="copyLogs">复制</van-button>
          <van-button size="small" plain round @click="exportLogs">导出</van-button>
          <van-button size="small" plain round type="danger" @click="doClear">清空</van-button>
        </div>
      </div>
      <div class="log-list">
        <div v-for="l in logs" :key="l.seq" class="log-line" :class="l.level">{{ logLine(l) }}</div>
        <div v-if="!logs.length" class="empty-tip" style="padding: 12px 0">暂无日志</div>
      </div>
      <div class="muted" style="margin-top: 6px">自动记录启动 / 同步 / 打卡 / 原生通知与报错，保留最近 500 条。App 出问题时把日志复制发给开发者。</div>
    </div>

    <!-- 关于 -->
    <div class="card">
      <div class="section-title" style="margin-top: 0">关于</div>
      <div class="muted about-text">
        MyTime v{{ APP_VERSION }} · 柳比歇夫时间统计法工具。
        记录每一件事的"纯时间"，日/周/月统计回顾，开始一件事前先看看历史用时 ——
        让统计反馈决策，逐步掌控自己的时间。
      </div>
    </div>

    <!-- 分类表单 -->
    <van-popup
      :show="showCatForm"
      position="bottom"
      round
      :style="{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }"
      @update:show="(v) => (showCatForm = v)"
    >
      <div class="sheet">
        <div class="sheet-title">{{ catForm.createdAt && catalog.categoryMap[catForm.id] ? '编辑分类' : '新增分类' }}</div>
        <van-field v-model="catForm.name" placeholder="分类名称（如：阅读、编程）" clearable />
        <div class="field-label">颜色</div>
        <div class="palette">
          <button
            v-for="c in PALETTE"
            :key="c"
            class="color-dot"
            :class="{ active: catForm.color === c }"
            :style="{ background: c }"
            @click="catForm.color = c"
          ></button>
        </div>
        <van-button type="primary" block round @click="saveCat">保存</van-button>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.guide-ok {
  color: #34c273;
  font-size: 13px;
  font-weight: 600;
}
.guide-step {
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.7;
  margin: 2px 0;
}
.btn-row {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.sync-line {
  display: flex;
  justify-content: space-between;
  padding: 7px 2px;
  font-size: 14px;
  border-bottom: 1px solid var(--line);
}
.sync-line:last-of-type {
  border-bottom: 0;
}
.cat-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 2px;
  border-bottom: 1px solid var(--line);
}
.cat-line:last-child {
  border-bottom: 0;
}
.cat-ops {
  display: flex;
  gap: 16px;
  color: var(--text-3);
  font-size: 16px;
}
.cat-ops .van-icon {
  cursor: pointer;
}
.cat-ops .van-icon:active {
  color: var(--brand);
}
.sheet {
  padding: 18px 16px 8px;
}
.sheet-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 12px;
}
.field-label {
  font-size: 12px;
  color: var(--text-3);
  margin: 14px 2px 8px;
}
.palette {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 2px 2px 6px;
}
.color-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.color-dot.active {
  border-color: var(--text);
  box-shadow: 0 0 0 2px #fff inset;
}
.van-button {
  margin-top: 16px;
}
.about-text {
  line-height: 1.8;
}
.log-list {
  max-height: 240px;
  overflow-y: auto;
  background: #fafbfd;
  border-radius: 8px;
  padding: 8px 10px;
}
.log-line {
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-2);
  font-family: Menlo, Consolas, monospace;
  word-break: break-all;
}
.log-line.error {
  color: var(--danger);
}
.log-line.warn {
  color: #d48806;
}
</style>
