// 向 apk.bat（GBK 编码）插入带版本号的产物命名（latin1 字节级补丁，幂等）
import fs from 'node:fs';

const p = 'E:/study/zi/MyTime/apk.bat';
let t = fs.readFileSync(p, 'latin1');

if (t.includes('MyTime-v%APK_VER%.apk')) {
  console.log('apk.bat 已支持版本号命名，跳过');
  process.exit(0);
}

const anchor = 'copy /y "app\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk" "MyTime.apk" >nul';
if (!t.includes(anchor)) {
  console.error('未找到产物复制锚点');
  process.exit(1);
}
const replacement =
  'set /p APK_VER=<.apk-version\r\n' +
  'copy /y "app\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk" "MyTime-v%APK_VER%.apk" >nul\r\n' +
  'copy /y "app\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk" "MyTime.apk" >nul';
t = t.replace(anchor, replacement);
fs.writeFileSync(p, t, 'latin1');
console.log('apk.bat 已改为版本号命名（MyTime-v<版本>.apk + MyTime.apk 别名）');
