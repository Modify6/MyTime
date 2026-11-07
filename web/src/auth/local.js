// 本地配置存储：浏览器用 localStorage，非浏览器环境（单测）自动降级为内存
const mem = new Map();
const safe = {
  get(k) {
    try {
      return globalThis.localStorage?.getItem(k) ?? mem.get(k) ?? null;
    } catch {
      return mem.get(k) ?? null;
    }
  },
  set(k, v) {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {}
    mem.set(k, v);
  },
  del(k) {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {}
    mem.delete(k);
  },
};

const K_SERVER = 'mytime.server';
const K_TOKEN = 'mytime.token';
const K_AUTOBACKUP = 'mytime.autobackup';
const K_LASTSYNC = 'mytime.lastSyncAt';

export const getServerUrl = () => safe.get(K_SERVER) || '';
export const setServerUrl = (v) => (v ? safe.set(K_SERVER, v) : safe.del(K_SERVER));
export const getToken = () => safe.get(K_TOKEN) || '';
export const setToken = (v) => (v ? safe.set(K_TOKEN, v) : safe.del(K_TOKEN));
export const isLoggedIn = () => !!getToken();

// 上次同步成功时间（持久化，供设置页/同步点在刷新后显示）
export const getLastSyncAt = () => Number(safe.get(K_LASTSYNC)) || 0;
export const setLastSyncAt = (v) => safe.set(K_LASTSYNC, String(v));

// 自动每日备份开关（默认开启；显式存 '0' 表示关闭）
export const getAutoBackup = () => safe.get(K_AUTOBACKUP) !== '0';
export const setAutoBackup = (v) => (v ? safe.del(K_AUTOBACKUP) : safe.set(K_AUTOBACKUP, '0'));
