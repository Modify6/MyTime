import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router.js';
import { initLogger } from './lib/logger.js';
import { isNative, applyNativeSafeArea } from './lib/native.js';
import './styles/main.css';
// 函数式组件的样式需手动引入（模板组件由 unplugin-vue-components 自动按需引入）
import 'vant/es/toast/style';
import 'vant/es/dialog/style';

// 安卓 APK：禁用 PWA Service Worker（资源随 APK 分发，旧 SW 缓存会导致资源陈旧、
// 路由懒加载 chunk 拿不到），并清理历史注册的 SW
if (typeof window !== 'undefined' && window.Capacitor) {
  applyNativeSafeArea();
  navigator.serviceWorker?.getRegistrations?.()?.then?.((rs) => rs.forEach((r) => r.unregister()));
} else {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

// 深色模式跟随系统：页面配色走 CSS 变量，Vant 用根类 van-theme-dark 切换
const applyTheme = () => {
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('van-theme-dark', !!dark);
};
applyTheme();
window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', applyTheme);

initLogger();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
