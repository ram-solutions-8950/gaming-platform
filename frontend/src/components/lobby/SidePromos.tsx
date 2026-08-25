import React from 'react';
import '../../styles/side-promos.css';

interface SidePromosProps {
  onSelectPromo?: (promo: '30_cards' | 'lucky_spin' | 'cash_card') => void;
}

export const SidePromos: React.FC<SidePromosProps> = ({ onSelectPromo }) => {
  return (
    <div className="side-promos" role="group" aria-label="Casino Mini Games">
      {/* ─── 1. 30 CARDS ─── */}
      <button
        type="button"
        className="side-promo-btn"
        onClick={() => onSelectPromo?.('30_cards')}
        aria-label="30 Cards"
      >
        <div className="side-promo-icon-wrap">
          <svg viewBox="0 0 72 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="side-promo-svg">
            <defs>
              <linearGradient id="c30GoldTop" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF000" />
                <stop offset="50%" stopColor="#FFD21A" />
                <stop offset="100%" stopColor="#B96F00" />
              </linearGradient>
              <linearGradient id="c30CardFace" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#E2E8F0" />
              </linearGradient>
              <linearGradient id="c30BoxFront" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#D92070" />
                <stop offset="50%" stopColor="#9B1050" />
                <stop offset="100%" stopColor="#630630" />
              </linearGradient>
              <linearGradient id="c30CoinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF480" />
                <stop offset="40%" stopColor="#FFC800" />
                <stop offset="100%" stopColor="#A85500" />
              </linearGradient>
              <linearGradient id="c30CoinEdge" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#B86500" />
                <stop offset="100%" stopColor="#683000" />
              </linearGradient>
              <filter id="c30Glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* 3D Cards Box & Deck */}
            <g transform="translate(18, 4)">
              {/* Deck cards extending up */}
              <polygon points="12,2 38,0 46,24 20,26" fill="#D1D5DB" />
              <polygon points="10,0 36,0 44,22 18,22" fill="url(#c30CardFace)" stroke="#CBD5E1" strokeWidth="0.8" />
              {/* Gold Top Header on Card */}
              <polygon points="10,0 36,0 38,6 12,6" fill="url(#c30GoldTop)" />
              {/* Grid Lines on Cards */}
              <line x1="16" y1="10" x2="38" y2="10" stroke="#CBD5E1" strokeWidth="0.8" />
              <line x1="18" y1="14" x2="40" y2="14" stroke="#CBD5E1" strokeWidth="0.8" />
              <line x1="20" y1="18" x2="42" y2="18" stroke="#CBD5E1" strokeWidth="0.8" />

              {/* 3D Box Front */}
              <polygon points="6,22 40,20 44,48 10,50" fill="url(#c30BoxFront)" stroke="url(#c30GoldTop)" strokeWidth="1.2" />
              {/* Box Top Rim Gold */}
              <polygon points="6,22 40,20 42,24 8,26" fill="url(#c30GoldTop)" />
              {/* Box side 3D fold */}
              <polygon points="40,20 46,14 48,42 44,48" fill="#500424" />
              <polygon points="6,22 8,26 10,50 6,48" fill="#FF4D94" opacity="0.3" />
            </g>

            {/* Stacked Shiny 3D Gold Coins on Lower Left */}
            {/* Bottom Coin */}
            <ellipse cx="18" cy="50" rx="14" ry="5.5" fill="url(#c30CoinEdge)" />
            <ellipse cx="18" cy="47" rx="14" ry="5.5" fill="url(#c30CoinGrad)" stroke="#FFEAA0" strokeWidth="0.8" />
            {/* Middle Coin */}
            <ellipse cx="19" cy="44" rx="13.5" ry="5" fill="url(#c30CoinEdge)" />
            <ellipse cx="19" cy="41" rx="13.5" ry="5" fill="url(#c30CoinGrad)" stroke="#FFEAA0" strokeWidth="0.8" />
            {/* Top Coin */}
            <ellipse cx="20" cy="38" rx="13" ry="5" fill="url(#c30CoinEdge)" />
            <ellipse cx="20" cy="35" rx="13" ry="5" fill="url(#c30CoinGrad)" stroke="#FFF8C0" strokeWidth="0.9" filter="url(#c30Glow)" />
            {/* Coin Details Emblem */}
            <ellipse cx="20" cy="35" rx="9" ry="3.5" stroke="#B87000" strokeWidth="0.6" strokeDasharray="2 1" />
            <text x="20" y="36.5" fill="#8A4800" fontSize="5.5" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">₹</text>

            {/* Small floating gold sparkle */}
            <polygon points="56,6 58,10 62,12 58,14 56,18 54,14 50,12 54,10" fill="#FFF000" />
          </svg>
        </div>
        <span className="side-promo-label">30 Cards</span>
      </button>

      {/* ─── 2. LUCKY SPIN ─── */}
      <button
        type="button"
        className="side-promo-btn"
        onClick={() => onSelectPromo?.('lucky_spin')}
        aria-label="Lucky Spin"
      >
        <div className="side-promo-icon-wrap">
          <svg viewBox="0 0 72 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="side-promo-svg">
            <defs>
              <linearGradient id="spinCrownGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="25%" stopColor="#FFF000" />
                <stop offset="65%" stopColor="#FFD21A" />
                <stop offset="100%" stopColor="#B36500" />
              </linearGradient>
              <linearGradient id="spinOuterRing" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFE76B" />
                <stop offset="50%" stopColor="#FFC800" />
                <stop offset="100%" stopColor="#8A4000" />
              </linearGradient>
              <linearGradient id="spinPurpleP1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8F30E8" />
                <stop offset="100%" stopColor="#4A0E80" />
              </linearGradient>
              <linearGradient id="spinPurpleP2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#C060FF" />
                <stop offset="100%" stopColor="#7518C8" />
              </linearGradient>
              <linearGradient id="spinGreenBtn" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#72D65A" />
                <stop offset="45%" stopColor="#4CAF50" />
                <stop offset="100%" stopColor="#237A36" />
              </linearGradient>
              <filter id="spinGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Bottom 3D base ornament */}
            <path d="M16 48 C22 56 50 56 56 48 C52 52 20 52 16 48 Z" fill="#6A1088" />
            <path d="M22 50 C28 54 44 54 50 50" stroke="url(#spinOuterRing)" strokeWidth="1.5" />

            {/* Circular Purple Roulette / Spin Frame */}
            <circle cx="36" cy="35" r="22" fill="#200044" stroke="url(#spinOuterRing)" strokeWidth="3" filter="url(#spinGlow)" />
            <circle cx="36" cy="35" r="19.5" fill="none" stroke="#FFE66B" strokeWidth="0.8" opacity="0.8" />

            {/* Wheel Segments */}
            <path d="M36 35 L36 15 A20 20 0 0 1 56 35 Z" fill="url(#spinPurpleP1)" />
            <path d="M36 35 L56 35 A20 20 0 0 1 36 55 Z" fill="url(#spinPurpleP2)" />
            <path d="M36 35 L36 55 A20 20 0 0 1 16 35 Z" fill="url(#spinPurpleP1)" />
            <path d="M36 35 L16 35 A20 20 0 0 1 36 15 Z" fill="url(#spinPurpleP2)" />

            {/* Gold Divider Spokes */}
            <line x1="36" y1="15" x2="36" y2="55" stroke="url(#spinOuterRing)" strokeWidth="1" />
            <line x1="16" y1="35" x2="56" y2="35" stroke="url(#spinOuterRing)" strokeWidth="1" />
            <line x1="22" y1="21" x2="50" y2="49" stroke="url(#spinOuterRing)" strokeWidth="0.7" />
            <line x1="22" y1="49" x2="50" y2="21" stroke="url(#spinOuterRing)" strokeWidth="0.7" />

            {/* Center Green Embedded GO Button */}
            <circle cx="36" cy="35" r="9" fill="#155524" />
            <circle cx="36" cy="34" r="8.5" fill="url(#spinGreenBtn)" stroke="#A0FFA0" strokeWidth="1" />
            {/* GO Text */}
            <text x="36" y="37" fill="#FFFFFF" fontSize="7" fontWeight="900" textAnchor="middle" fontFamily="sans-serif" letterSpacing="0.2">GO</text>

            {/* TOP: 3D Royal Gold Crown */}
            <g transform="translate(18, 4)">
              {/* Crown Base */}
              <path d="M6 14 C12 11 24 11 30 14 L28 17 C22 15 14 15 8 17 Z" fill="url(#spinCrownGold)" />
              {/* Crown Spikes & Curls */}
              <path d="M6 14 L4 6 L12 11 L18 2 L24 11 L32 6 L30 14 Z" fill="url(#spinCrownGold)" stroke="#FFF8B0" strokeWidth="0.7" />
              {/* Crown Jewels */}
              <circle cx="18" cy="2" r="1.8" fill="#FFF000" />
              <circle cx="4" cy="6" r="1.3" fill="#FFF000" />
              <circle cx="32" cy="6" r="1.3" fill="#FFF000" />
              {/* Center Diamond */}
              <polygon points="18,7 20,10 18,13 16,10" fill="#FFFFFF" />
            </g>
          </svg>
        </div>
        <span className="side-promo-label">Lucky Spin</span>
      </button>

      {/* ─── 3. CASH CARD ─── */}
      <button
        type="button"
        className="side-promo-btn"
        onClick={() => onSelectPromo?.('cash_card')}
        aria-label="Cash Card"
      >
        <div className="side-promo-icon-wrap">
          <svg viewBox="0 0 72 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="side-promo-svg">
            <defs>
              <linearGradient id="ccCardPurple" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8A22C8" />
                <stop offset="45%" stopColor="#731AA8" />
                <stop offset="100%" stopColor="#3B075D" />
              </linearGradient>
              <linearGradient id="ccCardGoldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF000" />
                <stop offset="40%" stopColor="#FFD84A" />
                <stop offset="75%" stopColor="#F5B51B" />
                <stop offset="100%" stopColor="#B84A12" />
              </linearGradient>
              <linearGradient id="ccStripeGold" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FFF000" />
                <stop offset="50%" stopColor="#FFD84A" />
                <stop offset="100%" stopColor="#F5B51B" />
              </linearGradient>
              <linearGradient id="ccBackCardGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFE060" />
                <stop offset="50%" stopColor="#D99000" />
                <stop offset="100%" stopColor="#7A3800" />
              </linearGradient>
              <filter id="ccGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Bottom Secondary Gold Card (slanted at ~22deg) */}
            <g transform="rotate(22 36 34)">
              <rect x="15" y="24" width="42" height="26" rx="3.5" fill="url(#ccBackCardGold)" stroke="#FFF290" strokeWidth="1" />
              <line x1="17" y1="30" x2="55" y2="30" stroke="#7A3800" strokeWidth="3" />
            </g>

            {/* Top Primary VIP Cash Card (slanted at ~12deg) */}
            <g transform="rotate(12 36 30)">
              {/* Card 3D Depth Base */}
              <rect x="14" y="15" width="44" height="28" rx="4" fill="#200038" filter="url(#ccGlow)" />
              {/* Card Body */}
              <rect x="13" y="13" width="44" height="28" rx="4" fill="url(#ccCardPurple)" stroke="url(#ccCardGoldBorder)" strokeWidth="1.8" />
              {/* Top Bright Gold Stripe */}
              <rect x="13.5" y="16.5" width="43" height="4.5" fill="url(#ccStripeGold)" />
              {/* Gold Chip Emblem */}
              <rect x="17" y="24" width="7" height="6" rx="1.2" fill="url(#ccStripeGold)" stroke="#B84A12" strokeWidth="0.5" />
              <line x1="20.5" y1="24" x2="20.5" y2="30" stroke="#8A3000" strokeWidth="0.4" />
              {/* Embossed Text on Card */}
              <text x="27" y="28.5" fill="#FFEAA0" fontSize="5" fontWeight="900" fontFamily="sans-serif" letterSpacing="0.4">Cash Card</text>
              {/* Bottom Gold Accent Stripe */}
              <line x1="14" y1="37" x2="56" y2="37" stroke="url(#ccStripeGold)" strokeWidth="1.2" />
            </g>

            {/* Small golden sparkle */}
            <polygon points="58,10 60,13 64,15 60,17 58,20 56,17 52,15 56,13" fill="#FFF000" />
          </svg>
        </div>
        <span className="side-promo-label">Cash Card</span>
      </button>
    </div>
  );
};
