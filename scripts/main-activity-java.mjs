/** 系统 WebView + Custom Tabs 回退（唯一引擎） — v34: state save/restore + crash guard */
export function getMainActivitySource(pkg) {
  return `package ${pkg};

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.net.Uri;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.view.WindowCompat;

public class MainActivity extends AppCompatActivity {
    // shellPatchVersion=34 — state save/restore + crash guard
    private static final int MIN_CHROME_MAJOR = 80;
    private static final int SPLASH_MIN_MS = 600;
    private WebView webView;
    private ImageView splashView;
    private TextView splashSkipButton;
    private FrameLayout rootLayout;
    private boolean launchedCustomTab = false;
    private boolean splashDismissed = false;
    private long splashShownAt = 0L;
    private String targetUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(savedInstanceState);
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(0xFF0B0F1A);

        if (getResources().getBoolean(R.bool.launch_has_splash)) {
            splashView = new ImageView(this);
            splashView.setScaleType(ImageView.ScaleType.CENTER_CROP);
            splashView.setImageResource(R.drawable.splash);
            rootLayout.addView(splashView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));
            splashShownAt = System.currentTimeMillis();
            addSplashSkipButton();
        }
        setContentView(rootLayout);

        targetUrl = resolveTargetUrl();
        int wvMajor = getWebViewChromeMajor();

        if (wvMajor > 0 && wvMajor < MIN_CHROME_MAJOR) {
            if (launchCustomTab(targetUrl)) {
                launchedCustomTab = true;
                dismissSplashNow();
                showCustomTabHint();
                return;
            }
        }

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF0B0F1A);
        webView.setVisibility(View.INVISIBLE);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        configureWebView(webView);

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(targetUrl);
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (launchedCustomTab) {
                    finish();
                    return;
                }
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        if (webView != null) {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {}
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void addSplashSkipButton() {
        splashSkipButton = new TextView(this);
        splashSkipButton.setText("SKIP");
        splashSkipButton.setTextColor(0xFFFFFFFF);
        splashSkipButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
        splashSkipButton.setLetterSpacing(0.05f);
        int padH = dp(14);
        int padV = dp(8);
        splashSkipButton.setPadding(padH, padV, padH, padV);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x66000000);
        bg.setCornerRadius(dp(16));
        splashSkipButton.setBackground(bg);
        splashSkipButton.setClickable(true);
        splashSkipButton.setFocusable(true);
        splashSkipButton.setOnClickListener(v -> dismissSplashNow());
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        lp.gravity = android.view.Gravity.TOP | android.view.Gravity.END;
        lp.topMargin = getStatusBarHeightPx() + dp(12);
        lp.setMarginEnd(dp(16));
        rootLayout.addView(splashSkipButton, lp);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int getStatusBarHeightPx() {
        int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (id > 0) return getResources().getDimensionPixelSize(id);
        return dp(24);
    }

    private void dismissSplashNow() {
        if (splashDismissed) return;
        splashDismissed = true;
        if (splashView != null) {
            splashView.setVisibility(View.GONE);
        }
        if (splashSkipButton != null) {
            splashSkipButton.setVisibility(View.GONE);
        }
        if (webView != null) {
            webView.setVisibility(View.VISIBLE);
        }
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
    }

    private void dismissSplashWhenReady() {
        if (splashDismissed || splashView == null) {
            if (webView != null) webView.setVisibility(View.VISIBLE);
            return;
        }
        long elapsed = System.currentTimeMillis() - splashShownAt;
        long delay = Math.max(0L, SPLASH_MIN_MS - elapsed);
        rootLayout.postDelayed(this::dismissSplashNow, delay);
    }

    private String resolveTargetUrl() {
        try {
            return getString(R.string.app_target_url);
        } catch (Exception e) {
            return "http://xh.ms/?native=1";
        }
    }

    private int getWebViewChromeMajor() {
        try {
            PackageInfo pi = WebView.getCurrentWebViewPackage();
            if (pi == null) return 0;
            return parseChromeMajor(pi.versionName);
        } catch (Exception e) {
            return 0;
        }
    }

    private int parseChromeMajor(String versionName) {
        if (versionName == null) return 0;
        StringBuilder digits = new StringBuilder();
        for (int i = 0; i < versionName.length(); i++) {
            char c = versionName.charAt(i);
            if (c >= '0' && c <= '9') {
                digits.append(c);
            } else if (digits.length() > 0) {
                break;
            }
        }
        if (digits.length() == 0) return 0;
        try {
            return Integer.parseInt(digits.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private boolean launchCustomTab(String url) {
        try {
            CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder();
            builder.setShowTitle(false);
            builder.setToolbarColor(Color.WHITE);
            builder.setNavigationBarColor(Color.WHITE);
            CustomTabsIntent tabs = builder.build();
            String pkg = findChromePackage();
            if (pkg != null) {
                tabs.intent.setPackage(pkg);
            }
            tabs.launchUrl(this, Uri.parse(url));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String findChromePackage() {
        String[] candidates = new String[] {
            "com.android.chrome",
            "com.chrome.beta",
            "com.google.android.webview"
        };
        PackageManager pm = getPackageManager();
        for (String pkg : candidates) {
            try {
                pm.getPackageInfo(pkg, 0);
                return pkg;
            } catch (PackageManager.NameNotFoundException ignored) {
            }
        }
        return null;
    }

    private void showCustomTabHint() {
        TextView hint = new TextView(this);
        hint.setTextColor(0xFF333333);
        hint.setTextSize(14f);
        hint.setPadding(48, 120, 48, 48);
        hint.setText("当前系统 WebView 版本过旧，已用 Chrome 打开站点。请更新 Android System WebView 后重试。");
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        root.addView(hint);
        setContentView(root);
    }

    private void configureWebView(WebView wv) {
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadsImagesAutomatically(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);
        s.setAllowContentAccess(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);
        }
        String ua = s.getUserAgentString();
        if (ua != null && !ua.contains("UStationApp")) {
            s.setUserAgentString(ua + " UStationApp/1.0");
        }
        wv.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                dismissSplashWhenReady();
                view.evaluateJavascript(
                    "(function(){try{localStorage.setItem('IS_NATIVE_APP','1');document.title='';}catch(e){}})();",
                    null
                );
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    dismissSplashNow();
                    String errUrl = request.getUrl() != null ? request.getUrl().toString() : "";
                    String errMsg = error != null ? error.getDescription() != null ? error.getDescription().toString() : "" : "";
                    view.evaluateJavascript(
                        "(function(){try{document.body.innerHTML='<div style=\\\"display:flex;align-items:center;justify-content:center;height:100vh;background:#0B0F1A;color:#fff;font-family:sans-serif;text-align:center;padding:20px\\\"><div><h2>\\u7f51\\u7edc\\u52a0\\u8f7d\\u5931\\u8d25</h2><p style=\\\"opacity:0.7\\\">\\u8bf7\\u68c0\\u67e5\\u7f51\\u7edc\\u8fde\\u63a5\\u540e\\u91cd\\u8bd5</p><button onclick=\\\"location.reload()\\\" style=\\\"margin-top:16px;padding:8px 24px;border:1px solid #fff;background:transparent;color:#fff;border-radius:4px;font-size:14px\\\">\\u91cd\\u8bd5</button></div></div>';document.title='';}catch(e){}})();",
                        null
                    );
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (webView != null) {
                    webView.stopLoading();
                    webView.destroy();
                    webView = null;
                }
                webView = new WebView(MainActivity.this);
                webView.setBackgroundColor(0xFF0B0F1A);
                webView.setVisibility(View.VISIBLE);
                rootLayout.addView(webView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));
                configureWebView(webView);
                webView.loadUrl(targetUrl != null ? targetUrl : resolveTargetUrl());
                return true;
            }
        });
    }
}
`;
}
