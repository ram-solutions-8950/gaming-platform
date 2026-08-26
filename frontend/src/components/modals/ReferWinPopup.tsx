import { useEffect, useState } from 'react';
import { referralService, type ReferralStats, type ReferralHistoryItem } from '../../services/referral';

interface ReferWinPopupProps {
  onClose: () => void;
}

export function ReferWinPopup({ onClose }: ReferWinPopupProps) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [history, setHistory] = useState<ReferralHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    Promise.all([
      referralService.getStats().catch(() => null),
      referralService.getHistory().catch(() => []),
    ]).then(([s, h]) => {
      if (s) setStats(s);
      if (h) setHistory(h);
    });
  }, []);

  const referralLink = stats?.referral_code
    ? `${window.location.origin}/signup?ref=${stats.referral_code}`
    : `${window.location.origin}/signup`;

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareText = encodeURIComponent(
    `Join me on 777WIN and get bonus rewards! Use my referral code ${stats?.referral_code || ''} to play and win: ${referralLink}`
  );

  const rewardPerFriend = stats?.reward_amount ?? 100;

  return (
    <div
      className="startup-promo-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="refer-win-popup" onClick={(e) => e.stopPropagation()}>
        {/* Title Header */}
        <div className="refer-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="refer-title">Refer & Win</h2>
            <div className="flex items-center bg-black/40 rounded-full p-0.5 border border-gold-500/20 text-xs">
              <button
                type="button"
                className={`px-3 py-1 rounded-full font-bold transition ${activeTab === 'overview' ? 'bg-gold-500 text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-full font-bold transition ${activeTab === 'history' ? 'bg-gold-500 text-black shadow-md' : 'text-gray-400 hover:text-white'}`}
                onClick={() => setActiveTab('history')}
              >
                History ({history.length})
              </button>
            </div>
          </div>
          {/* Close button X */}
          <button
            className="refer-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {activeTab === 'overview' ? (
          <div className="refer-content-wrap">
            {/* Top Status */}
            <div className="refer-status-row">
              <span className="refer-invited-count">
                Friends invited: <span className="refer-highlight">{stats?.successful_referrals ?? 0}</span>
                {stats && stats.pending_referrals > 0 && (
                  <span className="text-xs text-yellow-400 ml-2">({stats.pending_referrals} pending)</span>
                )}
              </span>
              <span className="refer-subtitle-right font-bold text-gold-400">
                Total Earned: ₹{(stats?.total_earnings ?? 0).toFixed(2)}
              </span>
            </div>

            {/* Dynamic Reward Tier Highlights */}
            <div className="refer-tiers-row">
              <div className="refer-tier-col">
                <div className="refer-coin-stack refer-coin-small"></div>
                <div className="refer-tier-amount">₹{rewardPerFriend}</div>
                <div className="refer-tier-label">1 Friend</div>
              </div>

              <div className="refer-tier-col">
                <div className="refer-coin-stack refer-coin-medium"></div>
                <div className="refer-tier-amount">₹{rewardPerFriend * 2}</div>
                <div className="refer-tier-label">2 Friends</div>
              </div>

              <div className="refer-tier-col">
                <div className="refer-coin-stack refer-coin-large"></div>
                <div className="refer-tier-amount">₹{rewardPerFriend * 3}</div>
                <div className="refer-tier-label">3 Friends</div>
              </div>
            </div>

            {/* Connective Line */}
            <div className="refer-timeline-line">
              <div className="refer-node refer-node-1"></div>
              <div className="refer-node refer-node-2"></div>
              <div className="refer-node refer-node-3"></div>
            </div>

            {/* Referral Code Box */}
            {stats?.referral_code && (
              <div className="my-2 p-2.5 bg-dark-900/90 rounded-xl border border-gold-500/30 flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Your Referral Code</span>
                  <span className="text-base font-black text-gold-400 font-mono tracking-widest">{stats.referral_code}</span>
                </div>
                <button
                  type="button"
                  onClick={copyLink}
                  className="px-3 py-1.5 bg-gradient-to-r from-gold-500 to-amber-600 hover:from-gold-400 hover:to-amber-500 text-black font-extrabold text-xs rounded-lg shadow-md transition active:scale-95"
                >
                  {copied ? '✓ Copied!' : 'Copy Link'}
                </button>
              </div>
            )}

            {/* Description Terms List */}
            <ul className="refer-desc-list">
              <li>Earn ₹{rewardPerFriend} for every friend who registers with your code and makes their first deposit!</li>
              <li>Rewards are instantly credited to your wallet ledger.</li>
              <li>Share your referral link on WhatsApp, Telegram, or Facebook to invite friends.</li>
            </ul>

            {/* Share Actions buttons */}
            <div className="refer-share-actions">
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${shareText}`}
                target="_blank"
                rel="noreferrer"
                className="refer-share-btn btn-telegram"
              >
                <span className="share-icon">✈</span> Telegram
              </a>
              <a
                href={`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`}
                target="_blank"
                rel="noreferrer"
                className="refer-share-btn btn-facebook"
              >
                <span className="share-icon">f</span> Facebook
              </a>
              <a
                href={`https://api.whatsapp.com/send?text=${shareText}`}
                target="_blank"
                rel="noreferrer"
                className="refer-share-btn btn-whatsapp"
              >
                <span className="share-icon">💬</span> WhatsApp
              </a>
              <button
                type="button"
                onClick={copyLink}
                className="refer-share-btn btn-copysend"
              >
                <span className="share-icon">🔗</span> {copied ? 'Copied!' : 'Copy & Send'}
              </button>
            </div>
          </div>
        ) : (
          <div className="refer-content-wrap p-3 max-h-[380px] overflow-y-auto">
            {history.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs">
                <p>No referrals yet.</p>
                <p className="text-gray-500 mt-1">Share your referral link to start earning ₹{rewardPerFriend} per friend!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-dark-900/80 rounded-xl border border-dark-700 text-xs">
                    <div>
                      <div className="font-bold text-white">{item.name || item.username}</div>
                      <div className="text-[10px] text-gray-400 font-mono">@{item.username} • {new Date(item.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${item.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                        {item.status === 'COMPLETED' ? `+₹${item.reward_amount.toFixed(0)} Paid` : 'Pending Deposit'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
