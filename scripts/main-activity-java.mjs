/** 系统 WebView + Custom Tabs 回退（唯一引擎） */
export function getMainActivitySource(pkg) {
  return `package ${pkg};

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import java.io.File;
import java.io.FileOutputStream;
import android.os.Handler;
import android.os.Looper;

public class MainActivity extends AppCompatActivity {
    // shellPatchVersion=37 — clipboard polyfill + popup window + no click interceptor
    private static final int MIN_CHROME_MAJOR = 80;
    private static final int SPLASH_MIN_MS = 600;
    private static final int PERM_REQUEST_CODE = 100;
    private static final int FILE_CHOOSER_REQUEST = 101;
    private WebView webView;
    private ImageView splashView;
    private TextView splashSkipButton;
    private FrameLayout rootLayout;
    private boolean launchedCustomTab = false;
    private boolean splashDismissed = false;
    private long splashShownAt = 0L;
    private ValueCallback<Uri[]> fileUploadCallback;
    private boolean permissionRequested = false;
    private String pendingFileAccept = "";

    private class NativeBridge {
        @JavascriptInterface
        public void copyToClipboard(String text) {
            if (text == null || text.isEmpty()) return;
            final String finalText = text;
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    android.content.ClipData clip = android.content.ClipData.newPlainText("text", finalText);
                    cm.setPrimaryClip(clip);
                    android.widget.Toast.makeText(MainActivity.this, "已复制", android.widget.Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    android.widget.Toast.makeText(MainActivity.this, "复制失败", android.widget.Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void saveBase64File(String base64Data, String filename) {
            if (base64Data == null || base64Data.isEmpty()) {
                new Handler(Looper.getMainLooper()).post(() -> {
                    android.widget.Toast.makeText(MainActivity.this, "保存失败: 无数据", android.widget.Toast.LENGTH_SHORT).show();
                });
                return;
            }
            String fName = (filename != null && !filename.isEmpty()) ? filename : ("qr_" + System.currentTimeMillis() + ".png");
            String mime = "image/png";
            if (fName.endsWith(".jpg") || fName.endsWith(".jpeg")) mime = "image/jpeg";
            else if (fName.endsWith(".webp")) mime = "image/webp";
            else if (fName.endsWith(".gif")) mime = "image/gif";
            final String finalName = fName;
            final String finalMime = mime;
            new Thread(() -> {
                try {
                    byte[] bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);
                    saveBytesToFile(bytes, finalName, finalMime);
                } catch (Exception e) {
                    new Handler(Looper.getMainLooper()).post(() -> {
                        android.widget.Toast.makeText(MainActivity.this, "保存失败: " + e.getMessage(), android.widget.Toast.LENGTH_SHORT).show();
                    });
                }
            }).start();
        }

        @JavascriptInterface
        public void saveHttpUrl(String url, String filename) {
            if (url == null || url.isEmpty()) return;
            String fName = (filename != null && !filename.isEmpty()) ? filename : "download";
            final String finalUrl = url;
            final String finalName = fName;
            new Thread(() -> {
                try {
                    java.net.HttpURLConnection conn = (java.net.HttpURLConnection) new java.net.URL(finalUrl).openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.connect();
                    java.io.InputStream is = conn.getInputStream();
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
                    is.close();
                    byte[] bytes = baos.toByteArray();
                    String mime = conn.getContentType();
                    if (mime == null) mime = "application/octet-stream";
                    int semi = mime.indexOf(';');
                    if (semi > 0) mime = mime.substring(0, semi).trim();
                    saveBytesToFile(bytes, finalName, mime);
                } catch (Exception e) {
                    new Handler(Looper.getMainLooper()).post(() -> {
                        android.widget.Toast.makeText(MainActivity.this, "保存失败: " + e.getMessage(), android.widget.Toast.LENGTH_SHORT).show();
                    });
                }
            }).start();
        }

        @JavascriptInterface
        public void openFilePicker(String accept) {
            pendingFileAccept = (accept != null) ? accept : "image/*";
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(pendingFileAccept.isEmpty() ? "*/*" : pendingFileAccept);
                    if (pendingFileAccept.contains(",")) {
                        String[] types = pendingFileAccept.split(",");
                        intent.setType("*/*");
                        String[] mimeTypes = new String[types.length];
                        for (int i = 0; i < types.length; i++) {
                            String t = types[i].trim();
                            if (t.equals("image/jpg")) t = "image/jpeg";
                            mimeTypes[i] = t;
                        }
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
                    }
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivityForResult(Intent.createChooser(intent, "选择图片"), FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    android.widget.Toast.makeText(MainActivity.this, "无法打开选择器", android.widget.Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

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
            rootLayout.postDelayed(() -> {
                if (!splashDismissed) dismissSplashNow();
            }, 3000);
        }
        setContentView(rootLayout);

        String url = resolveTargetUrl();
        int wvMajor = getWebViewChromeMajor();

        if (wvMajor > 0 && wvMajor < MIN_CHROME_MAJOR) {
            if (launchCustomTab(url)) {
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
        webView.addJavascriptInterface(new NativeBridge(), "NativeBridge");
        webView.loadUrl(url);
    }

    private void requestNeededPermissions() {
        if (Build.VERSION.SDK_INT >= 23 && !permissionRequested) {
            permissionRequested = true;
            String[] perms;
            if (Build.VERSION.SDK_INT >= 33) {
                perms = new String[]{
                    Manifest.permission.READ_MEDIA_IMAGES,
                    Manifest.permission.CAMERA
                };
            } else {
                perms = new String[]{
                    Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE,
                    Manifest.permission.CAMERA
                };
            }
            boolean needRequest = false;
            for (String p : perms) {
                if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                    needRequest = true;
                    break;
                }
            }
            if (needRequest) {
                ActivityCompat.requestPermissions(this, perms, PERM_REQUEST_CODE);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERM_REQUEST_CODE) {
            // permissions granted or denied — continue either way
        }
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

    private void saveDownloadedFile(String url, String contentDisposition, String mimeType) {
        try {
            String filename = "download";
            if (contentDisposition != null) {
                int start = contentDisposition.indexOf("filename=");
                if (start >= 0) {
                    filename = contentDisposition.substring(start + 9);
                    filename = filename.replace("\\\"", "").replace(";", "").trim();
                    int q = filename.lastIndexOf('/');
                    if (q >= 0) filename = filename.substring(q + 1);
                }
            }
            if (url != null && filename.equals("download")) {
                String path = Uri.parse(url).getLastPathSegment();
                if (path != null && path.contains(".")) filename = path;
            }
            final String fName = filename;
            final String fUrl = url;

            if (url != null && url.startsWith("blob:")) {
                final String fMimeType = mimeType;
                final String fDisp = contentDisposition;
                final String blobFileName = "qr_" + System.currentTimeMillis() + ".png";
                String jsCode = "(function(){" +
                    "var blob = window._blobStore && window._blobStore['" + url + "'];" +
                    "if(blob){" +
                    "  delete window._blobStore['" + url + "'];" +
                    "  var reader = new FileReader();" +
                    "  reader.onloadend = function(){" +
                    "    var b64 = reader.result.split(',')[1] || '';" +
                    "    if(b64 && window.NativeBridge) window.NativeBridge.saveBase64File(b64, '" + blobFileName + "');" +
                    "  };" +
                    "  reader.readAsDataURL(blob);" +
                    "} else {" +
                    "  window.NativeBridge.saveHttpUrl('" + url + "', '" + blobFileName + "');" +
                    "}" +
                    "})();";
                webView.evaluateJavascript(jsCode, null);
                return;
            }

            new Thread(() -> {
                try {
                    java.net.HttpURLConnection conn = (java.net.HttpURLConnection) new java.net.URL(fUrl).openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.connect();
                    java.io.InputStream is = conn.getInputStream();
                    byte[] data = new byte[4096];
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    int n;
                    while ((n = is.read(data)) != -1) baos.write(data, 0, n);
                    is.close();
                    byte[] bytes = baos.toByteArray();
                    saveBytesToFile(bytes, fName, mimeType != null ? mimeType : "application/octet-stream");
                } catch (Exception e) {
                    new Handler(Looper.getMainLooper()).post(() -> {
                        android.widget.Toast.makeText(this, "保存失败: " + e.getMessage(), android.widget.Toast.LENGTH_SHORT).show();
                    });
                }
            }).start();
        } catch (Exception e) {
            android.widget.Toast.makeText(this, "下载失败", android.widget.Toast.LENGTH_SHORT).show();
        }
    }

    private void saveBytesToFile(byte[] bytes, String filename, String mimeType) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            android.content.ContentValues cv = new android.content.ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            cv.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri != null) {
                java.io.OutputStream os = getContentResolver().openOutputStream(uri);
                if (os != null) { os.write(bytes); os.close(); }
            }
        } else {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists()) dir.mkdirs();
            File file = new File(dir, filename);
            FileOutputStream fos = new FileOutputStream(file);
            fos.write(bytes);
            fos.close();
        }
        new Handler(Looper.getMainLooper()).post(() -> {
            android.widget.Toast.makeText(this, "已保存: " + filename, android.widget.Toast.LENGTH_SHORT).show();
        });
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
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptCookie(true);
            CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);
        }
        String ua = s.getUserAgentString();
        if (ua != null && !ua.contains("UStationApp")) {
            s.setUserAgentString(ua + " UStationApp/1.0");
        }

        wv.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            saveDownloadedFile(url, contentDisposition, mimeType);
        });

        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
                fileUploadCallback = filePathCallback;
                Intent intent = null;
                try {
                    intent = fileChooserParams.createIntent();
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {}
                if (intent == null) {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("image/*");
                }
                try {
                    startActivityForResult(Intent.createChooser(intent, "选择图片"), FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    fileUploadCallback = null;
                    return false;
                }
                return true;
            }
        });

        wv.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (
                    url.startsWith("tg:") ||
                    url.startsWith("mailto:") ||
                    url.startsWith("tel:") ||
                    url.startsWith("sms:") ||
                    url.startsWith("whatsapp:") ||
                    url.startsWith("line:")
                )) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        return false;
                    }
                }
                if (url != null && (
                    url.contains("tawk.to") ||
                    url.contains("embed.tawk.to") ||
                    url.contains("va.tawk.to") ||
                    url.contains("chat-widget")
                )) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        return false;
                    }
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                dismissSplashWhenReady();
                view.evaluateJavascript(
                    "(function(){try{localStorage.setItem('IS_NATIVE_APP','1');document.title='';}catch(e){}})();",
                    null
                );
                view.evaluateJavascript(
                    "(function(){" +
                    "var _origOpen = window.open;" +
                    "window.open = function(url, target, features){" +
                    "  if(url && typeof url === 'string' && (" +
                    "    url.indexOf('tawk.to') >= 0 ||" +
                    "    url.indexOf('embed.tawk.to') >= 0 ||" +
                    "    url.indexOf('va.tawk.to') >= 0" +
                    "  )){" +
                    "    window.location.href = url;" +
                    "    return null;" +
                    "  }" +
                    "  return _origOpen.apply(this, arguments);" +
                    "};" +
                    "})();",
                    null
                );
                view.evaluateJavascript(
                    "(function(){" +
                    "window._blobStore = window._blobStore || {};" +
                    "var _origCreate = URL.createObjectURL;" +
                    "URL.createObjectURL = function(blob){" +
                    "  var url = _origCreate.call(this, blob);" +
                    "  window._blobStore[url] = blob;" +
                    "  return url;" +
                    "};" +
                    "if(window.NativeBridge){" +
                    "  window._clippy = function(text){" +
                    "    try{window.NativeBridge.copyToClipboard(text||'');}catch(e){}" +
                    "  };" +
                    "  if(navigator.clipboard){" +
                    "    var _origWrite = navigator.clipboard.writeText.bind(navigator.clipboard);" +
                    "    navigator.clipboard.writeText = function(text){" +
                    "      window.NativeBridge.copyToClipboard(text||'');" +
                    "      return Promise.resolve();" +
                    "    };" +
                    "  } else {" +
                    "    navigator.clipboard = {writeText:function(t){window.NativeBridge.copyToClipboard(t||'');return Promise.resolve();}};" +
                    "  }" +
                    "}" +
                    "var _origCreateElement = document.createElement.bind(document);" +
                    "document.createElement = function(tag){" +
                    "  var el = _origCreateElement(tag);" +
                    "  if(tag.toLowerCase() === 'iframe'){" +
                    "    var _origSetAttr = el.setAttribute.bind(el);" +
                    "    el.setAttribute = function(name, val){" +
                    "      if(name === 'src' && val && (" +
                    "        val.indexOf('tawk.to') >= 0 || val.indexOf('embed.tawk.to') >= 0" +
                    "      )){" +
                    "        window.location.href = val;" +
                    "        return;" +
                    "      }" +
                    "      return _origSetAttr(name, val);" +
                    "    };" +
                    "    Object.defineProperty(el, 'src', {" +
                    "      set: function(v){" +
                    "        if(v && (v.indexOf('tawk.to') >= 0 || v.indexOf('embed.tawk.to') >= 0)){" +
                    "          window.location.href = v;" +
                    "          return;" +
                    "        }" +
                    "        _origSetAttr('src', v);" +
                    "      }," +
                    "      get: function(){ return el.getAttribute('src') || ''; }" +
                    "    });" +
                    "  }" +
                    "  return el;" +
                    "};" +
                    "})();",
                    null
                );
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (fileUploadCallback != null) {
                Uri[] results = null;
                if (resultCode == Activity.RESULT_OK && data != null) {
                    if (data.getClipData() != null) {
                        int count = data.getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    } else if (data.getDataString() != null) {
                        results = new Uri[]{Uri.parse(data.getDataString())};
                    }
                }
                fileUploadCallback.onReceiveValue(results);
                fileUploadCallback = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (launchedCustomTab) {
            finish();
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`;
}
