package com.latency.app;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
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
    private String currentProvider;
    private final Handler checkHandler = new Handler(Looper.getMainLooper());
    private Runnable checkRunnable;

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
                stopPeriodicCheck();
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

    private void startPeriodicCheck() {
        stopPeriodicCheck();
        checkRunnable = new Runnable() {
            @Override
            public void run() {
                checkSoundCloudAuth();
                if (currentDialog != null && currentDialog.isShowing()) {
                    checkHandler.postDelayed(this, 1200);
                }
            }
        };
        checkHandler.postDelayed(checkRunnable, 1200);
    }

    private void stopPeriodicCheck() {
        if (checkRunnable != null) {
            checkHandler.removeCallbacks(checkRunnable);
            checkRunnable = null;
        }
    }

    private void showAuthDialog(final String provider) {
        closeAuth();
        currentProvider = provider;

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
                    sendCandidateToken(provider, token);
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
                        sendCandidateToken(provider, token);
                        return true;
                    }
                } else if ("soundcloud".equals(provider)) {
                    checkSoundCloudAuth();
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if ("yandex".equals(provider)) {
                    String token = extractYandexToken(url);
                    if (token != null) {
                        sendCandidateToken(provider, token);
                        return;
                    }
                } else if ("soundcloud".equals(provider)) {
                    injectSoundCloudHook(view);
                    checkSoundCloudAuth();
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
            startPeriodicCheck();
            authWebView.loadUrl("https://soundcloud.com/signin");
        }
    }

    private void checkSoundCloudAuth() {
        if (!"soundcloud".equals(currentProvider) || authWebView == null) return;

        // 1. Check cookies via CookieManager
        try {
            String cookieHeader = CookieManager.getInstance().getCookie("https://soundcloud.com");
            String token = extractSoundCloudTokenFromCookies(cookieHeader);
            if (token != null) {
                sendCandidateToken("soundcloud", token);
            }
        } catch (Exception ignored) {}

        // 2. Evaluate script in WebView
        try {
            String script = "(function() {" +
                "  try {" +
                "    var m = document.cookie.match(/(?:^|;\\s*)oauth_token=([^;]+)/);" +
                "    if (m && m[1]) return decodeURIComponent(m[1]);" +
                "    for (var i = 0; i < localStorage.length; i++) {" +
                "      var k = localStorage.key(i);" +
                "      if (k && (k === 'oauth_token' || k.indexOf('token') !== -1 || k.indexOf('oauth') !== -1)) {" +
                "        var v = localStorage.getItem(k);" +
                "        if (v && typeof v === 'string') {" +
                "          var tok = v.match(/2-[a-zA-Z0-9\\-_]{15,}/);" +
                "          if (tok) return tok[0];" +
                "        }" +
                "      }" +
                "    }" +
                "    for (var j = 0; j < sessionStorage.length; j++) {" +
                "      var sk = sessionStorage.key(j);" +
                "      if (sk && (sk === 'oauth_token' || sk.indexOf('token') !== -1 || sk.indexOf('oauth') !== -1)) {" +
                "        var sv = sessionStorage.getItem(sk);" +
                "        if (sv && typeof sv === 'string') {" +
                "          var stok = sv.match(/2-[a-zA-Z0-9\\-_]{15,}/);" +
                "          if (stok) return stok[0];" +
                "        }" +
                "      }" +
                "    }" +
                "  } catch(e) {}" +
                "  return null;" +
                "})();";
            authWebView.evaluateJavascript(script, new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if (value != null && !value.isEmpty() && !"null".equals(value)) {
                        sendCandidateToken("soundcloud", value);
                    }
                }
            });
        } catch (Exception ignored) {}
    }

    private String extractSoundCloudTokenFromCookies(String cookieHeader) {
        if (cookieHeader == null || cookieHeader.isEmpty()) return null;
        String[] parts = cookieHeader.split(";");
        for (String part : parts) {
            String trimmed = part.trim();
            if (trimmed.startsWith("oauth_token=")) {
                String val = trimmed.substring("oauth_token=".length()).trim();
                return sanitizeToken(val);
            }
        }
        return null;
    }

    private void injectSoundCloudHook(WebView view) {
        String script = "(function() {" +
            "if (window.__scHooked) return;" +
            "window.__scHooked = true;" +
            "function notify(auth) {" +
            "  if (!auth || typeof auth !== 'string') return;" +
            "  var m = auth.match(/OAuth\\s+([^\\s]+)/i);" +
            "  var tok = m ? m[1] : (auth.indexOf('2-') !== -1 ? auth : null);" +
            "  if (tok) {" +
            "    try { window.LatencyAuthCapture.onCaptured(tok); } catch(e){}" +
            "  }" +
            "}" +
            "var _origFetch = window.fetch;" +
            "if (_origFetch) {" +
            "  window.fetch = function(input, init) {" +
            "    try {" +
            "      if (typeof input === 'string') {" +
            "        var qm = input.match(/[?&](?:oauth_token|access_token)=([^&#]+)/i);" +
            "        if (qm && qm[1]) notify(decodeURIComponent(qm[1]));" +
            "      }" +
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

    private String sanitizeToken(String token) {
        if (token == null) return null;
        String cleaned = token.replaceFirst("(?i)^OAuth\\s+", "").trim();
        if (cleaned.startsWith("%22") && cleaned.endsWith("%22") && cleaned.length() >= 6) {
            try {
                cleaned = Uri.decode(cleaned);
            } catch (Exception ignored) {}
        }
        if (cleaned.startsWith("\"") && cleaned.endsWith("\"") && cleaned.length() >= 2) {
            cleaned = cleaned.substring(1, cleaned.length() - 1);
        }
        cleaned = cleaned.trim();
        return cleaned.isEmpty() ? null : cleaned;
    }

    private void sendCandidateToken(String provider, String token) {
        String cleaned = sanitizeToken(token);
        if (cleaned != null) {
            sendEventToJS("authCandidate", provider, cleaned);
        }
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
