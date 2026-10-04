import React from "react";
import Link from "next/link";
import { DropletLogoIcon, TrustShieldIcon, FastDeliveryIcon, SupportHeadsetIcon } from "./Icons";

export const Header: React.FC = () => {
  return (
    <header className="w-full bg-white border-b border-slate-100/80 sticky top-0 z-40 backdrop-blur-md bg-white/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand Logo & Tagline linked to Home */}
        <Link
          href="/"
          className="flex items-center gap-2.5 group cursor-pointer transition-opacity hover:opacity-95"
        >
          <DropletLogoIcon className="w-8 h-8 sm:w-9 sm:h-9" />
          <div>
            <span className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight block leading-tight group-hover:text-[#0284C7] transition-colors">
              AquaSan
            </span>
            <span className="text-[11px] text-slate-500 font-medium tracking-wide block">
              Quality Sanitary Products
            </span>
          </div>
        </Link>

        {/* 3 Trust Badges */}
        <div className="flex items-center justify-between md:justify-end gap-4 sm:gap-8 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {/* Badge 1: Secure Payment */}
          <div className="flex items-center gap-2.5 shrink-0">
            <TrustShieldIcon className="w-6 h-6 sm:w-7 sm:h-7 text-[#0284C7]" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Secure Payment</h4>
              <p className="text-[11px] text-slate-500 font-normal">100% Safe & Secure</p>
            </div>
          </div>

          {/* Badge 2: Fast Delivery */}
          <div className="flex items-center gap-2.5 shrink-0">
            <FastDeliveryIcon className="w-6 h-6 sm:w-7 sm:h-7 text-[#0284C7]" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Fast Delivery</h4>
              <p className="text-[11px] text-slate-500 font-normal">Across India</p>
            </div>
          </div>

          {/* Badge 3: 24/7 Support */}
          <Link
            href="/contact"
            className="flex items-center gap-2.5 shrink-0 hover:opacity-85 transition-opacity"
          >
            <SupportHeadsetIcon className="w-6 h-6 sm:w-7 sm:h-7 text-[#0284C7]" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">24/7 Support</h4>
              <p className="text-[11px] text-[#0284C7] font-semibold underline decoration-dotted">We&apos;re Here to Help</p>
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
};
