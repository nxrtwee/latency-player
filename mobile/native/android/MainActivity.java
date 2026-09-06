package com.latency.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private LatencyAuthBridge authBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        authBridge = new LatencyAuthBridge(this, this.getBridge().getWebView());
        this.getBridge().getWebView().addJavascriptInterface(authBridge, "LatencyAuthBridge");
    }

    @Override
    public void onDestroy() {
        if (authBridge != null) {
            authBridge.destroy();
        }
        super.onDestroy();
    }
}
