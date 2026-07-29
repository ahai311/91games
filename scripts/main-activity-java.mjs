/** 系统 WebView + Custom Tabs 回退（唯一引擎） — v34: state save/restore + crash guard */
export function getMainActivitySource(pkg) {
  return `package ${pkg};

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.view.WindowCompat;

public class MainActivity extends AppCompatActivity {
    // shellPatchVersion=34 — state save/restore + crash guard
    private static final int MIN_CHROME_MAJOR = 80;
    private static final int SPLASH_MIN_MS = 3000;  // wait for SPA framework mount
    private WebView webView;
    private ImageView splashView;
    private TextView splashSkipButton;
    private FrameLayout rootLayout;
    private boolean launchedCustomTab = false;
    private boolean splashDismissed = false;
    private long splashShownAt = 0L;
    private String targetUrl;
    private ValueCallback<Uri[]> uploadMessage;
    private static final int FILE_CHOOSER_RESULT_CODE = 100;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(savedInstanceState);
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(0xFFFFFFFF);

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
        webView.setBackgroundColor(0xFFFFFFFF);
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
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (uploadMessage != null) {
                uploadMessage.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                uploadMessage = null;
            }
        }
        super.onActivityResult(requestCode, resultCode, data);
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
        // Also start a delayed dismiss (safety net if JS bridge fails)
        rootLayout.postDelayed(this::dismissSplashNow, 3000);
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadsImagesAutomatically(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setAllowContentAccess(true);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);
        }
        String ua = s.getUserAgentString();
        if (ua != null && !ua.contains("UStationApp")) {
            s.setUserAgentString(ua + " UStationApp/1.0");
        }

        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                    uploadMessage = null;
                }
                uploadMessage = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_RESULT_CODE);
                } catch (Exception e) {
                    uploadMessage = null;
                    return false;
                }
                return true;
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView newView = new WebView(MainActivity.this);
                WebSettings newSettings = newView.getSettings();
                newSettings.setJavaScriptEnabled(true);
                newSettings.setDomStorageEnabled(true);
                newSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                newSettings.setAllowContentAccess(true);
                newSettings.setAllowFileAccess(true);
                newView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        String url = request.getUrl().toString();
                        if (isExternalServiceUrl(url)) {
                            rootLayout.removeView(newView);
                            openExternalBrowser(url);
                            return true;
                        }
                        if (isLoginOrLogoutUrl(url)) {
                            webView.loadUrl(url.replaceAll("/(login|logout|auth).*", "/home"));
                            rootLayout.removeView(newView);
                            return true;
                        }
                        return false;
                    }
                    @Override
                    public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                        super.onPageStarted(view, url, favicon);
                        if (url != null && isExternalServiceUrl(url)) {
                            rootLayout.removeView(newView);
                            openExternalBrowser(url);
                        }
                    }
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        if (url != null && isExternalServiceUrl(url)) {
                            rootLayout.removeView(newView);
                            openExternalBrowser(url);
                        }
                        if (url != null && isLoginOrLogoutUrl(url)) {
                            webView.loadUrl(url.replaceAll("/(login|logout|auth).*", "/home"));
                            rootLayout.removeView(newView);
                        }
                    }
                });
                newView.setDownloadListener(createDownloadListener());
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                );
                newView.setVisibility(View.VISIBLE);
                rootLayout.addView(newView, lp);
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(newView);
                resultMsg.sendToTarget();
                return true;
            }
        });

        wv.setDownloadListener(createDownloadListener());

        wv.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (isExternalServiceUrl(url)) {
                    openExternalBrowser(url);
                    return true;
                }
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                } catch (Exception ignored) {}
                return true;
            }
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                view.evaluateJavascript(
                    "(function(){try{" +
                    "localStorage.setItem('IS_NATIVE_APP','1');" +
                    "document.title='';" +
                    "}catch(e){}})();",
                    null
                );
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(
                    "(function(){try{" +
                    "localStorage.setItem('IS_NATIVE_APP','1');" +
                    "document.title='';" +
                    "}catch(e){}})();",
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
                webView.setBackgroundColor(0xFFFFFFFF);
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

    private DownloadListener createDownloadListener() {
        return (url, userAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, Uri.parse(url).getLastPathSegment());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.HONEYCOMB) {
                    request.allowScanningByMediaScanner();
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                }
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) {
                    dm.enqueue(request);
                    Toast.makeText(MainActivity.this, "下载已开始", Toast.LENGTH_SHORT).show();
                }
            } catch (Exception e) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        };
    }

    private boolean isLoginOrLogoutUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase();
        return lower.contains("/login") || lower.contains("/logout") || lower.contains("/auth");
    }

    private boolean isExternalServiceUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase();
        return lower.contains("tawk.to") || lower.contains("embed.tawk.to")
            || lower.contains("va.tawk.to") || lower.contains("chat-widget");
    }

    private void openExternalBrowser(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        }
    }
}
`;
}
