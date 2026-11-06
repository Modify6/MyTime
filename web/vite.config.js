import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { VantResolver } from '@vant/auto-import-resolver';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

// 构建时注入版本号，日志与设置页展示（每次发版 bump package.json 的 version）
const APP_VERSION = pkg.version;

export default defineConfig({
  plugins: [
    vue(),
    Components({ resolvers: [VantResolver()] }),
    VitePWA({
      registerType: 'autoUpdate',
      // SW 注册改由 main.js 手动控制（APK 内禁用、网页端启用），这里只负责生成 sw.js 与 manifest
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '柳比歇夫时间账本',
        short_name: 'MyTime',
        description: '柳比歇夫时间统计法工具：打卡记录、分类统计、决策参照',
        lang: 'zh-CN',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5f6fa',
        theme_color: '#4f6ef7',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3128', changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 1500 },
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  test: {
    environment: 'node',
    // 单测只收 tests/ 目录；e2e/*.spec.js 归 Playwright（混入会被 vitest 加载并报 describe 冲突）
    include: ['tests/**/*.test.js'],
  },
});
