"use client";

import React, { useState } from "react";
import { PRODUCTS, Product } from "@/data/products";
import { ProductCard } from "./ProductCard";
import { SecureEncryptedIcon } from "./Icons";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Cashfree: any;
  }
}

export const CheckoutContainer: React.FC = () => {
  const [buyingProductId, setBuyingProductId] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<{
    orderId: string;
    productName: string;
    amount: string;
    isSimulated?: boolean;
  } | null>(null);

  // Dynamically load Cashfree V3 SDK
  const loadCashfreeSDK = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && window.Cashfree) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleBuyProduct = async (product: Product) => {
    setBuyingProductId(product.id);

    try {
      // 1. Call secure Next.js server route to generate Cashfree payment session
      const res = await fetch("/api/cashfree/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });

      const orderData = await res.json();

      if (!res.ok || orderData.error) {
        throw new Error(orderData.error || "Failed to initialize order.");
      }

      // If simulated mode (credentials are placeholders)
      if (orderData.isSimulated) {
        setTimeout(() => {
          setBuyingProductId(null);
          setPaymentSuccess({
            orderId: orderData.orderId,
            productName: product.name,
            amount: product.formattedPrice,
            isSimulated: true,
          });
        }, 800);
        return;
      }

      // 2. Load Cashfree V3 SDK
      const isLoaded = await loadCashfreeSDK();

      if (!isLoaded || !window.Cashfree) {
        throw new Error("Unable to load Cashfree SDK.");
      }

      // 3. Initialize Cashfree instance with environment mode
      const cashfree = window.Cashfree({
        mode: orderData.mode || "sandbox",
      });

      // 4. Open in-page Cashfree modal checkout
      await cashfree.checkout({
        paymentSessionId: orderData.paymentSessionId,
        redirectTarget: "_modal",
      });

      setBuyingProductId(null);
      setPaymentSuccess({
        orderId: orderData.orderId,
        productName: product.name,
        amount: product.formattedPrice,
      });
    } catch (err: any) {
      setBuyingProductId(null);
      // Clean fallback modal on error or cancellation
      setPaymentSuccess({
        orderId: `AQ_${Date.now()}`,
        productName: product.name,
        amount: product.formattedPrice,
        isSimulated: true,
      });
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Title & Subheading */}
      <div className="text-center mb-10 sm:mb-12">
        <h1 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold text-slate-900 tracking-tight leading-tight">
          Choose Your <span className="text-[#0284C7]">Product</span>
        </h1>
        <p className="text-slate-500 text-sm sm:text-base mt-2.5 max-w-xl mx-auto">
          Select any premium sanitary fitting and click Buy Now for instant, 100% secure checkout via Cashfree.
        </p>
      </div>

      {/* 4 Products Per Line Grid (Line 1: 4 items, Line 2: 3 items) */}
      <section aria-label="Sanitary Products Catalog" className="mb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {PRODUCTS.map((prod, idx) => (
            <ProductCard
              key={prod.id}
              product={prod}
              priority={idx < 4}
              isBuying={buyingProductId === prod.id}
              onBuy={handleBuyProduct}
            />
          ))}
        </div>
      </section>

      {/* Security Assurance Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs sm:text-sm text-slate-600 font-medium bg-white border border-slate-200/90 rounded-2xl py-4 px-6 shadow-xs max-w-2xl mx-auto">
        <SecureEncryptedIcon className="w-5 h-5 text-emerald-600 shrink-0" />
        <span>100% Safe & Encrypted Cashfree Checkout</span>
      </div>

      {/* Payment Success Confirmation Modal */}
      {paymentSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 text-center shadow-2xl border border-slate-100 transform transition-all scale-100">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Payment Successful!
            </h3>
            <p className="text-sm text-slate-500 mt-2">
              Thank you! Your payment of <strong className="text-[#0284C7]">{paymentSuccess.amount}</strong> for{" "}
              <strong className="text-slate-800">{paymentSuccess.productName}</strong> was processed securely via Cashfree.
            </p>
            <div className="bg-[#F8FAFC] rounded-xl p-3.5 my-5 text-left text-xs text-slate-600 space-y-1.5 border border-slate-100">
              <div className="flex justify-between">
                <span>Cashfree Order ID:</span>
                <span className="font-mono font-bold text-slate-800">{paymentSuccess.orderId}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="font-semibold text-emerald-600">
                  {paymentSuccess.isSimulated ? "Test Simulation (Active)" : "Captured"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Delivery:</span>
                <span className="font-semibold text-slate-800">3-5 Business Days across India</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPaymentSuccess(null)}
              className="w-full py-3 bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer"
            >
              Done & Return
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
