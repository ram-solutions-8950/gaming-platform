import { useEffect } from 'react';

interface ReferWinPopupProps {
  onClose: () => void;
}

export function ReferWinPopup({ onClose }: ReferWinPopupProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.origin + '/register?ref=user');
    alert('Referral link copied to clipboard!');
  };

  return (
    <div
      className="startup-promo-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div className="refer-win-popup">
        {/* Title Header */}
        <div className="refer-header">
          <h2 className="refer-title">Refer & Win</h2>
          {/* Close button X */}
          <button
            className="refer-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="refer-content-wrap">
          {/* Top Status */}
          <div className="refer-status-row">
            <span className="refer-invited-count">Friends invited: <span className="refer-highlight">0</span></span>
            <span className="refer-subtitle-right">For each friend joining the game</span>
          </div>

          {/* Reward Tiers Grid */}
          <div className="refer-tiers-row">
            <div className="refer-tier-col">
              <div className="refer-coin-stack refer-coin-small"></div>
              <div className="refer-tier-amount">₹80</div>
              <div className="refer-tier-label">1 Friend</div>
            </div>

            <div className="refer-tier-col">
              <div className="refer-coin-stack refer-coin-medium"></div>
              <div className="refer-tier-amount">₹90</div>
              <div className="refer-tier-label">2 Friends</div>
            </div>

            <div className="refer-tier-col">
              <div className="refer-coin-stack refer-coin-large"></div>
              <div className="refer-tier-amount">₹100</div>
              <div className="refer-tier-label">3 Friends</div>
            </div>
          </div>

          {/* Connective Line */}
          <div className="refer-timeline-line">
            <div className="refer-node refer-node-1"></div>
            <div className="refer-node refer-node-2"></div>
            <div className="refer-node refer-node-3"></div>
          </div>

          {/* Description Terms List */}
          <ul className="refer-desc-list">
            <li>Each vaild-player will returns you much money</li>
            <li>If the sub-players recharged up to 1000 or above it. It becomes vaild player</li>
            <li>You can share through WhatApp,Facebook,Telegram or other social media</li>
            <li>If you want more rewards from friends,please check Refer&Eaen page</li>
          </ul>

          {/* Share Actions buttons */}
          <div className="refer-share-actions">
            <a
              href="https://t.me/share/url?url=http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="refer-share-btn btn-telegram"
            >
              <span className="share-icon">✈</span> Telegram
            </a>
            <a
              href="https://facebook.com/sharer/sharer.php?u=http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="refer-share-btn btn-facebook"
            >
              <span className="share-icon">f</span> Facebook
            </a>
            <a
              href="https://api.whatsapp.com/send?text=http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="refer-share-btn btn-whatsapp"
            >
              <span className="share-icon">💬</span> WhatsApp
            </a>
            <button
              onClick={copyLink}
              className="refer-share-btn btn-copysend"
            >
              <span className="share-icon">🔗</span> Copy&Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
