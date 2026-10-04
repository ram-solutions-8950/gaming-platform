import React from "react";
import Link from "next/link";
import {
  DropletLogoIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  ClockIcon,
  FacebookIcon,
  InstagramIcon,
  YoutubeIcon,
  LinkedinIcon,
} from "./Icons";

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-[#F8FAFC] border-t border-slate-200 mt-16 sm:mt-24 text-slate-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
        {/* Upper 3-Column Streamlined Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 pb-12 border-b border-slate-200/80">
          {/* Column 1: Brand Info & Socials */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2.5 inline-flex">
              <DropletLogoIcon className="w-8 h-8" />
              <div>
                <span className="text-xl font-extrabold text-slate-900 tracking-tight block leading-tight">
                  AquaSan
                </span>
                <span className="text-[11px] text-slate-500 font-medium tracking-wide block">
                  Quality Sanitary Products
                </span>
              </div>
            </Link>

            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-sm">
              Premium sanitary and bath fittings for modern homes. Engineered for durability, luxury, and unmatched hygiene.
            </p>

            {/* Social Icons */}
            <div className="flex items-center gap-2.5 pt-1">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="w-8 h-8 rounded-full bg-sky-100/70 hover:bg-[#0284C7] text-[#0284C7] hover:text-white flex items-center justify-center transition-all duration-200"
              >
                <FacebookIcon className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-8 h-8 rounded-full bg-sky-100/70 hover:bg-[#0284C7] text-[#0284C7] hover:text-white flex items-center justify-center transition-all duration-200"
              >
                <InstagramIcon className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="w-8 h-8 rounded-full bg-sky-100/70 hover:bg-[#0284C7] text-[#0284C7] hover:text-white flex items-center justify-center transition-all duration-200"
              >
                <YoutubeIcon className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="w-8 h-8 rounded-full bg-sky-100/70 hover:bg-[#0284C7] text-[#0284C7] hover:text-white flex items-center justify-center transition-all duration-200"
              >
                <LinkedinIcon className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Column 2: Customer Care & Policies */}
          <div>
            <h4 className="font-bold text-sm sm:text-base text-slate-900 mb-4">
              Customer Support & Policies
            </h4>
            <ul className="space-y-3 text-xs sm:text-sm text-slate-600">
              <li>
                <Link
                  href="/contact"
                  className="hover:text-[#0284C7] transition-colors flex items-center gap-1.5"
                >
                  <span className="text-[#0284C7] font-bold">›</span>
                  Contact Us & Showroom
                </Link>
              </li>
              <li>
                <Link
                  href="/payment-issues"
                  className="hover:text-[#0284C7] transition-colors flex items-center gap-1.5"
                >
                  <span className="text-[#0284C7] font-bold">›</span>
                  Payment Issues & Grievance Desk
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="hover:text-[#0284C7] transition-colors flex items-center gap-1.5"
                >
                  <span className="text-[#0284C7] font-bold">›</span>
                  Terms & Conditions (Warranty & Returns)
                </Link>
              </li>
              <li>
                <Link
                  href="/"
                  className="hover:text-[#0284C7] transition-colors flex items-center gap-1.5"
                >
                  <span className="text-[#0284C7] font-bold">›</span>
                  Sanitary Checkout Store
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact Details & Office */}
          <div>
            <h4 className="font-bold text-sm sm:text-base text-slate-900 mb-4">
              Get in Touch
            </h4>
            <ul className="space-y-3 text-xs sm:text-sm text-slate-600">
              <li className="flex items-center gap-2.5">
                <span className="text-[#0284C7] shrink-0">
                  <PhoneIcon className="w-4 h-4" />
                </span>
                <a href="tel:+919876543210" className="hover:text-[#0284C7] font-semibold text-slate-800">
                  +91 98765 43210
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="text-[#0284C7] shrink-0">
                  <MailIcon className="w-4 h-4" />
                </span>
                <a href="mailto:support@aquasan.com" className="hover:text-[#0284C7] font-medium text-slate-700">
                  support@aquasan.com
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-[#0284C7] shrink-0 mt-0.5">
                  <MapPinIcon className="w-4 h-4" />
                </span>
                <span className="text-slate-600">Industrial Area, Sitapura, Jaipur, Rajasthan 302022</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="text-[#0284C7] shrink-0">
                  <ClockIcon className="w-4 h-4" />
                </span>
                <span className="text-slate-600">Mon - Sat: 9:00 AM - 7:00 PM</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Lower Bottom Copyright Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© 2026 AquaSan. All rights reserved.</p>
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap justify-center font-medium">
            <Link href="/terms" className="hover:text-[#0284C7] transition-colors">
              Terms & Conditions
            </Link>
            <span className="text-slate-300">|</span>
            <Link href="/payment-issues" className="hover:text-[#0284C7] transition-colors">
              Payment Issues
            </Link>
            <span className="text-slate-300">|</span>
            <Link href="/contact" className="hover:text-[#0284C7] transition-colors">
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
