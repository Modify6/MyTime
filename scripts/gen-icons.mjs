// 图标资源生成：design/icons/*.svg → Android mipmap 六密度 + PWA 192/512
// 用 Playwright 无头 Chromium 渲染（SVG 矢量无损缩放），主案 I 同时作为 web 默认图标
// 用法：node scripts/gen-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// playwright 装在 web/（E2E 用），根目录脚本从那里解析
const { chromium } = await import(
  pathToFileURL('E:/study/zi/MyTime/web/node_modules/playwright/index.mjs').href
);

const ROOT = 'E:/study/zi/MyTime';
const SRC = path.join(ROOT, 'design/icons');
const IDS = ['g', 'h', 'i', 'j', 'k', 'l'];
const MAIN = 'i'; // PWA/浏览器端固定主案（Android 端可在设置页六案切换）
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const outDirs = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });

async function render(svgPath, size, outPath) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><style>*{margin:0;padding:0}body{width:${size}px;height:${size}px;overflow:hidden}
     svg{display:block;width:${size}px;height:${size}px}</style></head>
     <body>${svg}</body></html>`,
    { waitUntil: 'load' }
  );
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: size, height: size } });
}

// 1) Android mipmap：每案六密度（方形 + 圆形 round 版）
for (const id of IDS) {
  const svgPath = path.join(SRC, id + '.svg');
  const up = 'ic_launcher_' + id;
  for (const [dpi, px] of Object.entries(DENSITIES)) {
    const dir = path.join(ROOT, 'app/android/app/src/main/res/mipmap-' + dpi);
    fs.mkdirSync(dir, { recursive: true });
    await render(svgPath, px, path.join(dir, up + '.png'));
    // round 版：同 SVG 圆形裁剪（Android roundIcon 引用）
    const svg = fs.readFileSync(svgPath, 'utf8');
    await page.setViewportSize({ width: px, height: px });
    await page.setContent(
      `<!doctype html><html><head><style>*{margin:0;padding:0}body{width:${px}px;height:${px}px;overflow:hidden}
       svg{display:block;width:${px}px;height:${px}px;border-radius:50%}</style></head>
       <body>${svg}</body></html>`,
      { waitUntil: 'load' }
    );
    await page.screenshot({ path: path.join(dir, 'ic_launcher_round_' + id + '.png'), clip: { x: 0, y: 0, width: px, height: px } });
  }
  console.log('✓ mipmap ×6 密度:', up + ' (+round)');
}

// 1.5) 默认图标：主案 I → ic_launcher.png / ic_launcher_round.png（Capacitor 原默认引用）
for (const [dpi, px] of Object.entries(DENSITIES)) {
  const dir = path.join(ROOT, 'app/android/app/src/main/res/mipmap-' + dpi);
  fs.copyFileSync(path.join(dir, 'ic_launcher_' + MAIN + '.png'), path.join(dir, 'ic_launcher.png'));
  fs.copyFileSync(path.join(dir, 'ic_launcher_round_' + MAIN + '.png'), path.join(dir, 'ic_launcher_round.png'));
}
console.log('✓ 默认 ic_launcher(+round) ← 主案 ' + MAIN.toUpperCase());

// 2) PWA：主案 I（manifest 引用 pwa-192/pwa-512/pwa-maskable-512）
const mainSvg = path.join(SRC, MAIN + '.svg');
const inner = fs.readFileSync(mainSvg, 'utf8');
const maskable = `<!doctype html><html><head><style>*{margin:0;padding:0}body{width:512px;height:512px;overflow:hidden}
  svg{display:block;width:512px;height:512px}</style></head><body>
  <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#0e1118"/>
    <g transform="translate(51.2,51.2) scale(0.8)">${inner.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
  </svg></body></html>`;
for (const px of [192, 512]) {
  await render(mainSvg, px, path.join(ROOT, 'web/public/pwa-' + px + '.png'));
}
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(maskable, { waitUntil: 'load' });
await page.screenshot({ path: path.join(ROOT, 'web/public/pwa-maskable-512.png'), clip: { x: 0, y: 0, width: 512, height: 512 } });
console.log('✓ PWA pwa-192/pwa-512/pwa-maskable-512（主案 ' + MAIN.toUpperCase() + '）');

// 3) favicon：主案 64px png + 原样 svg
await render(mainSvg, 64, path.join(ROOT, 'web/public/favicon-64.png'));
fs.copyFileSync(mainSvg, path.join(ROOT, 'web/public/favicon.svg'));
console.log('✓ favicon（svg + 64px png）');

await browser.close();
console.log('\n完成。Android 默认图标（ic_launcher.png）如需替换为主案，重跑 --main-mipmap 或手动覆盖。');
