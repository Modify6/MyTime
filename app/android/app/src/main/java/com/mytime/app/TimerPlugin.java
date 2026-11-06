package com.mytime.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** WebView 侧通过 window.Capacitor.Plugins.TimerNative 调用 */
@CapacitorPlugin(name = "TimerNative")
public class TimerPlugin extends Plugin {

    private static TimerPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        instance = null;
    }

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "计时中");
        Double startAtDouble = call.getDouble("startAt");
        long startAt = startAtDouble == null ? System.currentTimeMillis() : startAtDouble.longValue();

        Intent intent = new Intent(getContext(), TimerService.class);
        intent.putExtra("title", title);
        intent.putExtra("startAt", startAt);
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    /** 原生读取系统栏高度（dp）注入 CSS 变量：APK 全程 edge-to-edge，顶部/底部避让全部由 CSS 承担 */
    @PluginMethod
    public void getSafeArea(PluginCall call) {
        getBridge().getActivity().runOnUiThread(() -> {
            try {
                android.view.View decor = getBridge().getWebView().getRootView();
                android.view.WindowInsets insets = decor.getRootWindowInsets();
                int top = 0;
                int bottom = 0;
                if (insets != null) {
                    if (Build.VERSION.SDK_INT >= 30) {
                        android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars());
                        top = bars.top;
                        bottom = bars.bottom;
                    } else {
                        top = insets.getStableInsetTop();
                        bottom = insets.getSystemWindowInsetBottom();
                    }
                }
                float density = getContext().getResources().getDisplayMetrics().density;
                JSObject r = new JSObject();
                r.put("top", Math.max(0, Math.round(top / density)));
                r.put("bottom", Math.max(0, Math.round(bottom / density)));
                call.resolve(r);
            } catch (Exception e) {
                call.resolve(new JSObject());
            }
        });
    }

    /** 通知权限状态（ColorOS 等需要用户手动授权，写入运行日志便于诊断"看不到计时通知"） */
    @PluginMethod
    public void notificationsEnabled(PluginCall call) {
        android.app.NotificationManager nm = (android.app.NotificationManager) getContext()
                .getSystemService(Context.NOTIFICATION_SERVICE);
        boolean enabled = Build.VERSION.SDK_INT < 24
                || nm == null
                || nm.areNotificationsEnabled();
        JSObject r = new JSObject();
        r.put("enabled", enabled);
        call.resolve(r);
    }

    /** 打开系统应用详情页（通知 / 自启动 / 后台弹出界面 的权限入口） */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(android.net.Uri.fromParts("package", getContext().getPackageName(), null));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /**
     * JS → 原生状态快照（桌面小组件/快捷磁贴的数据源）：
     * 数据在 WebView IndexedDB 里，原生侧只存 SharedPreferences 快照供 Widget 渲染
     */
    @PluginMethod
    public void syncWidgetState(PluginCall call) {
        Double todayMsD = call.getDouble("todayMs");
        Double runningStartAtD = call.getDouble("runningStartAt");
        android.content.SharedPreferences sp = getContext().getSharedPreferences("mytime", Context.MODE_PRIVATE);
        sp.edit()
                .putLong("widgetTodayMs", todayMsD == null ? 0 : todayMsD.longValue())
                .putString("widgetDate", call.getString("date", ""))
                .putString("widgetRunningTitle", call.getString("runningTitle", ""))
                .putLong("widgetRunningStartAt", runningStartAtD == null ? 0 : runningStartAtD.longValue())
                .apply();
        MyTimeWidgetProvider.requestUpdate(getContext());
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), TimerService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    /** Android 13+ 需要运行时通知权限，打卡开始前调用 */
    @PluginMethod
    public void ensureNotificationPermission(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(getActivity(),
                        new String[] { Manifest.permission.POST_NOTIFICATIONS }, 9001);
            }
        }
        call.resolve();
    }

    /** 服务在通知上点了"结束打卡"时通知 JS 层 */
    static void notifyStopRequested() {
        if (instance != null) {
            instance.notifyListeners("timerStopRequested", new JSObject());
        }
    }
}
