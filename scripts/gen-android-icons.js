// 生成安卓启动图标（输出到 app/android/.../res）
// 常规 mipmap + 自适应图标（渐变背景层 + 白色时钟前景层）
// 用法：node scripts/gen-android-icons.js（需已执行 cap add android）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG, renderIcon } from './pnglib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const res = path.join(__dirname, '..', 'app', 'android', 'app', 'src', 'main', 'res');
if (!fs.existsSync(path.join(res, 'mipmap-anydpi-v26'))) {
  console.error('未找到安卓工程，请先在 app/ 下执行: npx cap add android');
  process.exit(1);
}

// 密度 -> 缩放（启动器图标 48dp，自适应层 108dp）
const DENSITIES = {
  'mipmap-mdpi': 1,
  'mipmap-hdpi': 1.5,
  'mipmap-xhdpi': 2,
  'mipmap-xxhdpi': 3,
  'mipmap-xxxhdpi': 4,
};

for (const [dir, scale] of Object.entries(DENSITIES)) {
  const d = path.join(res, dir);
  fs.mkdirSync(d, { recursive: true });
  const launcher = Math.round(48 * scale);
  const layer = Math.round(108 * scale);
  fs.writeFileSync(path.join(d, 'ic_launcher.png'), encodePNG(launcher, launcher, renderIcon(launcher, 'rounded')));
  fs.writeFileSync(path.join(d, 'ic_launcher_round.png'), encodePNG(launcher, launcher, renderIcon(launcher, 'rounded')));
  fs.writeFileSync(path.join(d, 'ic_launcher_foreground.png'), encodePNG(layer, layer, renderIcon(layer, 'foreground')));
  fs.writeFileSync(path.join(d, 'ic_launcher_background.png'), encodePNG(layer, layer, renderIcon(layer, 'gradient')));
  console.log(`生成 ${dir}: ic_launcher ${launcher}px, layers ${layer}px`);
}

// 自适应图标 XML：背景/前景指向 PNG 层
const anydpi = path.join(res, 'mipmap-anydpi-v26');
fs.mkdirSync(anydpi, { recursive: true });
const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), xml);
fs.writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), xml);
console.log('自适应图标 XML 已更新');
console.log('完成 ->', res);
