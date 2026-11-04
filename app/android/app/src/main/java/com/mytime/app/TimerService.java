package com.mytime.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * 打卡计时前台服务：通知栏/锁屏常驻走秒计时（chronometer），
 * 小米焦点通知 / ColorOS 流体云等系统会自动将其以挖孔胶囊形式呈现。
 */
public class TimerService extends Service {

    public static final String CHANNEL_ID = "mytime_timer";
    public static final String ACTION_STOP = "com.mytime.app.action.STOP_TIMER";
    public static final int NOTIFICATION_ID = 1001;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            // 通知上的"结束打卡"按钮：让 JS 层正常落账
            TimerPlugin.notifyStopRequested();
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent != null ? intent.getStringExtra("title") : null;
        long startAt = intent != null ? intent.getLongExtra("startAt", System.currentTimeMillis())
                : System.currentTimeMillis();
        startForeground(NOTIFICATION_ID, buildNotification(title == null ? "计时中" : title, startAt));
        return START_STICKY;
    }

    private Notification buildNotification(String title, long startAt) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "打卡计时",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("正在进行的打卡计时");
            nm.createNotificationChannel(channel);
        }

        Intent openIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent openPi = PendingIntent.getActivity(this, 0, openIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Intent stopIntent = new Intent(this, TimerService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stopIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setContentTitle(title)
                .setUsesChronometer(true)
                .setWhen(startAt)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openPi)
                .addAction(new NotificationCompat.Action.Builder(0, "结束打卡", stopPi).build());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setCategory(NotificationCompat.CATEGORY_STOPWATCH);
        }
        return builder.build();
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
