package com.latency.app;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;

public class LatencyAuthBridge {
    private final Activity activity;
    private final WebView mainWebView;
    private Dialog currentDialog;
    private WebView authWebView;

    public LatencyAuthBridge(Activity activity, WebView mainWebView) {
        this.activity = activity;
        this.mainWebView = mainWebView;
    }

    @JavascriptInterface
    public void openAuth(final String provider) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                showAuthDialog(provider);
            }
        });
    }

    @JavascriptInterface
    public void closeAuth() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (currentDialog != null && currentDialog.isShowing()) {
                    currentDialog.dismiss();
                    currentDialog = null;
                }
            }
        });
    }

    public void destroy() {
        closeAuth();
    }

    private void showAuthDialog(final String provider) {
        closeAuth();

        currentDialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_NoActionBar_Fullscreen);
        Window window = currentDialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(0xFF101014));
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        }

        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF101014);

        // Header
        LinearLayout header = new LinearLayout(activity);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(32, 24, 32, 24);
        header.setBackgroundColor(0xFF18181F);

        TextView closeBtn = new TextView(activity);
        closeBtn.setText("Закрыть");
        closeBtn.setTextColor(0xFF8B5CF6);
        closeBtn.setTextSize(16);
        closeBtn.setPadding(16, 16, 32, 16);
        closeBtn.setOnClickListener(v -> {
            sendEventToJS("authCanceled", provider, "");
            closeAuth();
        });
        header.addView(closeBtn);

        TextView title = new TextView(activity);
        title.setText("yandex".equals(provider) ? "Яндекс Музыка" : "SoundCloud");
        title.setTextColor(Color.WHITE);
        title.setTextSize(18);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        header.addView(title);

        root.addView(header, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        authWebView = new WebView(activity);
        WebSettings settings = authWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(authWebView, true);

        authWebView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void onCaptured(String token) {
                if (token != null && !token.isEmpty()) {
                    sendEventToJS("authCandidate", provider, token);
                }
            }
        }, "LatencyAuthCapture");

        authWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri != null ? uri.toString() : "";
                if ("yandex".equals(provider)) {
                    String token = extractYandexToken(url);
                    if (token != null) {
                        sendEventToJS("authCandidate", provider, token);
                        return true;
                    }
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if ("yandex".equals(provider)) {
                    String token = extractYandexToken(url);
                    if (token != null) {
                        sendEventToJS("authCandidate", provider, token);
                        return;
                    }
                } else if ("soundcloud".equals(provider)) {
                    injectSoundCloudHook(view);
                }
            }
        });

        root.addView(authWebView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        currentDialog.setOnCancelListener(dialog -> {
            sendEventToJS("authCanceled", provider, "");
        });

        currentDialog.setContentView(root);
        currentDialog.show();

        if ("yandex".equals(provider)) {
            String clientId = "23cabbbdc6cd418abb4b39c32c41195d";
            authWebView.loadUrl("https://oauth.yandex.ru/authorize?response_type=token&client_id=" + clientId);
        } else {
            authWebView.loadUrl("https://soundcloud.com/signin");
        }
    }

    private void injectSoundCloudHook(WebView view) {
        String script = "(function() {" +
            "if (window.__scHooked) return;" +
            "window.__scHooked = true;" +
            "function notify(auth) {" +
            "  if (!auth || typeof auth !== 'string') return;" +
            "  var m = auth.match(/OAuth\\s+(2-[a-zA-Z0-9\\-_]{15,})/i);" +
            "  if (m && m[1]) {" +
            "    try { window.LatencyAuthCapture.onCaptured(m[1]); } catch(e){}" +
            "  }" +
            "}" +
            "var _origFetch = window.fetch;" +
            "if (_origFetch) {" +
            "  window.fetch = function(input, init) {" +
            "    try {" +
            "      if (init && init.headers) {" +
            "        if (typeof init.headers.get === 'function') {" +
            "          notify(init.headers.get('Authorization') || init.headers.get('authorization'));" +
            "        } else if (typeof init.headers === 'object') {" +
            "          notify(init.headers['Authorization'] || init.headers['authorization']);" +
            "        }" +
            "      }" +
            "    } catch(e){}" +
            "    return _origFetch.apply(this, arguments);" +
            "  };" +
            "}" +
            "var _origSet = XMLHttpRequest.prototype.setRequestHeader;" +
            "XMLHttpRequest.prototype.setRequestHeader = function(h, v) {" +
            "  try { if (h && h.toLowerCase() === 'authorization') notify(v); } catch(e){}" +
            "  return _origSet.apply(this, arguments);" +
            "};" +
            "})();";
        view.evaluateJavascript(script, null);
    }

    private String extractYandexToken(String url) {
        if (url == null) return null;
        int idx = url.indexOf("access_token=");
        if (idx == -1) return null;
        String sub = url.substring(idx + "access_token=".length());
        int end = sub.indexOf('&');
        if (end != -1) sub = sub.substring(0, end);
        int hash = sub.indexOf('#');
        if (hash != -1) sub = sub.substring(0, hash);
        return sub.isEmpty() ? null : Uri.decode(sub);
    }

    private void sendEventToJS(final String event, final String provider, final String token) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject obj = new JSONObject();
                    obj.put("_event", event);
                    obj.put("provider", provider);
                    obj.put("token", token);
                    String js = "window.__nativeAudioEvent && window.__nativeAudioEvent(" + obj.toString() + ");";
                    mainWebView.evaluateJavascript(js, null);
                } catch (Exception ignored) {}
            }
        });
    }
}
