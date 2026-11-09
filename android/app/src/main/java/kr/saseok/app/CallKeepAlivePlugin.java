package kr.saseok.app;

import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** start() / stop() the foreground service that keeps a call alive with the screen off (CallForegroundService). */
@CapacitorPlugin(name = "CallKeepAlive")
public class CallKeepAlivePlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        try {
            Context context = getContext();
            ContextCompat.startForegroundService(context, new Intent(context, CallForegroundService.class));
            call.resolve();
        } catch (Exception error) {
            // For example a start while the app is not on the screen: the call still works while it is.
            call.reject("The call service could not start: " + error.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        context.stopService(new Intent(context, CallForegroundService.class));
        call.resolve();
    }
}
