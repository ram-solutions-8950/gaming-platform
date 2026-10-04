"use client";

import React, { useState } from "react";

export const PaymentTicketLookup: React.FC = () => {
  const [queryRef, setQueryRef] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    found: boolean;
    ref: string;
    status: string;
    amount: string;
    gateway: string;
    timestamp: string;
    message: string;
  } | null>(null);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryRef.trim()) return;

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      // Generate clean lookup simulation
      setLookupResult({
        found: true,
        ref: queryRef.toUpperCase(),
        status: "Captured & Reconciled",
        amount: "₹4,999",
        gateway: "Unified Payments Interface (UPI)",
        timestamp: "Today, 14:15 IST",
        message: "Your payment was successfully settled by your bank. Order shipment is currently being packed in our warehouse.",
      });
    }, 800);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-sky-50 text-[#0284C7] flex items-center justify-center shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 leading-tight">
            Live Payment Status & UTR Verification
          </h3>
          <p className="text-xs text-slate-500">
            Enter your Bank UTR (12 digits) or AquaSan Order ID to check instant gateway status
          </p>
        </div>
      </div>

      <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3 mt-4">
        <input
          type="text"
          value={queryRef}
          onChange={(e) => setQueryRef(e.target.value)}
          placeholder="e.g. 428910482910 or AQ-2026-89419"
          required
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-3 bg-[#0284C7] hover:bg-[#0369A1] active:scale-[0.99] disabled:opacity-75 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Checking...</span>
            </>
          ) : (
            <span>Verify Status</span>
          )}
        </button>
      </form>

      {/* Result Display */}
      {lookupResult && (
        <div className="mt-6 p-4 sm:p-5 bg-[#F8FAFC] rounded-xl border border-slate-200 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <span className="text-xs text-slate-500">Reference: <strong className="text-slate-800 font-mono">{lookupResult.ref}</strong></span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              {lookupResult.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-3 text-xs text-slate-600 border-b border-slate-200">
            <div>
              <span className="block text-slate-400">Amount</span>
              <strong className="text-sm text-slate-900 font-bold">{lookupResult.amount}</strong>
            </div>
            <div>
              <span className="block text-slate-400">Gateway Channel</span>
              <strong className="text-sm text-slate-900">{lookupResult.gateway}</strong>
            </div>
            <div>
              <span className="block text-slate-400">Verified Timestamp</span>
              <strong className="text-sm text-slate-900">{lookupResult.timestamp}</strong>
            </div>
          </div>

          <p className="text-xs text-slate-600 pt-3 leading-relaxed">
            {lookupResult.message}
          </p>
        </div>
      )}
    </div>
  );
};
