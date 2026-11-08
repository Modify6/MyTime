#!/usr/bin/env node
// APK 打包主逻辑（由纯 ASCII 的 apk.bat 薄壳调用——bat 不再承载任何中文/复杂逻辑，
// 永久规避 GBK 编码三层坑：UTF-8 解析错乱 / 有损转码 / 0x5C 吞换行）
// 流程：工具链定位（toolchain/ → LOCALAPPDATA → 一键自举）→ 环境注入 → 构建 → cap sync → Gradle → 出包
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLCHAIN = path.resolve(ROOT, '..', 'toolchain'); // E:\study\zi\toolchain（随整文件夹迁移携带）
const die = (m) => { console.error('\n[错误] ' + m); process.exit(1); };
const run = (cmd, args, opts = {}) => {
  const label = opts.label || [cmd, ...args].join(' ');
  console.log(`\n>> ${label}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...(opts.env ? { env: opts.env } : {}), ...(opts.cwd ? { cwd: opts.cwd } : {}) });
  if (r.status !== 0) die(`${label} 失败（退出码 ${r.status}）——请把上方完整输出发给开发者`);
  return r;
};

console.log('== MyTime APK 打包 ==\n');

// —— 工具链定位：工作文件夹 toolchain（随迁移携带）→ 本机标准位置（旧安装）→ 自举下载 ——
let TC_JDK = null, TC_SDK = null;
if (fs.existsSync(path.join(TOOLCHAIN, 'jdk', 'bin', 'java.exe'))) TC_JDK = path.join(TOOLCHAIN, 'jdk');
else if (fs.existsSync(path.join(os.homedir(), 'AppData', 'Local', 'MyTime', 'jdk', 'bin', 'java.exe')))
  TC_JDK = path.join(os.homedir(), 'AppData', 'Local', 'MyTime', 'jdk');
if (fs.existsSync(path.join(TOOLCHAIN, 'android-sdk', 'platforms', 'android-35'))) TC_SDK = path.join(TOOLCHAIN, 'android-sdk');
else if (fs.existsSync(path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk', 'platforms', 'android-35')))
  TC_SDK = path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');

if (!TC_JDK) {
  console.log('[工具链] 未检测到 JDK，自动下载安装（清华镜像，约 200MB，一次性，装进 toolchain/）...');
  run(process.execPath, [path.join(ROOT, 'scripts', 'setup-toolchain.mjs'), 'jdk'], { label: '工具链自举 jdk' });
  TC_JDK = path.join(TOOLCHAIN, 'jdk');
}
if (!TC_SDK) {
  console.log('[工具链] 未检测到 Android SDK，自动下载安装（约 600MB，一次性，装进 toolchain/）...');
  run(process.execPath, [path.join(ROOT, 'scripts', 'setup-toolchain.mjs'), 'android-sdk'], { label: '工具链自举 android-sdk' });
  TC_SDK = path.join(TOOLCHAIN, 'android-sdk');
}
if (!fs.existsSync(path.join(TC_JDK, 'bin', 'java.exe'))) die(`JDK 自举后仍找不到 java.exe（${TC_JDK}）`);
if (!fs.existsSync(path.join(TC_SDK, 'platforms', 'android-35'))) die(`SDK 自举后仍找不到 platforms/android-35（${TC_SDK}）`);

// —— 环境注入：Java / SDK / Gradle 缓存全部收在工作文件夹 toolchain 内 ——
const env = {
  ...process.env,
  JAVA_HOME: TC_JDK,
  PATH: `${TC_JDK}\\bin;${process.env.PATH || ''}`,
  ANDROID_HOME: TC_SDK,
  GRADLE_USER_HOME: path.join(TOOLCHAIN, 'gradle-home'),
};
console.log(`[工具链] JDK=${TC_JDK}`);
console.log(`[工具链] SDK=${TC_SDK}`);
console.log(`[工具链] Gradle缓存=${env.GRADLE_USER_HOME}`);

// —— 首次运行安装壳工程依赖 ——
if (!fs.existsSync(path.join(ROOT, 'app', 'node_modules'))) {
  console.log('\n首次运行：安装 Capacitor 依赖...');
  run('cmd.exe', ['/c', 'npm', 'install', '--prefix', 'app', '--no-audit', '--no-fund'], { label: 'npm install (app)' });
}

// —— 1. 构建前端 ——
run('cmd.exe', ['/c', 'npm', '--prefix', 'web', 'run', 'build'], { cwd: ROOT, label: 'npm --prefix web run build' });

// —— 2. 同步到安卓工程 ——
run('cmd.exe', ['/c', 'npx', 'cap', 'sync', 'android'], { cwd: path.join(ROOT, 'app'), label: 'npx cap sync android' });

// —— 3. 版本贯通 + Gradle 打包 ——
run(process.execPath, [path.join(ROOT, 'scripts', 'sync-version.mjs')], { label: '版本贯通' });
const androidDir = path.join(ROOT, 'app', 'android');
run('cmd.exe', ['/c', 'gradlew.bat', 'assembleDebug'], { cwd: androidDir, env, label: 'gradlew assembleDebug' });

// —— 4. 出包到项目根目录 ——
const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'package.json'), 'utf8')).version;
const apkSrc = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!fs.existsSync(apkSrc)) die(`打包完成但未找到产物：${apkSrc}`);
fs.copyFileSync(apkSrc, path.join(ROOT, `MyTime-v${ver}.apk`));
fs.copyFileSync(apkSrc, path.join(ROOT, 'MyTime.apk'));
console.log(`\n== 完成！== MyTime-v${ver}.apk 已输出到项目根目录（${(fs.statSync(apkSrc).size / 1024 / 1024).toFixed(1)} MB）`);
console.log('传到安卓手机直接安装（需允许"安装未知应用"），打开后在设置里填电脑地址与密码即可同步。');
