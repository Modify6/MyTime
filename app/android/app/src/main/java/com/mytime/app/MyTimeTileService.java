package com.mytime.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

import androidx.annotation.RequiresApi;

/**
 * 下拉快捷磁贴：计时中 → 点击深链结束打卡；空闲 → 点击打开 App 打卡。
 * 状态读取 TimerPlugin.syncWidgetState 写入的 SharedPreferences 快照。
 */
@RequiresApi(Build.VERSION_CODES.N)
public class MyTimeTileService extends TileService {

    @Override
    public void onStartListening() {
        updateTile();
    }

    @Override
    public void onClick() {
        boolean running = isRunning();
        Intent i;
        if (running) {
            i = new Intent(Intent.ACTION_VIEW, Uri.parse("mytime://widget/stop"));
            i.setPackage(getPackageName());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        } else {
            i = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (i == null) return;
        }
        if (Build.VERSION.SDK_INT >= 30) {
            startActivityAndCollapse(android.app.PendingIntent.getActivity(
                    this, 5001, i,
                    android.app.PendingIntent.FLAG_IMMUTABLE | android.app.PendingIntent.FLAG_UPDATE_CURRENT));
        } else {
            startActivityAndCollapse(i);
        }
    }

    private boolean isRunning() {
        android.content.SharedPreferences sp = getSharedPreferences("mytime", Context.MODE_PRIVATE);
        String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                .format(java.util.Calendar.getInstance().getTime());
        return !sp.getString("widgetRunningTitle", "").isEmpty()
                && today.equals(sp.getString("widgetDate", ""));
    }

    private void updateTile() {
        Tile tile = getQsTile();
        if (tile == null) return;
        if (isRunning()) {
            String title = getSharedPreferences("mytime", Context.MODE_PRIVATE)
                    .getString("widgetRunningTitle", "");
            tile.setState(Tile.STATE_ACTIVE);
            tile.setSubtitle("计时中 · " + title);
        } else {
            tile.setState(Tile.STATE_INACTIVE);
            tile.setSubtitle("点击去打卡");
        }
        tile.updateTile();
    }
}
