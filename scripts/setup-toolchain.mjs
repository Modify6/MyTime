#!/usr/bin/env node
// 工具链自举：缺什么装什么，装进工作文件夹 toolchain/（随整文件夹迁移携带，新机零下载）
//   node setup-toolchain.mjs jdk          —— JDK 21 → <zi>/toolchain/jdk（清华镜像）
//   node setup-toolchain.mjs android-sdk  —— Android SDK → <zi>/toolchain/android-sdk
//   node setup-toolchain.mjs all          —— 上面两个按顺序
// 优先级：工作文件夹已有 → 跳过；本机标准位置（%LOCALAPPDATA%）已有 → 收编（免下载）；
// 都没有 → 下载安装。apk.bat 自动探测 toolchain 路径，无需环境变量。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MIGRATE_VERSION = '1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLCHAIN = path.resolve(ROOT, '..', 'toolchain'); // E:\study\zi\toolchain
const JDK_DIR = path.join(TOOLCHAIN, 'jdk');
const SDK_DIR = path.join(TOOLCHAIN, 'android-sdk');
// 本机标准位置（旧安装）——存在则直接收编，不重新下载
const JDK_LEGACY = path.join(os.homedir(), 'AppData', 'Local', 'MyTime', 'jdk');
const SDK_LEGACY = path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
const MODE = process.argv[2] || 'all';

const die = (m) => { console.error('[错误] ' + m); process.exit(1); };
const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';

async function download(url, destFile) {
  console.log(`下载：${url}`);
  const res = await fetch(url);
  if (!res.ok) die(`下载失败 HTTP ${res.status}（${url}）`);
  const total = Number(res.headers.get('content-length') || 0);
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destFile, buf);
  console.log(`  已下载 ${mb(buf.length)}${total ? ' / ' + mb(total) : ''} → ${destFile}`);
  return destFile;
}

function psExpand(zip, destDir) {
  console.log(`解压 ${path.basename(zip)} → ${destDir}`);
  const r = spawnSync('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${destDir}' -Force`], { stdio: 'inherit', shell: false });
  if (r.status !== 0) die(`解压失败（PowerShell Expand-Archive 退出码 ${r.status}）`);
}

// —— JDK 21（清华 Adoptium 镜像，取最新版）——
async function ensureJdk() {
  if (fs.existsSync(path.join(JDK_DIR, 'bin', 'java.exe'))) {
    console.log('[JDK] 工作文件夹已内置：' + JDK_DIR + '（跳过）');
    return;
  }
  if (fs.existsSync(path.join(JDK_LEGACY, 'bin', 'java.exe'))) {
    console.log('[JDK] 本机标准位置已有安装，收编进工作文件夹（免下载）...');
    fs.cpSync(JDK_LEGACY, JDK_DIR, { recursive: true });
    console.log('[JDK] 收编完成：' + JDK_DIR);
    return;
  }
  console.log('[JDK] 从清华镜像获取 Adoptium JDK 21 ...');
  const listUrl = 'https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/x64/windows/';
  const html = await (await fetch(listUrl)).text();
  const names = [...new Set([...html.matchAll(/OpenJDK21U-jdk_x64_windows_hotspot_[\w.]+\.zip/g)].map((m) => m[0]))].sort();
  if (!names.length) die('清华镜像目录里没找到 JDK 21 的 zip（镜像结构可能变化）');
  const name = names[names.length - 1];
  console.log('  选用：' + name);
  const zip = await download(listUrl + name, path.join(TOOLCHAIN, '_jdk.zip'));
  const extract = path.join(TOOLCHAIN, '_jdk-extract');
  fs.rmSync(extract, { recursive: true, force: true });
  psExpand(zip, extract);
  const inner = fs.readdirSync(extract).find((d) => fs.existsSync(path.join(extract, d, 'bin', 'java.exe')));
  if (!inner) die('解压后未找到 jdk-*/bin/java.exe');
  fs.rmSync(JDK_DIR, { recursive: true, force: true });
  fs.renameSync(path.join(extract, inner), JDK_DIR);
  fs.rmSync(extract, { recursive: true, force: true });
  fs.rmSync(zip, { force: true });
  const v = spawnSync(path.join(JDK_DIR, 'bin', 'java.exe'), ['-version'], { encoding: 'utf8' });
  console.log(`[JDK] 就绪：${JDK_DIR}\n${(v.stderr || v.stdout || '').trim().split('\n')[0]}`);
}

// —— Android SDK（cmdline-tools → 接受许可 → 装 platforms/build-tools/platform-tools）——
async function ensureAndroidSdk() {
  const clt = path.join(SDK_DIR, 'cmdline-tools', 'latest');
  const sdkManager = path.join(clt, 'bin', 'sdkmanager.bat');
  const jdkBin = path.join(JDK_DIR, 'bin');

  if (!fs.existsSync(sdkManager)) {
    if (fs.existsSync(path.join(SDK_LEGACY, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat'))) {
      console.log('[SDK] 本机标准位置已有安装，收编进工作文件夹（免下载）...');
      fs.cpSync(SDK_LEGACY, SDK_DIR, { recursive: true });
    } else {
      console.log('[SDK] 从 dl.google.com 获取 cmdline-tools ...');
      const url = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip';
      const zip = await download(url, path.join(TOOLCHAIN, '_cmdline-tools.zip'));
      const extract = path.join(TOOLCHAIN, '_clt-extract');
      fs.rmSync(extract, { recursive: true, force: true });
      psExpand(zip, extract);
      // zip 内是 cmdline-tools/，需落到 Sdk/cmdline-tools/latest/
      fs.rmSync(path.join(SDK_DIR, 'cmdline-tools'), { recursive: true, force: true });
      fs.mkdirSync(path.join(SDK_DIR, 'cmdline-tools'), { recursive: true });
      fs.renameSync(path.join(extract, 'cmdline-tools'), clt);
      fs.rmSync(extract, { recursive: true, force: true });
      fs.rmSync(zip, { force: true });
    }
  } else console.log('[SDK] cmdline-tools 已存在（跳过下载）');

  if (!fs.existsSync(path.join(JDK_DIR, 'bin', 'java.exe')))
    die('安装 Android SDK 需要 JDK——先运行：node scripts/setup-toolchain.mjs jdk');

  const env = { ...process.env, JAVA_HOME: JDK_DIR, PATH: `${jdkBin};${process.env.PATH || ''}`, ANDROID_HOME: SDK_DIR };
  const run = (args, label) => {
    console.log(`[SDK] ${label} ...`);
    // stdin 管道喂 y（许可确认），stdout/stderr 继承实时显示进度
    const r = spawnSync('cmd.exe', ['/c', sdkManager, ...args], {
      env, stdio: ['pipe', 'inherit', 'inherit'], input: Array(80).fill('y').join('\n') + '\n',
    });
    if (r.status !== 0) die(`${label} 失败（退出码 ${r.status}）`);
  };
  run(['--licenses'], '接受全部 SDK 许可');
  run(['platform-tools', 'platforms;android-35', 'build-tools;35.0.0'], '安装 platform-tools / platforms;android-35 / build-tools;35.0.0');
  if (fs.existsSync(path.join(SDK_DIR, 'platforms', 'android-35')))
    console.log(`[SDK] 就绪：${SDK_DIR}`);
  else die('platforms;android-35 安装后未检测到，请把本输出反馈给开发者');
}

(async () => {
  if (MODE === 'jdk' || MODE === 'all') await ensureJdk();
  if (MODE === 'android-sdk' || MODE === 'all') await ensureAndroidSdk();
  console.log('\n工具链自举完成——可以直接运行 apk.bat 打包了（Gradle 缓存同样收在 toolchain/gradle-home）。');
})().catch((e) => die(String(e).split('\n')[0]));
