import React from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ContactForm } from "./ContactForm";
import { PhoneIcon, MailIcon, MapPinIcon, ClockIcon } from "@/components/Icons";

export const metadata = {
  title: "Contact Us - AquaSan Customer Support & Showroom",
  description: "Reach AquaSan for sanitary product consultations, order updates, warranty service, and wholesale quotes.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC]">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full">
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
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Get in Touch with <span className="text-[#0284C7]">AquaSan</span>
          </h1>
          <p className="text-slate-500 text-sm sm:text-base mt-2.5">
            Whether you have questions regarding fitting specifications, transit timelines, or customized bathroom layouts, our sanitary experts are ready to assist.
          </p>
        </div>

        {/* Two-Column Grid: Left Contact Info, Right Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Direct Info & Showroom (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Helpline Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-sky-50 text-[#0284C7] flex items-center justify-center shrink-0">
                <PhoneIcon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-slate-900 text-base">Direct Customer Helpline</h4>
                <p className="text-xs text-slate-500 mt-0.5">Toll-free across India for orders & support</p>
                <a
                  href="tel:+919876543210"
                  className="inline-block mt-2 font-bold text-base text-[#0284C7] hover:underline"
                >
                  +91 98765 43210
                </a>
              </div>
            </div>

            {/* Email Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-sky-50 text-[#0284C7] flex items-center justify-center shrink-0">
                <MailIcon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-slate-900 text-base">Official Support Email</h4>
                <p className="text-xs text-slate-500 mt-0.5">Send architectural drawings or order details</p>
                <a
                  href="mailto:support@aquasan.com"
                  className="inline-block mt-2 font-bold text-base text-[#0284C7] hover:underline"
                >
                  support@aquasan.com
                </a>
              </div>
            </div>

            {/* Corporate Location */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-sky-50 text-[#0284C7] flex items-center justify-center shrink-0">
                <MapPinIcon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-slate-900 text-base">Showroom & Warehouse</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  AquaSan Sanitaryware Ltd., Plot 42, Sitapura Industrial Complex, Jaipur, Rajasthan 302022
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-600 mt-2">
                  <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Mon – Sat: 9:00 AM – 7:00 PM</span>
                </div>
              </div>
            </div>

            {/* WhatsApp Support Highlight Box */}
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-md">
              <h4 className="font-bold text-lg">Need Instant WhatsApp Assistance?</h4>
              <p className="text-emerald-100 text-xs mt-1 leading-relaxed">
                Connect with our product technicians right away for installation guidance or invoice copies.
              </p>
              <a
                href="https://wa.me/919876543210"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 bg-white text-emerald-700 hover:bg-emerald-50 font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition shadow-xs"
              >
                <span>Chat on WhatsApp</span>
                <span>→</span>
              </a>
            </div>
          </div>

          {/* Right Column: Contact Form (7 cols) */}
          <div className="lg:col-span-7">
            <ContactForm />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
