package com.corona888.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenOrientationPlugin.class);
        super.onCreate(savedInstanceState);

        // Inject direct JavaScript Interfaces into the WebView for zero-latency native access
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new NativeOrientationBridge(), "AndroidOrientation");
            getBridge().getWebView().addJavascriptInterface(new NativeAuthBridge(), "AndroidAuth");
        }
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
        public void setLandscape() {
            runOnUiThread(() -> {
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
