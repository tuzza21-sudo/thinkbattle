package kr.saseok.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The plugin that keeps a call alive with the screen off (it is ours, so `cap sync` does not find it).
        registerPlugin(CallKeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
