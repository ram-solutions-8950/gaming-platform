"use client";

import React, { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SecureEncryptedIcon, TrustShieldIcon } from "@/components/Icons";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Cashfree: any;
  }
}

function loadCashfreeSDK(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Cashfree) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function PayContent() {
  const searchParams = useSearchParams();
  const sessionId =
    searchParams.get("session_id") ||
    searchParams.get("payment_session_id") ||
    "";
  const orderId = searchParams.get("order_id") || "";
  const mode = searchParams.get("mode") || "production";
  const rawAmount = searchParams.get("amount") || "";
  const returnUrl = searchParams.get("return_url") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const hasTriggeredRef = useRef(false);

  const amountDisplay = rawAmount
    ? (Number(rawAmount) > 100 ? (Number(rawAmount) / 100).toFixed(2) : Number(rawAmount).toFixed(2))
    : "";

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!sessionId) {
        setError("Missing Cashfree payment session ID.");
        setLoading(false);
        return;
      }

      try {
        const loaded = await loadCashfreeSDK();
        if (!loaded || !window.Cashfree) {
          throw new Error("Failed to load Cashfree payment SDK.");
        }

        if (isMounted) {
          setSdkReady(true);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to initialize payment gateway.");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const handleStartPayment = async () => {
    if (!sessionId || !window.Cashfree) return;
    setError(null);
    setLoading(true);

    try {
      const cashfree = window.Cashfree({
        mode: mode === "sandbox" ? "sandbox" : "production",
      });

      // Checkout via direct redirect / self-target so payment happens on the whitelisted web domain
      await cashfree.checkout({
        paymentSessionId: sessionId,
        redirectTarget: "_self",
      });
    } catch (err: any) {
      setError(err.message || "Failed to open Cashfree checkout.");
      setLoading(false);
    }
  };

  // Auto-trigger payment once SDK is ready
  useEffect(() => {
    if (sdkReady && sessionId && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      const timer = setTimeout(() => {
        handleStartPayment();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [sdkReady, sessionId]);

  return (
    <div className="max-w-md mx-auto my-8 sm:my-14 p-6 bg-white rounded-2xl shadow-xl border border-slate-100">
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-sky-50 rounded-2xl flex items-center justify-center text-[#0284C7] mb-4 shadow-sm">
          <TrustShieldIcon className="w-8 h-8" />
        </div>

        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Secure Payment Gateway
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Poland Exim &bull; AquaSan Merchant Portal
        </p>

        {orderId && (
          <div className="mt-5 w-full bg-slate-50 rounded-xl p-3.5 border border-slate-100 flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Order Reference:</span>
            <span className="font-mono font-semibold text-slate-800 break-all">
              {orderId}
            </span>
          </div>
        )}

        {amountDisplay && (
          <div className="mt-2 w-full bg-sky-50/60 rounded-xl p-3.5 border border-sky-100 flex justify-between items-center text-sm">
            <span className="text-slate-600 font-medium">Amount to Pay:</span>
            <span className="text-xl font-black text-sky-600">
              ₹{amountDisplay}
            </span>
          </div>
        )}

        {error ? (
          <div className="mt-6 w-full p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-left">
            <p className="font-bold">Payment Error</p>
            <p className="mt-1">{error}</p>
            <button
              onClick={handleStartPayment}
              className="mt-3 w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition"
            >
              Retry Payment
            </button>
          </div>
        ) : loading ? (
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-700">
              Opening secure Cashfree checkout...
            </p>
            <p className="text-xs text-slate-400">
              Please do not close or refresh this page.
            </p>
          </div>
        ) : (
          <div className="mt-6 w-full space-y-3">
            <button
              onClick={handleStartPayment}
              className="w-full py-3.5 bg-[#0284C7] hover:bg-[#0369a1] text-white font-extrabold rounded-xl shadow-lg shadow-sky-500/25 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <SecureEncryptedIcon className="w-5 h-5" />
              <span>Proceed to Cashfree Checkout</span>
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-100 w-full flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <SecureEncryptedIcon className="w-4 h-4 text-emerald-500" />
          <span>256-Bit SSL Encrypted &bull; PCI-DSS Compliant</span>
        </div>

        {returnUrl && (
          <a
            href={returnUrl}
            className="mt-4 text-xs font-semibold text-slate-500 hover:text-slate-800 underline"
          >
            Return to App
          </a>
        )}
      </div>
    </div>
  );
}

export default function PayPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC]">
      <Header />
      <main className="flex-1 px-4 flex items-center justify-center">
        <Suspense
          fallback={
            <div className="py-20 text-center text-sm font-medium text-slate-500">
              Loading payment...
            </div>
          }
        >
          <PayContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
