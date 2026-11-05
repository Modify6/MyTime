package com.mytime.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** WebView 侧通过 window.Capacitor.Plugins.ReminderNative 调用 */
@CapacitorPlugin(name = "ReminderNative")
public class ReminderPlugin extends Plugin {

    @PluginMethod
    public void setDaily(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        Boolean enabled = call.getBoolean("enabled");
        if (hour == null || minute == null || enabled == null
                || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            call.reject("invalid time");
            return;
        }
        ReminderScheduler.setDaily(getContext(), hour, minute, enabled);
        call.resolve();
    }
}
