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

// 原生读取系统栏底部高度并注入 CSS 变量（APK 内 env() 恒为 0，需原生补偿）
export function applyNativeSafeArea() {
  if (!isNative) return;
  window.Capacitor?.Plugins?.TimerNative?.getSafeArea?.()?.then?.((r) => {
    const bottom = Math.max(0, Math.round(r?.bottom || 0));
    if (bottom > 0) document.documentElement.style.setProperty('--safe-bottom', bottom + 'px');
  });
}
