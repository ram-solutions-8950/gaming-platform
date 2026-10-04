import React from "react";
import Image from "next/image";

interface SanitaryVisualProps {
  type: "one-piece-toilet" | "wall-hung-toilet" | "wash-basin" | "basin-tap" | "shower-set" | "led-mirror" | "flush-tank";
  className?: string;
  imageUrl?: string;
  alt?: string;
  priority?: boolean;
}

export const SanitaryVisual: React.FC<SanitaryVisualProps> = ({
  type,
  className = "w-full h-full",
  imageUrl,
  alt = "Sanitary Product",
  priority = false,
}) => {
  // If user provided a real image, render Next.js Image
  if (imageUrl) {
    return (
      <div className={`relative flex items-center justify-center w-full h-full overflow-hidden ${className}`}>
        <Image
          src={encodeURI(imageUrl)}
          alt={alt}
          fill
          priority={priority}
          className="object-contain p-1.5 transition-transform duration-300 hover:scale-105"
          sizes="(max-width: 640px) 160px, (max-width: 1024px) 240px, 320px"
        />
      </div>
    );
  }

  // Fallback high-fidelity SVG ceramic renders
  switch (type) {
    case "one-piece-toilet":
      return (
        <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="toiletGrad" x1="50" y1="40" x2="160" y2="180" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFFFF" />
              <stop offset="0.6" stopColor="#EEF2F6" />
              <stop offset="1" stopColor="#D5DEE7" />
            </linearGradient>
            <linearGradient id="lidGrad" x1="70" y1="50" x2="150" y2="110" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#E2E8F0" />
            </linearGradient>
            <radialGradient id="shadowGrad" cx="100" cy="180" r="70" gradientTransform="scale(1 0.25)" gradientUnits="userSpaceOnUse">
              <stop stopColor="#64748B" stopOpacity="0.25" />
              <stop offset="1" stopColor="#64748B" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="chromeBtn" x1="90" y1="45" x2="110" y2="55" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E2E8F0" />
              <stop offset="0.5" stopColor="#94A3B8" />
              <stop offset="1" stopColor="#CBD5E1" />
            </linearGradient>
          </defs>
          <ellipse cx="100" cy="175" rx="65" ry="12" fill="url(#shadowGrad)" />
          <rect x="70" y="45" width="60" height="55" rx="10" fill="url(#toiletGrad)" stroke="#CBD5E1" strokeWidth="1.5" />
          <path d="M72 45H128C133 45 135 48 135 52V54H65V52C65 48 67 45 72 45Z" fill="#F8FAFC" />
          <ellipse cx="100" cy="46" rx="9" ry="4" fill="url(#chromeBtn)" stroke="#94A3B8" strokeWidth="0.8" />
          <line x1="100" y1="42.5" x2="100" y2="49.5" stroke="#64748B" strokeWidth="0.8" />
          <path
            d="M68 90C68 90 60 115 62 145C63 162 70 172 82 172H118C130 172 137 162 138 145C140 115 132 90 132 90H68Z"
            fill="url(#toiletGrad)"
            stroke="#CBD5E1"
            strokeWidth="1.5"
          />
          <path
            d="M62 92C62 82 78 75 100 75C122 75 138 82 138 92C138 108 122 120 100 120C78 120 62 108 62 92Z"
            fill="url(#lidGrad)"
            stroke="#CBD5E1"
            strokeWidth="1.5"
          />
          <ellipse cx="100" cy="94" rx="26" ry="16" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="1" />
        </svg>
      );

    case "wash-basin":
      return (
        <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <ellipse cx="100" cy="160" rx="55" ry="11" fill="#94A3B8" opacity="0.2" />
          <ellipse cx="100" cy="95" rx="50" ry="24" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1.5" />
          <ellipse cx="100" cy="96" rx="42" ry="18" fill="#FFFFFF" />
        </svg>
      );

    case "basin-tap":
      return (
        <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <rect x="90" y="80" width="20" height="70" rx="4" fill="#94A3B8" />
          <rect x="65" y="80" width="30" height="12" rx="3" fill="#94A3B8" />
        </svg>
      );

    default:
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 text-xs rounded-lg">
          AquaSan
        </div>
      );
  }
};
