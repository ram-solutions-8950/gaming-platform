import React, { useState, useEffect } from 'react';
import { soundManager } from '../../services/soundManager';

interface Props {
  onClose: () => void;
}

export const ServiceModal: React.FC<Props> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'channels' | 'faq' | 'ticket'>('channels');
  const [selectedTopic, setSelectedTopic] = useState('Deposit Issue (UTR / UPI)');
  const [userQuery, setUserQuery] = useState('');
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null);
  const [copiedChannel, setCopiedChannel] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleCopy = (text: string, label: string) => {
    try {
      navigator.clipboard.writeText(text);
      soundManager.play('button_click');
      setCopiedChannel(label);
      setTimeout(() => setCopiedChannel(null), 2500);
    } catch {
      /* ignore */
    }
  };

  const handleTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userQuery.trim()) return;
    try {
      soundManager.play('button_click');
    } catch {}
    const ticketId = 'TK-' + Math.floor(100000 + Math.random() * 900000);
    setSubmittedTicket(ticketId);
    setUserQuery('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm animate-fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-gradient-to-b from-[#240642] via-[#15032b] to-[#0a0117] rounded-2xl border-2 border-purple-400/70 shadow-[0_0_50px_rgba(168,85,247,0.35)] overflow-hidden text-white flex flex-col max-h-[calc(100dvh-var(--safe-top)-var(--safe-bottom)-24px)]">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-purple-700 via-brand-600 to-indigo-700 px-5 py-3.5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-2xl shadow-inner">
              🎧
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-wide uppercase">
                  VIP Customer Support
                </h2>
                <span className="flex items-center gap-1 text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  24/7 ONLINE
                </span>
              </div>
              <p className="text-[11px] text-purple-200 font-medium">
                Average agent response time: &lt; 2 minutes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white font-black text-xl flex items-center justify-center transition active:scale-95 cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-purple-500/20 bg-purple-950/40 px-3 pt-2 gap-2 text-xs font-black">
          <button
            onClick={() => setActiveTab('channels')}
            className={`pb-2 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'channels'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-purple-300 hover:text-white'
            }`}
          >
            <span>💬</span> Direct Channels
          </button>
          <button
            onClick={() => setActiveTab('ticket')}
            className={`pb-2 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ticket'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-purple-300 hover:text-white'
            }`}
          >
            <span>📝</span> Submit Ticket
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`pb-2 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'faq'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-purple-300 hover:text-white'
            }`}
          >
            <span>❓</span> FAQs
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 min-h-0 text-xs">
          {/* TAB 1: DIRECT CHANNELS */}
          {activeTab === 'channels' && (
            <div className="space-y-3 animate-fade-in">
              {/* Telegram Card */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#17304f] to-[#0d1e33] border border-sky-400/40 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center text-2xl text-sky-400">
                    ✈️
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-sky-300">Telegram VIP Support</span>
                      <span className="text-[9px] bg-sky-400/20 text-sky-200 px-1.5 py-0.5 rounded font-bold">
                        FASTEST
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300 font-mono mt-0.5">@Corona888_VIP_Support</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopy('@Corona888_VIP_Support', 'telegram')}
                    className="px-2.5 py-1.5 bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 border border-sky-400/40 rounded-lg text-[11px] font-bold active:scale-95 transition"
                  >
                    {copiedChannel === 'telegram' ? '✓ Copied' : 'Copy'}
                  </button>
                  <a
                    href="https://t.me"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-lg text-[11px] font-extrabold shadow-md hover:from-sky-400 hover:to-blue-500 active:scale-95 transition"
                  >
                    Open
                  </a>
                </div>
              </div>

              {/* WhatsApp Card */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#0e3b26] to-[#072417] border border-emerald-400/40 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-2xl text-emerald-400">
                    📱
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-emerald-300">WhatsApp Official Desk</span>
                      <span className="text-[9px] bg-emerald-400/20 text-emerald-200 px-1.5 py-0.5 rounded font-bold">
                        DIRECT
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300 font-mono mt-0.5">+91 98765 43210</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopy('+91 98765 43210', 'whatsapp')}
                    className="px-2.5 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-400/40 rounded-lg text-[11px] font-bold active:scale-95 transition"
                  >
                    {copiedChannel === 'whatsapp' ? '✓ Copied' : 'Copy'}
                  </button>
                  <a
                    href="https://wa.me"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg text-[11px] font-extrabold shadow-md hover:from-emerald-400 hover:to-green-500 active:scale-95 transition"
                  >
                    Chat
                  </a>
                </div>
              </div>

              {/* Official Email */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#3b1245] to-[#1e0724] border border-purple-400/30 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-2xl text-purple-300">
                    ✉️
                  </div>
                  <div>
                    <span className="font-extrabold text-sm text-purple-200">Email Escalations</span>
                    <p className="text-[11px] text-gray-300 font-mono mt-0.5">support@corona888.com</p>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy('support@corona888.com', 'email')}
                  className="px-3 py-1.5 bg-purple-600/40 hover:bg-purple-600/60 text-purple-200 border border-purple-400/40 rounded-lg text-[11px] font-bold active:scale-95 transition"
                >
                  {copiedChannel === 'email' ? '✓ Copied' : 'Copy Email'}
                </button>
              </div>

              {/* Safety notice */}
              <div className="p-3 bg-amber-500/10 border border-amber-400/30 rounded-xl flex items-start gap-2.5">
                <span className="text-amber-400 text-base shrink-0">🛡️</span>
                <p className="text-[11px] text-amber-200 leading-relaxed">
                  <strong>Security Note:</strong> Official Corona888 staff will never ask for your password, UPI PIN, or OTP. Only send your registered User ID and transaction reference.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: SUBMIT TICKET */}
          {activeTab === 'ticket' && (
            <div className="space-y-3 animate-fade-in">
              {submittedTicket ? (
                <div className="p-4 bg-emerald-950/60 border border-emerald-400/50 rounded-xl text-center space-y-2">
                  <span className="text-3xl block">🎉</span>
                  <h4 className="text-emerald-300 font-extrabold text-sm">Ticket Submitted Successfully!</h4>
                  <div className="bg-emerald-900/40 p-2 rounded-lg font-mono text-xs text-emerald-200 border border-emerald-500/30">
                    Ticket ID: <span className="font-bold text-white">{submittedTicket}</span>
                  </div>
                  <p className="text-[11px] text-gray-300">
                    Our live support representative is reviewing your request. For instant resolution, send this Ticket ID to our Telegram agent.
                  </p>
                  <button
                    onClick={() => setSubmittedTicket(null)}
                    className="mt-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition"
                  >
                    Submit Another Query
                  </button>
                </div>
              ) : (
                <form onSubmit={handleTicketSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 mb-1">Inquiry Category</label>
                    <select
                      value={selectedTopic}
                      onChange={(e) => setSelectedTopic(e.target.value)}
                      className="w-full bg-purple-950/80 border border-purple-400/40 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-400 transition"
                    >
                      <option>Deposit Issue (UTR / UPI)</option>
                      <option>Withdrawal Processing Status</option>
                      <option>Game Bet / Payout Question</option>
                      <option>Referral / Bonus Reward</option>
                      <option>Account & Security</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 mb-1">Describe Your Issue</label>
                    <textarea
                      rows={4}
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Please include transaction ID, round number, or details..."
                      className="w-full bg-purple-950/80 border border-purple-400/40 rounded-xl p-2.5 text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-amber-400 transition resize-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-purple-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg active:scale-95 transition cursor-pointer"
                  >
                    Submit Support Ticket
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: FAQs */}
          {activeTab === 'faq' && (
            <div className="space-y-2.5 animate-fade-in">
              <div className="p-3 bg-purple-950/50 border border-purple-400/20 rounded-xl">
                <h4 className="font-extrabold text-amber-300 text-xs mb-1">💰 How fast are deposits credited?</h4>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  UPI & QR deposits are credited automatically within 60 seconds after entering the correct 12-digit UTR transaction number.
                </p>
              </div>

              <div className="p-3 bg-purple-950/50 border border-purple-400/20 rounded-xl">
                <h4 className="font-extrabold text-amber-300 text-xs mb-1">⚡ How long does a withdrawal take?</h4>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  Withdrawals are approved and transferred directly to your bank account or UPI ID usually within 15 to 30 minutes.
                </p>
              </div>

              <div className="p-3 bg-purple-950/50 border border-purple-400/20 rounded-xl">
                <h4 className="font-extrabold text-amber-300 text-xs mb-1">🎲 Are the games fair?</h4>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  Yes, all games utilize industry-standard certified Provably Fair Cryptographic Random Number Generation (RNG).
                </p>
              </div>

              <div className="p-3 bg-purple-950/50 border border-purple-400/20 rounded-xl">
                <h4 className="font-extrabold text-amber-300 text-xs mb-1">🎁 How do I earn from referrals?</h4>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  Go to your Profile tab, copy your unique referral link, and share it. You receive ₹100 instant cash reward when your friend registers and deposits!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#0f021f] border-t border-purple-500/30 flex items-center justify-between text-[11px] text-purple-300">
          <span>Corona888 Support Protocol v2.4</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-purple-900/60 hover:bg-purple-800 text-white font-bold rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServiceModal;
