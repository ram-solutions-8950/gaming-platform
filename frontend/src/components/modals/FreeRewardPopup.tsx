import { useEffect } from 'react';
import freeRewardBg from '../../assets/free-reward-bg.webp';

interface FreeRewardPopupProps {
  onClose: () => void;
}

export function FreeRewardPopup({ onClose }: FreeRewardPopupProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="free-popup-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div className="free-popup-stage">
        {/* Floating Gold Coins moved to stage for overflow visibility */}
        <div className="floating-coin fc-1"></div>
        <div className="floating-coin fc-2"></div>
        <div className="floating-coin fc-3"></div>
        <div className="floating-coin fc-4"></div>
        <div className="floating-coin fc-5"></div>
        <div className="floating-coin fc-6"></div>

        {/* 3D Purple Ribbon Banner moved to stage */}
        <div className="free-popup-ribbon">
          <div className="free-ribbon-wing-left"></div>
          <div className="free-ribbon-center">
            <span className="free-ribbon-text">FREE</span>
          </div>
          <div className="free-ribbon-wing-right"></div>
          <div className="free-ribbon-fold-left"></div>
          <div className="free-ribbon-fold-right"></div>
        </div>

        {/* Circular Close Button moved to stage */}
        <button
          className="free-popup-close"
          onClick={onClose}
          aria-label="Close"
        >
          <span>×</span>
        </button>

        {/* Main Popup Body that has overflow:hidden for gradients & casino artwork */}
        <div className="free-popup">
          {/* Background container holding the main deep gradient */}
          <div className="free-popup-background"></div>

          {/* Casino interior artwork background image layer */}
          <img
            src={freeRewardBg}
            alt=""
            className="free-popup-casino-art"
            loading="lazy"
            decoding="async"
          />

          {/* Outer sloped/angled gold casino frame layer */}
          <div className="free-popup-gold-frame"></div>

          {/* Inner content wrap containing the UI elements */}
          <div className="free-popup-content">
            {/* Hero Reward Area */}
            <div className="free-popup-hero">
              <p className="free-popup-subtitle">If you complete all the tasks will be get</p>
              
              <div className="free-popup-reward free-popup-amount">
                <span className="free-hero-rupee">₹</span>
                <span className="free-hero-val">100</span>
              </div>

              <div className="free-popup-coins">
                <svg viewBox="0 0 320 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="free-coins-svg">
                  <defs>
                    <linearGradient id="goldPlatformGrad" x1="160" y1="20" x2="160" y2="55" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#FFD94A" />
                      <stop offset="100%" stopColor="#8D4700" />
                    </linearGradient>
                    <linearGradient id="coinSideGrad" x1="0" y1="0" x2="0" y2="4" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#d47700" />
                      <stop offset="100%" stopColor="#663300" />
                    </linearGradient>
                    <radialGradient id="coinTopGrad" cx="0" cy="0" r="16" fx="0" fy="0" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#ffe600" />
                      <stop offset="100%" stopColor="#cc9900" />
                    </radialGradient>
                    <g id="svg-coin">
                      <path d="M -14 0 L -14 3 C -14 6, 14 6, 14 3 L 14 0 Z" fill="url(#coinSideGrad)" />
                      <ellipse cx="0" cy="0" rx="14" ry="3.5" fill="url(#coinTopGrad)" stroke="#ffffff" strokeWidth="0.4" />
                    </g>
                  </defs>

                  <ellipse cx="160" cy="42" rx="100" ry="12" fill="url(#goldPlatformGrad)" stroke="#FFea00" strokeWidth="1.5" />

                  <use href="#svg-coin" x="78" y="41" />
                  <use href="#svg-coin" x="78" y="37.5" />
                  <use href="#svg-coin" x="78" y="34" />
                  <use href="#svg-coin" x="78" y="30.5" />
                  <use href="#svg-coin" x="78" y="27" />

                  <use href="#svg-coin" x="100" y="44" />
                  <use href="#svg-coin" x="100" y="40.5" />
                  <use href="#svg-coin" x="100" y="37" />
                  <use href="#svg-coin" x="100" y="33.5" />
                  <use href="#svg-coin" x="100" y="30" />
                  <use href="#svg-coin" x="100" y="26.5" />
                  <use href="#svg-coin" x="100" y="23" />

                  <use href="#svg-coin" x="122" y="41" />
                  <use href="#svg-coin" x="122" y="37.5" />
                  <use href="#svg-coin" x="122" y="34" />
                  <use href="#svg-coin" x="122" y="30.5" />

                  <use href="#svg-coin" x="198" y="41" />
                  <use href="#svg-coin" x="198" y="37.5" />
                  <use href="#svg-coin" x="198" y="34" />
                  <use href="#svg-coin" x="198" y="30.5" />

                  <use href="#svg-coin" x="220" y="44" />
                  <use href="#svg-coin" x="220" y="40.5" />
                  <use href="#svg-coin" x="220" y="37" />
                  <use href="#svg-coin" x="220" y="33.5" />
                  <use href="#svg-coin" x="220" y="30" />
                  <use href="#svg-coin" x="220" y="26.5" />
                  <use href="#svg-coin" x="220" y="23" />

                  <use href="#svg-coin" x="242" y="41" />
                  <use href="#svg-coin" x="242" y="37.5" />
                  <use href="#svg-coin" x="242" y="34" />
                  <use href="#svg-coin" x="242" y="30.5" />
                  <use href="#svg-coin" x="242" y="27" />
                </svg>
              </div>
            </div>

            {/* Task Area Section */}
            <div className="free-popup-tasks">
              <div className="free-popup-task">
                <div className="free-task-info free-popup-task-text">
                  Successfully invite 2 player to<br />
                  register for the game <span className="free-progress">(0/2)</span>
                </div>
                <button className="free-go-btn free-popup-task-button" onClick={onClose}>Go</button>
              </div>

              <div className="free-popup-task">
                <div className="free-task-info free-popup-task-text">
                  Bind your mobile number <span className="free-progress">(0/1)</span>
                </div>
                <button className="free-go-btn free-popup-task-button" onClick={onClose}>Go</button>
              </div>

              <div className="free-popup-task">
                <div className="free-task-info free-popup-task-text">
                  Win 50 rupees at TeenPatti <span className="free-progress">(0/50)</span>
                </div>
                <button className="free-go-btn free-popup-task-button" onClick={onClose}>Go</button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Gold Ornaments flourishes overlapping popup bounds moved to stage */}
        <div className="free-popup-ornament-left"></div>
        <div className="free-popup-ornament-right"></div>
      </div>
    </div>
  );
}
