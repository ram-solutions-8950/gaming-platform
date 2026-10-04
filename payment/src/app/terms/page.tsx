import React from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Terms & Conditions - AquaSan Quality Sanitaryware",
  description: "Read the commercial terms, warranty coverage, breakage transit insurance, and replacement policies for AquaSan products.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC]">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Link
            href="/"
            className="text-xs sm:text-sm font-semibold text-[#0284C7] hover:underline inline-flex items-center gap-1.5"
          >
            <span>‹</span> Back to Secure Checkout
          </Link>
        </div>

        {/* Page Header */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-10 shadow-sm mb-8">
          <span className="text-xs font-bold uppercase tracking-wider text-[#0284C7] bg-[#EBF5FF] px-3 py-1 rounded-full inline-block mb-3">
            Policy & Agreement
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Terms & Conditions
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-2">
            Last Updated: October 2026 • Effective for all orders placed through AquaSan
          </p>

          <div className="mt-8 border-t border-slate-100 pt-6 prose prose-slate max-w-none text-slate-700 text-sm sm:text-base leading-relaxed space-y-8">
            {/* Section 1 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                1. General Overview & Agreement
              </h2>
              <p className="text-slate-600 leading-relaxed">
                By purchasing through the <strong>AquaSan</strong> checkout portal, you agree to be bound by these Terms and Conditions. AquaSan supplies premium sanitaryware, bathroom furniture, mixer taps, and plumbing accessories conforming to Indian and international quality standards.
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                2. Product Specifications & Ceramic Tolerances
              </h2>
              <p className="text-slate-600 leading-relaxed">
                All sanitary ceramics (toilets, basins, cisterns) undergo high-temperature vitrification kilning. Due to the nature of vitreous china manufacturing, minor dimensional tolerances (±3mm) may occur. All chrome fixtures are triple-plated (Copper, Nickel, Chrome) with a minimum 24-hour salt-spray rating.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                3. Pricing, Taxes & Invoicing
              </h2>
              <p className="text-slate-600 leading-relaxed">
                All listed prices on the secure checkout page are inclusive of applicable Goods and Services Tax (GST) across India. An authentic GST tax invoice containing our GSTIN registration and HSN product classification will be delivered electronically and included in the physical crate packaging.
              </p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                4. Safe Transit Guarantee & Breakage Claims
              </h2>
              <p className="text-slate-600 leading-relaxed">
                Fragile sanitaryware items are shipped in multi-ply honeycomb cardboard containers reinforced with wooden pallet frames. <strong>AquaSan provides 100% Transit Breakage Insurance</strong>. In the rare event of transit damage:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1.5 text-slate-600">
                <li>You must record an unboxing video or capture clear photographs of the broken item within <strong>48 hours</strong> of package delivery.</li>
                <li>Notify our support team via our <Link href="/contact" className="text-[#0284C7] underline font-medium">Contact Desk</Link> or WhatsApp.</li>
                <li>A zero-cost express replacement will be dispatched upon image verification.</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                5. Comprehensive Warranty Coverage
              </h2>
              <p className="text-slate-600 leading-relaxed">
                Our products come backed by industry-leading warranties:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-3">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="font-bold text-[#0284C7] text-base">10 Years</div>
                  <div className="text-xs text-slate-600 mt-1">Vitreous Ceramic Glaze & Cracking Warranty</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="font-bold text-[#0284C7] text-base">7 Years</div>
                  <div className="text-xs text-slate-600 mt-1">Brass Mixer Cartridges & Chrome Anti-Peel</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="font-bold text-[#0284C7] text-base">2 Years</div>
                  <div className="text-xs text-slate-600 mt-1">LED Mirror Electricals & Cistern Valves</div>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
                6. Governing Law & Jurisdiction
              </h2>
              <p className="text-slate-600 leading-relaxed">
                These conditions are governed by and construed in accordance with the laws of the Republic of India. Any legal dispute or claims arising out of or in connection with the purchase of AquaSan products shall be subject to the exclusive jurisdiction of the competent courts in <strong>Jaipur, Rajasthan, India</strong>.
              </p>
            </section>
          </div>
        </div>

        {/* CTA Card to Return to Checkout */}
        <div className="bg-[#EBF5FF] rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 border border-sky-100">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              Ready to Complete Your Sanitary Order?
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Select your premium bathroom fittings and checkout with 100% bank-grade encryption.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 px-6 py-3 bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold rounded-xl text-sm transition shadow-sm"
          >
            Go to Checkout Store
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
