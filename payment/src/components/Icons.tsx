import React from "react";

// AquaSan Water Droplet Brand Logo
export const DropletLogoIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 40 44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="dropMain" x1="5" y1="5" x2="35" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#38BDF8" />
        <stop offset="0.6" stopColor="#0284C7" />
        <stop offset="1" stopColor="#0369A1" />
      </linearGradient>
      <linearGradient id="dropInner" x1="12" y1="14" x2="28" y2="34" gradientUnits="userSpaceOnUse">
        <stop stopColor="#BAE6FD" />
        <stop offset="1" stopColor="#38BDF8" stopOpacity="0.4" />
      </linearGradient>
    </defs>
    {/* Outer Droplet */}
    <path
      d="M20 2C20 2 6 18 6 28C6 35.732 12.268 42 20 42C27.732 42 34 35.732 34 28C34 18 20 2 20 2Z"
      fill="url(#dropMain)"
    />
    {/* Inner Wave / Shine Contour */}
    <path
      d="M20 7C20 7 11 19 11 28C11 31.5 12.5 34.5 15 36.5C13.5 34 13 31 13 28C13 21 21 13 21 13C21 13 26 21 26 27C26 31 24.5 34 22 36C26 35 29 32 29 28C29 19 20 7 20 7Z"
      fill="url(#dropInner)"
    />
  </svg>
);

// Trust Badges
export const TrustShieldIcon: React.FC<{ className?: string }> = ({ className = "w-7 h-7" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="#E0F2FE" stroke="#0284C7" />
    <path d="m9 12 2 2 4-4" stroke="#0284C7" strokeWidth="2.5" />
  </svg>
);

export const FastDeliveryIcon: React.FC<{ className?: string }> = ({ className = "w-7 h-7" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="1" y="3" width="15" height="13" rx="2" fill="#E0F2FE" stroke="#0284C7" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" fill="#E0F2FE" stroke="#0284C7" />
    <circle cx="5.5" cy="18.5" r="2.5" fill="#0284C7" stroke="#0284C7" />
    <circle cx="18.5" cy="18.5" r="2.5" fill="#0284C7" stroke="#0284C7" />
  </svg>
);

export const SupportHeadsetIcon: React.FC<{ className?: string }> = ({ className = "w-7 h-7" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" stroke="#0284C7" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" fill="#E0F2FE" stroke="#0284C7" />
    <path d="M14 19h2" stroke="#0284C7" />
  </svg>
);

// Lock Icon for Button
export const LockIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// Green Encrypted Security Shield
export const SecureEncryptedIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="#DCFCE7" stroke="#16A34A" />
    <path d="m9 12 2 2 4-4" stroke="#16A34A" strokeWidth="2.5" />
  </svg>
);

// Payment Method Type Icons
export const UpiMethodIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M14.5 3L7.5 12H13L9.5 21L18.5 10.5H13L14.5 3Z" fill="#0284C7" stroke="#0284C7" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export const CardMethodIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="5" width="20" height="14" rx="2" fill="#E0F2FE" />
    <line x1="2" y1="10" x2="22" y2="10" stroke="#0284C7" strokeWidth="2" />
    <line x1="6" y1="15" x2="10" y2="15" stroke="#0284C7" strokeWidth="2" />
  </svg>
);

export const BankMethodIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 21h18M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M12 3l9 7H3l9-7z" fill="#E0F2FE" />
  </svg>
);

export const WalletMethodIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" fill="#E0F2FE" />
    <path d="M16 3H4a2 2 0 0 0-2 2v2h18V5a2 2 0 0 0-2-2z" />
    <circle cx="16" cy="14" r="1.5" fill="#0284C7" />
  </svg>
);

// Payment Brand Badges & Logos (Pixel-accurate vector representations)
export const PhonePeBadge: React.FC<{ className?: string }> = ({ className = "h-5 w-auto" }) => (
  <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="14" cy="14" r="14" fill="#5F259F" />
    <path
      d="M17.5 9H13.2C10.9 9 9 10.9 9 13.2V21H11.5V16.8H14.5C16.8 16.8 18.8 14.8 18.8 12.5C18.8 10.5 18.2 9 17.5 9ZM14.3 14.4H11.5V11.4H14.3C15.1 11.4 15.8 12.1 15.8 12.9C15.8 13.7 15.1 14.4 14.3 14.4Z"
      fill="#FFFFFF"
    />
    <path d="M18.5 13.5L20.8 21H18.2L16.2 14.5" stroke="#FFFFFF" strokeWidth="1.5" />
  </svg>
);

export const GPayBadge: React.FC<{ className?: string }> = ({ className = "h-5 w-auto" }) => (
  <svg viewBox="0 0 32 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="32" height="20" rx="3" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
    {/* 4-color Google G mark */}
    <path d="M16 10.1c0-.4 0-.8-.1-1.1H10v2.2h3.4c-.1.8-.6 1.5-1.3 1.9v1.6h2.1c1.2-1.1 1.9-2.8 1.9-4.6z" fill="#4285F4" />
    <path d="M10 16.2c1.7 0 3.1-.6 4.2-1.6l-2.1-1.6c-.6.4-1.3.6-2.1.6-1.6 0-3-1.1-3.5-2.6H4.3v1.7C5.4 15 7.6 16.2 10 16.2z" fill="#34A853" />
    <path d="M6.5 11c-.1-.4-.2-.9-.2-1.4s.1-1 .2-1.4V6.5H4.3C3.8 7.5 3.5 8.7 3.5 10s.3 2.5.8 3.5l2.2-1.7z" fill="#FBBC05" />
    <path d="M10 5.8c.9 0 1.8.3 2.4.9l1.8-1.8C13.1 3.9 11.7 3.4 10 3.4 7.6 3.4 5.4 4.6 4.3 6.9l2.2 1.7c.5-1.5 1.9-2.8 3.5-2.8z" fill="#EA4335" />
    <text x="18" y="14" fill="#5F6368" fontSize="8" fontWeight="bold" fontFamily="sans-serif">Pay</text>
  </svg>
);

export const PaytmBadge: React.FC<{ className?: string }> = ({ className = "h-5 w-auto" }) => (
  <svg viewBox="0 0 44 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <text x="1" y="12" fill="#002E6E" fontSize="11" fontWeight="900" fontFamily="sans-serif" letterSpacing="-0.5">Pay</text>
    <text x="22" y="12" fill="#00BAF2" fontSize="11" fontWeight="900" fontFamily="sans-serif" letterSpacing="-0.5">tm</text>
  </svg>
);

export const VisaBadge: React.FC<{ className?: string }> = ({ className = "h-5 w-auto" }) => (
  <svg viewBox="0 0 38 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="38" height="16" rx="2.5" fill="#1A1F71" />
    <text x="4" y="12" fill="#FFFFFF" fontSize="11" fontStyle="italic" fontWeight="900" fontFamily="sans-serif" letterSpacing="0.8">VISA</text>
  </svg>
);

export const MastercardBadge: React.FC<{ className?: string }> = ({ className = "h-5 w-auto" }) => (
  <svg viewBox="0 0 28 18" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="10" cy="9" r="7" fill="#EB001B" />
    <circle cx="18" cy="9" r="7" fill="#F79E1B" fillOpacity="0.85" />
  </svg>
);

export const RuPayBadge: React.FC<{ className?: string }> = ({ className = "h-5 w-auto" }) => (
  <svg viewBox="0 0 44 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="44" height="16" rx="2" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
    <text x="3" y="12" fill="#0A3A82" fontSize="10" fontWeight="bold" fontFamily="sans-serif">Ru</text>
    <text x="18" y="12" fill="#F26522" fontSize="10" fontWeight="bold" fontFamily="sans-serif">Pay</text>
    <path d="M38 4L42 12H39L35 4H38Z" fill="#F26522" />
  </svg>
);

export const AmazonPayBadge: React.FC<{ className?: string }> = ({ className = "h-5 w-auto" }) => (
  <svg viewBox="0 0 46 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="46" height="16" rx="2" fill="#232F3E" />
    <text x="4" y="10.5" fill="#FFFFFF" fontSize="7" fontWeight="bold" fontFamily="sans-serif">amazon</text>
    <path d="M7 13.5C12 15.5 20 15 25 12" stroke="#FF9900" strokeWidth="1.5" strokeLinecap="round" />
    <text x="29" y="11" fill="#FF9900" fontSize="7" fontWeight="bold" fontFamily="sans-serif">pay</text>
  </svg>
);

export const MobikwikBadge: React.FC<{ className?: string }> = ({ className = "h-5 w-auto" }) => (
  <svg viewBox="0 0 32 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect width="32" height="16" rx="2.5" fill="#1C75BC" />
    <text x="5" y="12" fill="#FFFFFF" fontSize="9" fontWeight="900" fontFamily="sans-serif">Kwik</text>
  </svg>
);

// Quantity Stepper Icons
export const MinusIcon: React.FC<{ className?: string }> = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const PlusIcon: React.FC<{ className?: string }> = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// Footer Contact Icons
export const PhoneIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

export const MailIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export const MapPinIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const ClockIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

// Social Media Icons
export const FacebookIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

export const InstagramIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
  </svg>
);

export const YoutubeIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

export const LinkedinIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
  </svg>
);
