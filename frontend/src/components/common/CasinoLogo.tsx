import React from 'react';
import '../../styles/casino-logo.css';

interface CasinoLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  subtitleText?: string;
  titleText?: string;
  className?: string;
}

export const CasinoLogo: React.FC<CasinoLogoProps> = ({
  size = 'md',
  showSubtitle = true,
  subtitleText = '777WIN CASINO',
  titleText = 'GAMESTACK',
  className = '',
}) => {
  return (
    <div className={`casino-logo-root ${size} ${className}`} aria-label={titleText}>
      {/* 3D Metallic Casino Emblem */}
      <div className="casino-logo-emblem">
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="casino-logo-svg"
        >
          <defs>
            <linearGradient id="goldRimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF000" />
              <stop offset="35%" stopColor="#FFE66B" />
              <stop offset="70%" stopColor="#FFD21A" />
              <stop offset="100%" stopColor="#B96F00" />
            </linearGradient>
            <linearGradient id="purpleCoreGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4D0B8C" />
              <stop offset="60%" stopColor="#260044" />
              <stop offset="100%" stopColor="#16001F" />
            </linearGradient>
            <linearGradient id="spadeGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="25%" stopColor="#FFF000" />
              <stop offset="65%" stopColor="#FFD21A" />
              <stop offset="100%" stopColor="#A05A00" />
            </linearGradient>
            <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Outer 3D Gold Ring */}
          <circle
            cx="24"
            cy="24"
            r="21"
            fill="url(#purpleCoreGrad)"
            stroke="url(#goldRimGrad)"
            strokeWidth="3.5"
            strokeDasharray="9 2 4 2"
          />

          {/* Inner Golden Rim */}
          <circle
            cx="24"
            cy="24"
            r="16.5"
            stroke="url(#goldRimGrad)"
            strokeWidth="1.2"
            opacity="0.85"
          />

          {/* 3D Casino Spade Centerpiece */}
          <path
            d="M24 10 C21 16 14 19 14 24 C14 27.5 17 29.5 20.5 29 C22 28.8 23.2 28 24 27 C24.8 28 26 28.8 27.5 29 C31 29.5 34 27.5 34 24 C34 19 27 16 24 10 Z"
            fill="url(#spadeGoldGrad)"
            filter="url(#goldGlow)"
          />
          {/* Spade Stem / Base */}
          <path
            d="M23 26 L21 34 C21 34 22.5 35 24 35 C25.5 35 27 34 27 34 L25 26 Z"
            fill="url(#spadeGoldGrad)"
          />

          {/* Crown Jewels Top Accents */}
          <circle cx="24" cy="6" r="2" fill="#FFF000" />
          <circle cx="16" cy="9" r="1.5" fill="#FFE66B" />
          <circle cx="32" cy="9" r="1.5" fill="#FFE66B" />
        </svg>
      </div>

      {/* 3D Raised Metallic Text */}
      <div className="casino-logo-text-wrap">
        <h1 className="casino-logo-primary">{titleText}</h1>
        {showSubtitle && <span className="casino-logo-sub">{subtitleText}</span>}
      </div>
    </div>
  );
};
