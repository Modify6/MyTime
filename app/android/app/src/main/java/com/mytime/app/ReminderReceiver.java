package com.mytime.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/** 每日提醒闹钟触发：弹通知 + 自动排明天；开机后按偏好恢复调度 */
public class ReminderReceiver extends BroadcastReceiver {

    public static final String ACTION_FIRE = "com.mytime.app.action.DAILY_REMIND_FIRE";
    public static final String CHANNEL_ID = "mytime_daily";
    public static final int NOTIFICATION_ID = 3001;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            if (ReminderScheduler.isEnabled(context)) {
                ReminderScheduler.scheduleNext(context);
            }
            return;
        }

        showNotification(context);
        // 自动排明天
        ReminderScheduler.scheduleNext(context);
    }

    private void showNotification(Context context) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "每日提醒",
                    NotificationManager.IMPORTANCE_HIGH));
        }
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pi = PendingIntent.getActivity(context, 3001, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification n = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_timer)
                .setContentTitle("打卡时间到")
                .setContentText("记录一下现在在做什么吧")
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();
        nm.notify(NOTIFICATION_ID, n);
    }
}
