// 向 apk.bat（GBK 编码）插入版本同步调用（latin1 字节级补丁，避免编码损坏）
// 幂等：已插入则跳过
import fs from 'node:fs';

const p = 'E:/study/zi/MyTime/apk.bat';
let t = fs.readFileSync(p, 'latin1');

if (t.includes('sync-version.mjs')) {
  console.log('apk.bat 已包含版本同步调用，跳过');
  process.exit(0);
}

const anchor = 'call gradlew.bat assembleDebug';
if (!t.includes(anchor)) {
  console.error('未找到 gradlew 调用锚点');
  process.exit(1);
}
t = t.replace(anchor, 'call node scripts\\sync-version.mjs\r\n' + anchor);
fs.writeFileSync(p, t, 'latin1');
console.log('apk.bat 已插入版本同步调用');
