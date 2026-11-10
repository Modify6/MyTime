// 每日结算提醒：固定时间本地通知（APK 内可用；纯网页隐藏入口）
// 柳比歇夫法的核心习惯是"逐日结算"——到点提醒看一眼今天的时间去向
import { isNative } from './native.js';

const KEY_ENABLED = 'mytime.dailyNotify';
const KEY_TIME = 'mytime.dailyNotifyAt';
const NOTIFY_ID = 1001;

export function dailyNotifyEnabled() {
  return localStorage.getItem(KEY_ENABLED) === '1';
}
export function dailyNotifyTime() {
  return localStorage.getItem(KEY_TIME) || '21:30';
}

async function plugin() {
  if (!isNative) return null;
  return window.Capacitor?.Plugins?.LocalNotifications || null;
}

async function scheduleAt(hhmm) {
  const p = await plugin();
  if (!p) return;
  const [h, m] = hhmm.split(':').map(Number);
  // 权限被拒时抛错给调用方提示
  const perm = await p.checkPermissions();
  if (perm?.display !== 'granted') {
    const req = await p.requestPermissions();
    if (req?.display !== 'granted') throw new Error('通知权限未授予，请在系统设置里允许通知');
  }
  // 固定 id 重复排程：同 id 新程覆盖旧程，改时间无需先取消
  await p.schedule({
    notifications: [
      {
        id: NOTIFY_ID,
        title: '今日结算 📊',
        body: '今天的时间都去哪儿了？点开看今日纯时间与分类分布',
        schedule: { on: { hour: h, minute: m }, repeats: true, allowWhileIdle: true },
      },
    ],
  });
}

export async function setDailyNotify(enabled, hhmm = dailyNotifyTime()) {
  localStorage.setItem(KEY_ENABLED, enabled ? '1' : '0');
  if (hhmm) localStorage.setItem(KEY_TIME, hhmm);
  const p = await plugin();
  if (!p) return;
  if (enabled) {
    await scheduleAt(hhmm);
  } else {
    await p.cancel({ notifications: [{ id: NOTIFY_ID }] });
  }
}

// App 启动时若已开启，重排一次（重启/升级后 schedule 仍在系统侧，但幂等重排最稳）
export async function ensureDailyNotifyRescheduled() {
  if (!isNative || !dailyNotifyEnabled()) return;
  try {
    await scheduleAt(dailyNotifyTime());
  } catch {
    // 权限问题不打扰启动流程
  }
}

// 点通知进统计页（App.vue 启动时注册）
export function onDailyNotifyTap(handler) {
  if (!isNative) return null;
  const p = window.Capacitor?.Plugins?.LocalNotifications;
  return p?.addListener?.('localNotificationActionPerformed', (ev) => {
    if (ev?.notification?.id === NOTIFY_ID) handler();
  }) || null;
}
