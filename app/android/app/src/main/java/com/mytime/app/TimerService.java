package com.mytime.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

/**
 * 打卡计时前台服务：通知栏/锁屏常驻走秒计时（chronometer），
 * 小米焦点通知 / ColorOS 流体云等系统会自动将其以挖孔胶囊形式呈现。
 * 超过 3 小时未结束会发高优先级提醒（防忘结束毁掉全天统计）。
 */
public class TimerService extends Service {

    public static final String CHANNEL_ID = "mytime_timer";
    public static final String CHANNEL_REMINDER_ID = "mytime_reminder";
    public static final String ACTION_STOP = "com.mytime.app.action.STOP_TIMER";
    public static final int NOTIFICATION_ID = 1001;
    public static final int REMINDER_NOTIFICATION_ID = 1002;
    // 提醒阈值：3 小时
    private static final long REMIND_AFTER_MS = 3L * 3600_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private String currentTitle = "计时中";
    private long currentStartAt;

    private final Runnable remindTask = new Runnable() {
        @Override
        public void run() {
            showForgetReminder();
        }
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel timer = new NotificationChannel(CHANNEL_ID, "打卡计时",
                    NotificationManager.IMPORTANCE_LOW);
            timer.setDescription("正在进行的打卡计时");
            nm.createNotificationChannel(timer);
            NotificationChannel reminder = new NotificationChannel(CHANNEL_REMINDER_ID, "打卡提醒",
                    NotificationManager.IMPORTANCE_HIGH);
            reminder.setDescription("忘记结束打卡等提醒");
            nm.createNotificationChannel(reminder);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            // 通知上的"结束打卡"按钮：让 JS 层正常落账
            TimerPlugin.notifyStopRequested();
            cancelReminder();
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent != null ? intent.getStringExtra("title") : null;
        long startAt = intent != null ? intent.getLongExtra("startAt", System.currentTimeMillis())
                : System.currentTimeMillis();
        currentTitle = title == null ? "计时中" : title;
        currentStartAt = startAt;

        // 新计时开始：清掉上一次的提醒
        cancelReminder();
        startForeground(NOTIFICATION_ID, buildNotification(currentTitle, currentStartAt));

        // 安排"忘记结束"提醒（仅一次）
        handler.removeCallbacks(remindTask);
        handler.postDelayed(remindTask, REMIND_AFTER_MS);
        return START_STICKY;
    }

    private Notification buildNotification(String title, long startAt) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setContentTitle(title)
                .setUsesChronometer(true)
                .setWhen(startAt)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(getOpenPi())
                .addAction(new NotificationCompat.Action.Builder(0, "结束打卡", getStopPi()).build());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setCategory(NotificationCompat.CATEGORY_STOPWATCH);
        }
        return builder.build();
    }

    private void showForgetReminder() {
        long elapsed = System.currentTimeMillis() - currentStartAt;
        long hours = elapsed / 3_600_000L;
        long minutes = (elapsed % 3_600_000L) / 60_000L;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_REMINDER_ID)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setContentTitle("忘记结束打卡了吗？")
                .setContentText("「" + currentTitle + "」已计时 " + hours + " 小时 " + minutes + " 分")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(getOpenPi())
                .addAction(new NotificationCompat.Action.Builder(0, "结束打卡", getStopPi()).build());

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.notify(REMINDER_NOTIFICATION_ID, builder.build());
    }

    private PendingIntent getOpenPi() {
        Intent openIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        return PendingIntent.getActivity(this, 0, openIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private PendingIntent getStopPi() {
        Intent stopIntent = new Intent(this, TimerService.class);
        stopIntent.setAction(ACTION_STOP);
        return PendingIntent.getService(this, 1, stopIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void cancelReminder() {
        handler.removeCallbacks(remindTask);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.cancel(REMINDER_NOTIFICATION_ID);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }
}
