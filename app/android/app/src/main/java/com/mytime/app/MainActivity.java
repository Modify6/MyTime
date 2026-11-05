package com.mytime.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TimerPlugin.class);
        registerPlugin(ReminderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
