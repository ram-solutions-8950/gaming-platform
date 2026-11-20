/**
 * Shared shell for the legal policy pages.
 *
 * Every policy renders the same header, breadcrumb and contact block, so
 * the registered business name, address and contact details are stated
 * identically on all of them and come from one record rather than being
 * retyped per page.
 */
import React from "react";
import Link from "next/link";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { COMPANY } from "@/data/company";

interface PolicyPageProps {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}

export const PolicySection: React.FC<{ heading: string; children: React.ReactNode }> = ({
  heading,
  children,
}) => (
  <section>
    <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">{heading}</h2>
    <div className="text-slate-600 leading-relaxed space-y-2">{children}</div>
  </section>
);

export const PolicyPage: React.FC<PolicyPageProps> = ({
  eyebrow,
  title,
  lastUpdated,
  intro,
  children,
}) => (
  <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC]">
    <Header />

    <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full">
      <div className="mb-6">
        <Link
          href="/"
          className="text-xs sm:text-sm font-semibold text-[#0284C7] hover:underline inline-flex items-center gap-1.5"
        >
          <span>‹</span> Back to Secure Checkout
        </Link>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-10 shadow-sm mb-8">
        <span className="text-xs font-bold uppercase tracking-wider text-[#0284C7] bg-[#EBF5FF] px-3 py-1 rounded-full inline-block mb-3">
          {eyebrow}
        </span>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          {title}
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-2">
          Last Updated: {lastUpdated} • {COMPANY.legalName}
        </p>

        {intro && (
          <p className="mt-4 text-sm text-slate-600 leading-relaxed">{intro}</p>
        )}

        <div className="mt-8 border-t border-slate-100 pt-6 text-sm sm:text-base space-y-8">
          {children}

          <section>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
              Contact Us
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Questions about this policy can be sent to our support desk:
            </p>
            <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-700 space-y-1">
              <p className="font-semibold text-slate-900">{COMPANY.legalName}</p>
              <p>{COMPANY.addressLine}</p>
              <p>
                Email:{" "}
                <a href={`mailto:${COMPANY.email}`} className="text-[#0284C7] underline break-all">
                  {COMPANY.email}
                </a>
              </p>
              <p>
                Phone:{" "}
                <a href={`tel:${COMPANY.phone}`} className="text-[#0284C7] underline">
                  {COMPANY.phoneDisplay}
                </a>
              </p>
              <p className="text-slate-500">{COMPANY.supportHours}</p>
            </div>
          </section>
        </div>
      </div>
    </main>

    <Footer />
  </div>
);
