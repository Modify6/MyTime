// 版本贯通：web/package.json 为唯一版本源
// 同步到 app/android/app/build.gradle 的 versionName + versionCode（APK 设置里显示的就是它）
// 用法：node scripts/sync-version.mjs（apk.bat 打包前自动执行）
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('E:/study/zi/MyTime/web/package.json', 'utf8'));
const version = pkg.version; // e.g. "0.2.0"
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`版本号格式异常: ${version}`);
  process.exit(1);
}
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

const gradlePath = 'E:/study/zi/MyTime/app/android/app/build.gradle';
let gradle = fs.readFileSync(gradlePath, 'utf8');
const before = gradle;
gradle = gradle
  .replace(/versionCode \d+/, `versionCode ${versionCode}`)
  .replace(/versionName "[^"]*"/, `versionName "${version}"`);

if (gradle === before) {
  console.log(`版本已同步: v${version} (code ${versionCode})`);
} else {
  fs.writeFileSync(gradlePath, gradle);
  console.log(`版本已写入: versionName ${version} · versionCode ${versionCode}`);
}
// 供 apk.bat 读取，给打包产物命名（MyTime-v<版本>.apk）
fs.writeFileSync('E:/study/zi/MyTime/.apk-version', version);
