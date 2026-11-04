// 原生桥（Capacitor APK 内可用；纯网页 / PWA 下返回 null，所有调用点需容错）
export const isNative = typeof window !== 'undefined' && !!window.Capacitor;

export function nativeTimer() {
  if (!isNative) return null;
  const plugins = window.Capacitor.Plugins || {};
  return plugins.TimerNative || null;
}
