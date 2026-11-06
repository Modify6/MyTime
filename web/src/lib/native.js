import { watch } from 'vue';
// 原生桥（Capacitor APK 内可用；纯网页 / PWA 下返回 null，所有调用点需容错）
export const isNative = typeof window !== 'undefined' && !!window.Capacitor;
export const isNativeApp = isNative; // 别名：设置页等处语义更直白

export function nativeTimer() {
  if (!isNative) return null;
  const plugins = window.Capacitor.Plugins || {};
  return plugins.TimerNative || null;
}

export function nativeReminder() {
  if (!isNative) return null;
  const plugins = window.Capacitor.Plugins || {};
  return plugins.ReminderNative || null;
}

// 原生读取系统栏高度注入 CSS 变量（APK 全程 edge-to-edge，env() 在 WebView 内恒为 0）
export function applyNativeSafeArea() {
  if (!isNative) return;
  window.Capacitor?.Plugins?.TimerNative?.getSafeArea?.()?.then?.((r) => {
    const top = Math.max(0, Math.round(r?.top || 0));
    const bottom = Math.max(0, Math.round(r?.bottom || 0));
    const rootStyle = document.documentElement.style;
    if (top > 0) rootStyle.setProperty('--safe-top', top + 'px');
    if (bottom > 0) rootStyle.setProperty('--safe-bottom', bottom + 'px');
  });
}

// 通知权限状态（诊断看不到计时通知）
export async function notificationsEnabled() {
  if (!isNative) return true;
  try {
    const r = await window.Capacitor?.Plugins?.TimerNative?.notificationsEnabled?.();
    return r?.enabled !== false;
  } catch {
    return true;
  }
}

// 请求通知权限（Android 13+）
export function ensureNotificationPermission() {
  if (!isNative) return;
  window.Capacitor?.Plugins?.TimerNative?.ensureNotificationPermission?.();
}

// 打开系统应用详情页（通知/自启动/后台弹出 权限入口）
export function openAppSettings() {
  if (!isNative) return;
  window.Capacitor?.Plugins?.TimerNative?.openAppSettings?.();
}

// —— 安卓返回手势关弹层 ——
// 原理：弹层打开时 pushState 入栈并注册关闭回调；返回手势触发 popstate 时关闭栈顶弹层
const backStack = [];
if (isNative) {
  window.addEventListener('popstate', () => {
    const top = backStack.pop();
    if (top) top();
  });
}
export function bindBackClose(showRef, close) {
  if (!isNative) return;
  watch(showRef, (v) => {
    if (v) {
      history.pushState({ mytimePopup: backStack.length + 1 }, '');
      backStack.push(close);
    } else if (history.state?.mytimePopup === backStack.length) {
      // 保存/删除等主动关闭：顺手退掉弹层推入的历史记录
      backStack.pop();
      history.back();
    }
  });
}
