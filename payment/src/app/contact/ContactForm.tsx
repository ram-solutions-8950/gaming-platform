"use client";

import React, { useState } from "react";

export const ContactForm: React.FC = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    inquiryType: "Product Specifications & Compatibility",
    orderId: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    // Simple validation
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      setErrorMessage("Please fill in all required fields.");
      return;
    }

    if (formData.phone && !/^[6-9]\d{9}$/.test(formData.phone.replace(/[\s-]/g, ""))) {
      setErrorMessage("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    setIsSubmitting(true);

    // Simulate safe API submission
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 900);
  };

  if (isSuccess) {
    return (
      <div className="bg-white rounded-2xl border border-emerald-200 p-8 text-center shadow-sm">
        <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-slate-900">Message Received!</h3>
        <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
          Thank you, <strong className="text-slate-800">{formData.name}</strong>. Your inquiry regarding{" "}
          <strong className="text-slate-800">{formData.inquiryType}</strong> has been assigned Ticket{" "}
          <strong className="text-[#0284C7] font-mono">#AQ-{(Math.random() * 90000 + 10000).toFixed(0)}</strong>.
          Our sanitary specialist will respond within 4 business hours.
        </p>
        <button
          type="button"
          onClick={() => {
            setIsSuccess(false);
            setFormData({
              name: "",
              email: "",
              phone: "",
              inquiryType: "Product Specifications & Compatibility",
              orderId: "",
              message: "",
            });
          }}
          className="mt-6 px-6 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white font-medium text-sm rounded-xl transition cursor-pointer"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-5">
      <h3 className="text-lg sm:text-xl font-bold text-slate-900 border-b border-slate-100 pb-3">
        Send Us a Message
      </h3>

      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs sm:text-sm font-medium">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Full Name */}
        <div>
          <label htmlFor="name" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Full Name <span className="text-rose-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Rahul Sharma"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Email Address <span className="text-rose-500">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={formData.email}
            onChange={handleChange}
            placeholder="e.g. rahul@example.com"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Phone */}
        <div>
          <label htmlFor="phone" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Phone Number (10 digits)
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            placeholder="e.g. 9876543210"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition"
          />
        </div>

        {/* Order ID */}
        <div>
          <label htmlFor="orderId" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Order Reference ID (Optional)
          </label>
          <input
            id="orderId"
            name="orderId"
            type="text"
            value={formData.orderId}
            onChange={handleChange}
            placeholder="e.g. AQ-2026-89419"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Inquiry Type */}
      <div>
        <label htmlFor="inquiryType" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Inquiry Department <span className="text-rose-500">*</span>
        </label>
        <select
          id="inquiryType"
          name="inquiryType"
          value={formData.inquiryType}
          onChange={handleChange}
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition bg-white"
        >
          <option value="Product Specifications & Compatibility">Product Specifications & Compatibility</option>
          <option value="Order Dispatch & Delivery Status">Order Dispatch & Delivery Status</option>
          <option value="Payment Assistance & Invoice Request">Payment Assistance & Invoice Request</option>
          <option value="Warranty & Replacement Claim">Warranty & Replacement Claim</option>
          <option value="Bulk / Contractor / Architect Inquiry">Bulk / Contractor / Architect Inquiry</option>
        </select>
      </div>

      {/* Message */}
      <div>
        <label htmlFor="message" className="block text-xs font-semibold text-slate-700 mb-1.5">
          Your Message <span className="text-rose-500">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          required
          value={formData.message}
          onChange={handleChange}
          placeholder="Please describe how we can assist you..."
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-transparent transition"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3.5 px-6 bg-[#0284C7] hover:bg-[#0369A1] active:scale-[0.99] disabled:opacity-70 text-white font-semibold rounded-xl text-sm sm:text-base flex items-center justify-center gap-2 shadow-md shadow-sky-600/20 transition cursor-pointer"
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Submitting Message...</span>
          </>
        ) : (
          <span>Send Inquiry</span>
        )}
      </button>
    </form>
  );
};
