import React from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PaymentTicketLookup } from "./PaymentTicketLookup";
import { PhoneIcon, MailIcon, SecureEncryptedIcon } from "@/components/Icons";

export const metadata = {
  title: "Payment Issues & Resolution Desk - AquaSan",
  description: "Instant resolution for deducted amounts, pending UPI transactions, failed card payments, and refund tracking at AquaSan.",
};

export default function PaymentIssuesPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC]">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Link
            href="/"
            className="text-xs sm:text-sm font-semibold text-[#0284C7] hover:underline inline-flex items-center gap-1.5"
          >
            <span>‹</span> Back to Secure Checkout
          </Link>
        </div>

        {/* Page Hero Title */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-[#0284C7] bg-[#EBF5FF] px-3 py-1 rounded-full inline-block mb-3">
            Financial Support & Grievance
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Payment Resolution Desk
          </h1>
          <p className="text-slate-500 text-sm sm:text-base mt-2.5">
            100% money-back safety guarantee. If your bank account was debited, your money is completely safe and tracked.
          </p>
        </div>

        {/* Live Lookup Tool */}
        <div className="mb-10">
          <PaymentTicketLookup />
        </div>

        {/* 4 Diagnostic Resolution Guidance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Issue 1 */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 font-bold text-xs flex items-center justify-center shrink-0">
                01
              </span>
              <h3 className="font-bold text-slate-900 text-base">
                Money Deducted but No Order ID?
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              During peak bank traffic, the issuing bank debits your balance before our payment gateway receives confirmation. Our auto-reconciliation engine checks bank webhooks every 15 minutes. If confirmation reaches us, your order is automatically activated and SMS confirmation sent. If not confirmed within 2 hours, your bank initiates an automated reversal.
            </p>
          </div>

          {/* Issue 2 */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-7 h-7 rounded-lg bg-sky-50 text-[#0284C7] font-bold text-xs flex items-center justify-center shrink-0">
                02
              </span>
              <h3 className="font-bold text-slate-900 text-base">
                UPI Marked &quot;Payment Pending&quot;?
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Under National Payments Corporation of India (NPCI) guidelines, pending UPI transactions are held in escrow for up to 48 hours. Please do <strong>not</strong> re-attempt the payment immediately. Check your UPI app (PhonePe, GPay, Paytm) for final status settlement.
            </p>
          </div>

          {/* Issue 3 */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 font-bold text-xs flex items-center justify-center shrink-0">
                03
              </span>
              <h3 className="font-bold text-slate-900 text-base">
                Debit / Credit Card Transaction Failed?
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Card failures usually occur due to RBI Mandate e-commerce toggles or 3D Secure OTP timeouts. Ensure online e-commerce transactions are enabled in your mobile banking app, your card has sufficient transaction limits, and try again or use instant UPI.
            </p>
          </div>

          {/* Issue 4 */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 font-bold text-xs flex items-center justify-center shrink-0">
                04
              </span>
              <h3 className="font-bold text-slate-900 text-base">
                Standard Refund Turnaround Timelines
              </h3>
            </div>
            <div className="space-y-2 text-xs sm:text-sm text-slate-600 mt-2">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span>UPI / Net Banking Reversals</span>
                <span className="font-bold text-slate-900">2 to 24 Hours</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span>Debit Card (Mastercard, Visa, RuPay)</span>
                <span className="font-bold text-slate-900">2 to 4 Working Days</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Credit Card Statements</span>
                <span className="font-bold text-slate-900">3 to 5 Working Days</span>
              </div>
            </div>
          </div>
        </div>

        {/* Priority Escalation Helpline Banner */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-3xl p-6 sm:p-10 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs font-semibold">
              <SecureEncryptedIcon className="w-3.5 h-3.5" />
              <span>Dedicated Financial Grievance Officer</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold">
              Still Need Help with a Payment?
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-lg">
              Contact our direct billing desk with your Bank UTR or Transaction Screenshot. We will coordinate directly with the clearing bank.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <a
              href="tel:+919876543210"
              className="w-full sm:w-auto px-5 py-3 bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-sm"
            >
              <PhoneIcon className="w-4 h-4" />
              <span>Call Billing Desk</span>
            </a>
            <a
              href="mailto:support@aquasan.com?subject=Urgent%20Payment%20Issue%20Grievance"
              className="w-full sm:w-auto px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2 border border-white/20"
            >
              <MailIcon className="w-4 h-4" />
              <span>Email Proof</span>
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
