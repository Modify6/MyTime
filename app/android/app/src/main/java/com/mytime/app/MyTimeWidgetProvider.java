package com.mytime.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.widget.RemoteViews;

import java.util.Calendar;

/**
 * 桌面小组件：今日累计 + 计时中状态（chronometer 走秒）+ 快捷结束。
 * 数据来自 TimerPlugin.syncWidgetState 写入的 SharedPreferences 快照；
 * 运行中用 RemoteViews chronometer 自行走秒；跨天零点自动刷新累计。
 */
public class MyTimeWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_MIDNIGHT = "com.mytime.app.action.WIDGET_MIDNIGHT";

    private static final String PREFS = "mytime";

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            mgr.updateAppWidget(id, render(context));
        }
        scheduleMidnight(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_MIDNIGHT.equals(intent.getAction())) {
            requestUpdate(context); // 跨天刷新累计
        }
    }

    public static void requestUpdate(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, MyTimeWidgetProvider.class));
        if (ids.length == 0) return;
        for (int id : ids) {
            mgr.updateAppWidget(id, render(c));
        }
    }

    private static android.widget.RemoteViews render(Context c) {
        android.content.SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String today = sp.getString("widgetDate", "");
        String todayKey = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                .format(Calendar.getInstance().getTime());
        long todayMs = todayKey.equals(today) ? sp.getLong("widgetTodayMs", 0) : 0;
        String runningTitle = sp.getString("widgetRunningTitle", "");
        long runningStartAt = sp.getLong("widgetRunningStartAt", 0);
        boolean running = !runningTitle.isEmpty();

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);

        v.setTextViewText(R.id.w_date, "今日 · " + todayKey.substring(5).replace('-', '/'));
        v.setTextViewText(R.id.w_today, fmtH(todayMs));

        // 整块点击 → 打开 App
        v.setOnClickPendingIntent(R.id.w_root, openApp(c, "mytime://widget/open"));

        if (running) {
            v.setViewVisibility(R.id.w_running_box, android.view.View.VISIBLE);
            v.setViewVisibility(R.id.w_idle_hint, android.view.View.GONE);
            v.setTextViewText(R.id.w_running_title, runningTitle);
            // chronometer 自行走秒：基准换算到 elapsedRealtime
            v.setChronometer(R.id.w_chrono,
                    SystemClock.elapsedRealtime() - (System.currentTimeMillis() - runningStartAt), null, true);
            v.setOnClickPendingIntent(R.id.w_stop, openApp(c, "mytime://widget/stop"));
        } else {
            v.setViewVisibility(R.id.w_running_box, android.view.View.GONE);
            v.setViewVisibility(R.id.w_idle_hint, android.view.View.VISIBLE);
        }

        scheduleMidnight(c);
        return v;
    }

    private static String fmtH(long ms) {
        long m = ms / 60_000;
        if (m <= 0) return "0 分钟";
        if (m < 60) return m + " 分钟";
        return (m / 60) + " 小时 " + (m % 60) + " 分";
    }

    private static PendingIntent openApp(Context c, String uri) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        i.setPackage(c.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, uri.hashCode(), i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // 跨天零点刷新（今日累计归零）
    private static void scheduleMidnight(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 5);
        PendingIntent pi = PendingIntent.getBroadcast(
                c, 4001,
                new Intent(c, MyTimeWidgetProvider.class).setAction(ACTION_MIDNIGHT),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        am.set(AlarmManager.RTC, next.getTimeInMillis(), pi);
    }
}
