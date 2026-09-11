package com.corona888.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenOrientationPlugin.class);
        super.onCreate(savedInstanceState);

        applyEdgeToEdgeAndImmersive();

        // Inject direct JavaScript Interfaces into the WebView for zero-latency native access
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(Color.BLACK);
            WebSettings settings = webView.getSettings();

            // Lock text zoom to 100% so user device font scaling does not distort game layouts
            settings.setTextZoom(100);
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);

            webView.addJavascriptInterface(new NativeOrientationBridge(), "AndroidOrientation");
            webView.addJavascriptInterface(new NativeAuthBridge(), "AndroidAuth");
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyEdgeToEdgeAndImmersive();
        }
    }

    private void applyEdgeToEdgeAndImmersive() {
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                getWindow().setAttributes(lp);
            }

            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            getWindow().setStatusBarColor(Color.BLACK);
            getWindow().setNavigationBarColor(Color.BLACK);
            getWindow().getDecorView().setBackgroundColor(Color.BLACK);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                View decorView = getWindow().getDecorView();
                int uiOptions = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
                decorView.setSystemUiVisibility(uiOptions);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        notifyWebAudioPause();
    }

    @Override
    public void onStop() {
        super.onStop();
        notifyWebAudioPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        notifyWebAudioResume();
    }

    @Override
    public void onDestroy() {
        notifyWebAudioPause();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.evaluateJavascript(
                    "(function() { " +
                    "  try { " +
                    "    if (typeof window.__onAndroidBackPressed === 'function') { " +
                    "      return window.__onAndroidBackPressed() ? 'HANDLED' : 'EXIT'; " +
                    "    } " +
                    "  } catch(e) {} " +
                    "  return 'EXIT'; " +
                    "})()",
                    new ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String value) {
                            if (value == null || !value.contains("HANDLED")) {
                                runOnUiThread(() -> moveTaskToBack(true));
                            }
                        }
                    }
                );
                return;
            }
        } catch (Exception ignored) {}
        moveTaskToBack(true);
    }

    private void notifyWebAudioPause() {
        runOnUiThread(() -> {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "try { if (window.__onAndroidPause) { window.__onAndroidPause(); } else if (window.soundManager && window.soundManager.pauseAll) { window.soundManager.pauseAll(); } } catch(e) {}",
                        null
                    );
                    getBridge().getWebView().onPause();
                    getBridge().getWebView().pauseTimers();
                }
            } catch (Exception ignored) {}
        });
    }

    private void notifyWebAudioResume() {
        runOnUiThread(() -> {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().onResume();
                    getBridge().getWebView().resumeTimers();
                    getBridge().getWebView().evaluateJavascript(
                        "try { if (window.__onAndroidResume) { window.__onAndroidResume(); } else if (window.soundManager && window.soundManager.resumeFromBackground) { window.soundManager.resumeFromBackground(); } } catch(e) {}",
                        null
                    );
                }
            } catch (Exception ignored) {}
        });
    }

    public class NativeOrientationBridge {
        @JavascriptInterface
        public void setPortrait() {
            runOnUiThread(() -> {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            });
        }

        @JavascriptInterface
        public void lockPortrait() {
            runOnUiThread(() -> {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            });
        }

        @JavascriptInterface
        public void setLandscape() {
            runOnUiThread(() -> {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            });
        }

        @JavascriptInterface
        public void lockLandscape() {
            runOnUiThread(() -> {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            });
        }

        @JavascriptInterface
        public void unlockOrientation() {
            runOnUiThread(() -> {
                // Default app state is strictly landscape locked
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            });
        }
    }

    public class NativeAuthBridge {
        private static final String PREFS_NAME = "Corona888AuthPrefs";
        private static final String KEY_ACCESS = "access_token";
        private static final String KEY_REFRESH = "refresh_token";
        private static final String KEY_USER = "cached_user";

        private SharedPreferences getPrefs() {
            return getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        }

        @JavascriptInterface
        public String getAccessToken() {
            return getPrefs().getString(KEY_ACCESS, "");
        }

        @JavascriptInterface
        public String getRefreshToken() {
            return getPrefs().getString(KEY_REFRESH, "");
        }

        @JavascriptInterface
        public String getCachedUser() {
            return getPrefs().getString(KEY_USER, "");
        }

        @JavascriptInterface
        public void setTokens(String access, String refresh) {
            getPrefs().edit()
                .putString(KEY_ACCESS, access != null ? access : "")
                .putString(KEY_REFRESH, refresh != null ? refresh : "")
                .apply();
        }

        @JavascriptInterface
        public void setCachedUser(String userJson) {
            getPrefs().edit()
                .putString(KEY_USER, userJson != null ? userJson : "")
                .apply();
        }

        @JavascriptInterface
        public void clearTokens() {
            getPrefs().edit()
                .remove(KEY_ACCESS)
                .remove(KEY_REFRESH)
                .remove(KEY_USER)
                .apply();
        }
    }
}
