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

export const getServerUrl = () => safe.get(K_SERVER) || '';
export const setServerUrl = (v) => (v ? safe.set(K_SERVER, v) : safe.del(K_SERVER));
export const getToken = () => safe.get(K_TOKEN) || '';
export const setToken = (v) => (v ? safe.set(K_TOKEN, v) : safe.del(K_TOKEN));
export const isLoggedIn = () => !!getToken();
