// 生成 PWA 图标（输出到 web/public/）
// 用法：npm run icons
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG, renderIcon } from './pnglib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'web', 'public');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  ['pwa-192.png', 192, 'rounded'],
  ['pwa-512.png', 512, 'rounded'],
  ['pwa-maskable-512.png', 512, 'maskable'],
  ['apple-touch-icon.png', 180, 'maskable'], // iOS 自动裁圆角，用全出血背景
];
for (const [name, size, style] of targets) {
  fs.writeFileSync(path.join(outDir, name), encodePNG(size, size, renderIcon(size, style)));
  console.log('生成', name);
}
console.log('完成 ->', outDir);
