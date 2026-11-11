<script setup>
// 设置页：多设备同步配置、分类管理、数据导出/导入
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import { useAuthStore } from '../stores/auth.js';
import { useSyncStore } from '../stores/sync.js';
import { useCatalogStore } from '../stores/catalog.js';
import { db } from '../db/schema.js';
import { adoptRow, getMeta } from '../db/repo.js';
import { tombstoneStats, vacuumTombstones } from '../db/repo.js';
import { uuid } from '../lib/util.js';
import { getLogs, logsToText, clearLogs, APP_VERSION } from '../lib/logger.js';
import { getAutoBackup, setAutoBackup } from '../auth/local.js';
import { api } from '../api/client.js';
import { isNativeApp, nativeReminder, bindBackClose, openAppSettings } from '../lib/native.js';
import { dailyNotifyEnabled, dailyNotifyTime, setDailyNotify } from '../lib/daily-notify.js';
import VersionHistory from '../components/VersionHistory.vue';
import FeatureNote from '../components/FeatureNote.vue';
import dayjs from 'dayjs';

const auth = useAuthStore();
const sync = useSyncStore();
const catalog = useCatalogStore();

// —— 每日提醒（仅 APK 内可用） ——
const remindOn = ref(localStorage.getItem('mytime.remindOn') === '1');
const remindTime = ref(localStorage.getItem('mytime.remindTime') || '09:00');

function applyRemind(on, time) {
  const rn = nativeReminder();
  if (!rn) return;
  const [h, m] = time.split(':').map(Number);
  rn.setDaily({ hour: h, minute: m, enabled: on });
}

function toggleRemind(v) {
  remindOn.value = v;
  localStorage.setItem('mytime.remindOn', v ? '1' : '0');
  applyRemind(v, remindTime.value);
  showToast(v ? `每天 ${remindTime.value} 提醒你打卡` : '已关闭每日提醒');
}

function onRemindTime(e) {
  const v = e.target.value || '09:00';
  remindTime.value = v;
  localStorage.setItem('mytime.remindTime', v);
  if (remindOn.value) {
    applyRemind(true, v);
    showToast(`已改为每天 ${v} 提醒`);
  }
}

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
const showVersionHistory = ref(false); // 版本迭代史弹层
const catForm = ref({});
const PALETTE = ['#4f6ef7', '#7c4dff', '#00acc1', '#43a047', '#f0a800', '#ff7043', '#ec407a', '#8d6e63', '#90a4ae'];

bindBackClose(showCatForm, () => (showCatForm.value = false));
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
  const budget = catForm.value.budgetHours === '' || catForm.value.budgetHours == null ? null : Number(catForm.value.budgetHours);
  if (budget != null && (!Number.isFinite(budget) || budget <= 0)) return showToast('预算需为正数');
  await catalog.saveCategory({ ...catForm.value, name: catForm.value.name.trim(), budgetHours: budget });
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

async function exportCsv() {
  const rows = (await getAllEvents()).sort((a, b) => a.startAt - b.startAt);
  await catalog.load();
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [['开始时间', '结束时间', '时长(分钟)', '事项', '分类', '目标', '预估(分钟)', '备注'].join(',')];
  for (const e of rows) {
    lines.push([
      dayjs(e.startAt).format('YYYY-MM-DD HH:mm:ss'),
      e.endAt ? dayjs(e.endAt).format('YYYY-MM-DD HH:mm:ss') : '',
      e.endAt ? Math.round((e.endAt - e.startAt) / 60000) : '',
      esc(e.title),
      esc(catalog.catName(e.categoryId)),
      esc(e.goalId ? catalog.goalName(e.goalId) : ''),
      e.estimateMs ? Math.round(e.estimateMs / 60000) : '',
      esc(e.note),
    ].join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mytime-events-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('已导出 CSV');
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

async function uploadLogs() {
  try {
    const text =
      (await logsToText(500)) +
      `\n设备: ${isNativeApp ? 'APK' : 'Web'} · ${navigator.userAgent.slice(0, 100)}`;
    const res = await api.uploadClientLog(text);
    showToast(`已上传：${res.name}（电脑 server/data/client-logs/ 查看）`);
  } catch (e) {
    showToast(e.message || '上传失败');
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

// —— 服务器快照备份 ——
const autoBackup = ref(getAutoBackup());
const backups = ref([]);
const lastBackupAt = ref(null);
const backingUp = ref(false);

async function loadBackups() {
  if (!auth.hasToken) return;
  try {
    const r = await api.backupList();
    backups.value = (r.backups || []).slice(0, 10);
    lastBackupAt.value = await getMeta('lastBackupAt', null);
  } catch {
    // 服务器不可达时静默，列表保持上次状态
  }
}

function toggleAutoBackup(v) {
  setAutoBackup(v);
  autoBackup.value = v;
  showToast(v ? '已开启自动每日备份' : '已关闭自动备份');
}

async function backupNow() {
  backingUp.value = true;
  try {
    const res = await api.serverBackup();
    await setMeta('lastBackupAt', Date.now());
    showToast(`已备份：${res.name}`);
    await loadBackups();
  } catch (e) {
    showToast(e.message || '备份失败');
  } finally {
    backingUp.value = false;
  }
}

// —— 数据维护：软删墓碑统计与清理 ——
const tombs = ref(null);
const vacuuming = ref(false);
async function loadTombs() {
  tombs.value = await tombstoneStats();
}
async function doVacuum() {
  await showConfirmDialog({
    title: '清理已删除记录？',
    message: '仅清理 90 天前的软删墓碑（各设备早已同步一致）。保留近期墓碑以防多端回填。',
  });
  vacuuming.value = true;
  try {
    const n = await vacuumTombstones();
    showToast(n ? `已清理 ${n} 条墓碑` : '没有可清理的墓碑');
    await loadTombs();
    sync.trigger(); // 清理后对账一次，保持游标一致
  } catch (e) {
    showToast(e?.message || '清理失败');
  } finally {
    vacuuming.value = false;
  }
}

async function downloadBackup(b) {
  try {
    const blob = await api.backupDownload(b.name);
    // APK 内 <a download> 不生效：写入缓存后走系统分享（用户可选保存到任何位置）
    if (isNative) {
      const Filesystem = window.Capacitor?.Plugins?.Filesystem;
      const Share = window.Capacitor?.Plugins?.Share;
      if (!Filesystem || !Share) return showToast('请升级 APK 后使用');
      const data = await blobToBase64(blob);
      const file = await Filesystem.writeFile({
        path: b.name,
        data,
        directory: 'CACHE', // Directory.Cache 的枚举值
      });
      await Share.share({ title: b.name, url: file.uri, dialogTitle: '保存快照' });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = b.name;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    showToast(e.message || '下载失败');
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// —— 每日结算提醒 ——
const dailyNotify = ref(dailyNotifyEnabled());
const dailyNotifyAt = ref(dailyNotifyTime());
const notifySaving = ref(false);
async function toggleDailyNotify(v) {
  notifySaving.value = true;
  try {
    await setDailyNotify(v, dailyNotifyAt.value);
    dailyNotify.value = v;
    showToast(v ? `每天 ${dailyNotifyAt.value} 提醒结算` : '已关闭结算提醒');
  } catch (e) {
    showToast(e.message || '设置失败');
  } finally {
    notifySaving.value = false;
  }
}
async function changeNotifyTime() {
  if (!dailyNotify.value) return;
  try {
    await setDailyNotify(true, dailyNotifyAt.value);
    showToast(`已改为每天 ${dailyNotifyAt.value}`);
  } catch (e) {
    showToast(e.message || '设置失败');
  }
}

onMounted(() => {
  if (auth.hasToken) sync.setup();
  loadLogs();
  loadBackups();
  loadTombs();
  logTimer = setInterval(loadLogs, 10_000);
});
onUnmounted(() => clearInterval(logTimer));
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>设置</h1><FeatureNote k="settings" /></div>

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

    <!-- 每日提醒（仅 APK 内可用） -->
    <div class="card" v-if="isNativeApp">
      <div class="section-title" style="margin-top: 0">每日提醒</div>
      <div class="backup-line">
        <span>到点提醒我记录</span>
        <van-switch :model-value="remindOn" size="20px" @update:model-value="toggleRemind" />
      </div>
      <div class="backup-line" v-if="remindOn">
        <span>提醒时间</span>
        <input type="time" class="time-input" :value="remindTime" @change="onRemindTime" />
      </div>
      <div class="muted">到点后弹通知提醒（误差几分钟内属正常）。</div>
      <div style="margin-top: 8px">
        <van-button size="small" round plain @click="openAppSettings">通知与自启动设置</van-button>
      </div>
    </div>

    <!-- 每日结算提醒（仅 APK 内可用）：柳比歇夫法核心习惯——逐日结算 -->
    <div class="card" v-if="isNativeApp">
      <div class="section-title" style="margin-top: 0">每日结算提醒</div>
      <div class="backup-line">
        <span>到点看今日小结</span>
        <van-switch :model-value="dailyNotify" :loading="notifySaving" size="20px" @update:model-value="toggleDailyNotify" />
      </div>
      <div class="backup-line" v-if="dailyNotify">
        <span>结算时间</span>
        <input type="time" class="time-input" :value="dailyNotifyAt" @change="(e) => ((dailyNotifyAt = e.target.value || '21:30'), changeNotifyTime())" />
      </div>
      <div class="muted">固定时间弹「今日结算」通知，点开直达统计页。记录一天的时间去向，才是柳比歇夫法本身。</div>
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
        <van-button round block plain @click="exportCsv">导出 CSV</van-button>
        <van-button round block plain :loading="importing" @click="$refs.file.click()">导入 JSON</van-button>
        <input ref="file" type="file" accept="application/json,.json" style="display: none" @change="importData" />
      </div>
      <div class="hint" style="margin-top: 8px">导出包含全部数据（含已删除记录的<b>墓碑</b>，用于多端同步一致性）。</div>

      <template v-if="auth.hasToken">
        <div class="backup-line">
          <span>自动每日快照<span class="muted">（存于服务器，保留 30 份）</span></span>
          <van-switch :model-value="autoBackup" size="20px" @update:model-value="toggleAutoBackup" />
        </div>
        <div class="sync-line">
          <span class="muted">上次快照</span>
          <span>{{ lastBackupAt ? dayjs(lastBackupAt).format('MM-DD HH:mm') : '—' }}</span>
        </div>
        <van-button size="small" round plain type="primary" :loading="backingUp" @click="backupNow">立即备份快照</van-button>
        <div v-if="backups.length" class="backup-list">
          <div v-for="b in backups" :key="b.name" class="backup-item" @click="downloadBackup(b)">
            <span>{{ b.name }}</span>
            <span class="muted">{{ Math.round(b.size / 1024) }}KB</span>
          </div>
          <div class="muted" style="padding: 3px 0 0">点击文件名可下载</div>
        </div>
      </template>
      <div v-else class="hint" style="margin-top: 8px">连接同步服务器后，可开启「<b>自动每日快照</b>」——服务器每天留存一份数据副本（保留 30 份）。</div>
    </div>

    <!-- 数据维护：软删墓碑（本地库健康） -->
    <div class="card">
      <div class="section-title" style="margin-top: 0">数据维护</div>
      <div class="hint" style="margin-bottom: 8px">
        删除采用墓碑式（多端一致），长期堆积会拖慢同步。<b>清理仅针对 90 天前的墓碑</b>，近期删除记录保留以防多端回填。
      </div>
      <div class="sync-line">
        <span class="muted">本地墓碑</span>
        <span>{{ tombs ? `${tombs.total} 条` : '…' }}</span>
      </div>
      <div class="hint" v-if="tombs && tombs.total" style="margin: 2px 0 8px">
        <span v-for="(n, t) in tombs.byTable" :key="t" style="margin-right: 10px">{{ t }} {{ n }}</span>
      </div>
      <van-button size="small" round plain :loading="vacuuming" @click="doVacuum">清理 90 天前的已删记录</van-button>
    </div>

    <!-- 运行日志 -->
    <div class="card">
      <div class="section-title" style="margin-top: 0">
        <span>运行日志 v{{ APP_VERSION }}</span>
        <div style="display: flex; gap: 6px">
          <van-button size="small" plain round @click="copyLogs">复制</van-button>
          <van-button v-if="auth.hasToken" size="small" plain round type="primary" @click="uploadLogs">上传</van-button>
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
      <div class="about-row" @click="showVersionHistory = true">
        <span>版本迭代</span>
        <span class="about-link">v{{ APP_VERSION }} ›</span>
      </div>
    </div>

    <VersionHistory v-model:show="showVersionHistory" />

    <!-- 分类表单 -->
    <van-popup
      :show="showCatForm"
      position="bottom"
      round
      class="popup-safe"
      @update:show="(v) => (showCatForm = v)"
    >
      <div class="sheet">
        <div class="sheet-title">{{ catForm.createdAt && catalog.categoryMap[catForm.id] ? '编辑分类' : '新增分类' }}</div>
        <van-field v-model="catForm.name" placeholder="分类名称（如：阅读、编程）" clearable />
        <van-field
          v-model="catForm.budgetHours"
          type="number"
          placeholder="每周预算上限（小时，选填，超出会警示）"
        />
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
  box-shadow: 0 0 0 2px var(--card) inset;
}
.van-button {
  margin-top: 16px;
}
.about-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  font-size: 13px;
  cursor: pointer;
}
.about-row:active {
  opacity: 0.7;
}
.about-link {
  color: var(--brand);
  font-size: 12px;
}
.about-text {
  line-height: 1.8;
}
.log-list {
  max-height: 240px;
  overflow-y: auto;
  background: var(--card-2);
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
.time-input {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px 8px;
  background: var(--card-2);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
}
.backup-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0 4px;
  font-size: 13.5px;
}
.backup-list {
  margin-top: 8px;
  max-height: 150px;
  overflow-y: auto;
  background: var(--card-2);
  border-radius: 8px;
  padding: 4px 10px;
}
.backup-item {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
  border-bottom: 1px solid var(--line);
}
.backup-item:last-of-type {
  border-bottom: 0;
}
</style>
