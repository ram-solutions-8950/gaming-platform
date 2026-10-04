package com.corona888.app;

import com.cashfree.pg.api.CFPaymentGatewayService;
import com.cashfree.pg.core.api.CFSession;
import com.cashfree.pg.core.api.callback.CFCheckoutResponseCallback;
import com.cashfree.pg.core.api.exception.CFException;
import com.cashfree.pg.core.api.utils.CFErrorResponse;
import com.cashfree.pg.core.api.webcheckout.CFWebCheckoutPayment;
import com.cashfree.pg.core.api.webcheckout.CFWebCheckoutTheme;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CashfreeCheckout")
public class CashfreeCheckoutPlugin extends Plugin implements CFCheckoutResponseCallback {
    private PluginCall pendingCheckoutCall;

    @Override
    public void load() {
        try {
            CFPaymentGatewayService.getInstance().setCheckoutCallback(this);
        } catch (CFException exception) {
            android.util.Log.e("CashfreeCheckout", "Failed to register Cashfree callback", exception);
        }
    }

    @PluginMethod
    public void startCheckout(PluginCall call) {
        String orderId = call.getString("orderId");
        String paymentSessionId = call.getString("paymentSessionId");
        String mode = call.getString("mode", "sandbox");
        if (orderId == null || orderId.trim().isEmpty() || paymentSessionId == null || paymentSessionId.trim().isEmpty()) {
            call.reject("Cashfree order ID and payment session are required.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                CFSession.Environment environment = "production".equalsIgnoreCase(mode)
                    ? CFSession.Environment.PRODUCTION
                    : CFSession.Environment.SANDBOX;
                CFSession session = new CFSession.CFSessionBuilder()
                    .setEnvironment(environment)
                    .setPaymentSessionID(paymentSessionId)
                    .setOrderId(orderId)
                    .build();
                CFWebCheckoutTheme theme = new CFWebCheckoutTheme.CFWebCheckoutThemeBuilder()
                    .setNavigationBarBackgroundColor("#35116b")
                    .setNavigationBarTextColor("#ffffff")
                    .build();
                CFWebCheckoutPayment payment = new CFWebCheckoutPayment.CFWebCheckoutPaymentBuilder()
                    .setSession(session)
                    .setCFWebCheckoutUITheme(theme)
                    .build();

                pendingCheckoutCall = call;
                call.setKeepAlive(true);
                CFPaymentGatewayService gateway = CFPaymentGatewayService.getInstance();
                gateway.setCheckoutCallback(this);
                gateway.doPayment(getActivity(), payment);
            } catch (CFException exception) {
                pendingCheckoutCall = null;
                call.setKeepAlive(false);
                call.reject("Unable to launch Cashfree checkout: " + exception.getMessage());
            } catch (Exception exception) {
                pendingCheckoutCall = null;
                call.setKeepAlive(false);
                call.reject("Unable to launch Cashfree checkout.", exception);
            }
        });
    }

    @Override
    public void onPaymentVerify(String orderId) {
        PluginCall call = pendingCheckoutCall;
        pendingCheckoutCall = null;
        if (call == null) return;

        call.setKeepAlive(false);
        JSObject result = new JSObject();
        result.put("orderId", orderId);
        result.put("status", "COMPLETED");
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).restoreLandscapeAfterExternalActivity();
        }
        call.resolve(result);
    }

    @Override
    public void onPaymentFailure(CFErrorResponse error, String orderId) {
        PluginCall call = pendingCheckoutCall;
        pendingCheckoutCall = null;
        if (call == null) return;

        call.setKeepAlive(false);
        String message = error != null && error.getMessage() != null
            ? error.getMessage()
            : "Cashfree payment was cancelled or failed.";
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).restoreLandscapeAfterExternalActivity();
        }
        call.reject(message);
    }
}