package com.mytime.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.Calendar;

/** 每日提醒的闹钟调度：到点由 ReminderReceiver 弹通知并自动排明天 */
public final class ReminderScheduler {

    private static final int REQUEST_CODE = 2001;
    private static final String PREFS = "mytime";

    private ReminderScheduler() {}

    public static boolean isEnabled(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("dailyReminder", false);
    }

    public static void setDaily(Context c, int hour, int minute, boolean enabled) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putInt("remindHour", hour)
                .putInt("remindMin", minute)
                .putBoolean("dailyReminder", enabled)
                .apply();
        if (enabled) {
            scheduleNext(c);
        } else {
            cancel(c);
        }
    }

    /** 排下一次提醒（若时刻已过则排明天） */
    public static void scheduleNext(Context c) {
        if (!isEnabled(c)) return;
        int hour = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("remindHour", 9);
        int minute = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("remindMin", 0);

        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (!next.after(Calendar.getInstance())) {
            next.add(Calendar.DAY_OF_YEAR, 1);
        }

        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(
                c,
                REQUEST_CODE,
                new Intent(c, ReminderReceiver.class).setAction(ReminderReceiver.ACTION_FIRE),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        // Android 12+ 精确闹钟需要用户在系统设置里授权；未授权时退化为非精确（可能延迟几分钟）
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), pi);
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), pi);
        }
    }

    public static void cancel(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.cancel(PendingIntent.getBroadcast(
                c,
                REQUEST_CODE,
                new Intent(c, ReminderReceiver.class).setAction(ReminderReceiver.ACTION_FIRE),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
    }
}
