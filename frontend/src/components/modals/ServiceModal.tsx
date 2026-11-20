import React, { useState, useEffect, useCallback } from 'react';
import { soundManager } from '../../services/soundManager';
import { copyToClipboard } from '../../utils/clipboard';
import { supportService, type SupportContactInfo, type UserSupportTicket } from '../../services/supportService';
import { TelegramIcon, InstagramIcon, FacebookIcon, safeExternalUrl } from '../common/BrandIcons';
import toast from 'react-hot-toast';
import { Clock, RefreshCw, Send, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * Render an FAQ answer, turning any http(s) URL into a tappable link.
 *
 * Admins routinely paste a channel or support link as the whole answer (the
 * live config has exactly that), and a bare unclickable URL on a phone is
 * useless. Only http and https are linked; anything else is left as plain
 * text so a pasted `javascript:` string can never become a live link.
 */
function renderAnswer(answer: string): React.ReactNode {
  const text = answer ?? '';
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);

  return parts.map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sky-300 underline font-semibold break-all"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}


interface Props {
  onClose: () => void;
}

export const ServiceModal: React.FC<Props> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'channels' | 'ticket' | 'my_tickets' | 'faq'>('channels');
  
  // Contact Config
  const [contactInfo, setContactInfo] = useState<SupportContactInfo>({
    whatsapp_vip: '+91 98765 43210',
    whatsapp_url: 'https://wa.me/919876543210',
    support_email: 'support@corona888.com',
    helpline_number: '+91 98765 43210',
    working_hours: '24/7 Priority Support Desk',
    faqs: [],
  });

  // Ticket Form
  const [category, setCategory] = useState('Deposit Issue (UTR / UPI)');
  const [subject, setSubject] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<UserSupportTicket | null>(null);

  // My Tickets List
  const [myTickets, setMyTickets] = useState<UserSupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const [copiedChannel, setCopiedChannel] = useState<string | null>(null);

  // FAQs come from the admin-managed support config. They were previously
  // hardcoded in this component, so nothing an admin typed ever appeared.
  const faqs = contactInfo.faqs ?? [];

  // Admin-managed social links. Each is validated before it reaches an href,
  // and a channel the admin has not configured is hidden rather than shown as
  // a button that goes nowhere.
  const telegramUrl = safeExternalUrl(contactInfo.telegram_url);
  const instagramUrl = safeExternalUrl(contactInfo.instagram_url);
  const facebookUrl = safeExternalUrl(contactInfo.facebook_url);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Fetch live contact info
  const fetchContactConfig = useCallback(async () => {
    try {
      const cfg = await supportService.getContactConfig();
      if (cfg) setContactInfo(cfg);
    } catch (err) {
      console.error('Failed to load contact config', err);
    }
  }, []);

  useEffect(() => {
    fetchContactConfig();
  }, [fetchContactConfig]);

  useEffect(() => {
    // Both tabs render admin-managed config, so refresh on either, otherwise
    // a player with the modal already open keeps seeing stale FAQs.
    if (activeTab === 'channels' || activeTab === 'faq') {
      fetchContactConfig();
    }
  }, [activeTab, fetchContactConfig]);

  const fetchMyTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const tickets = await supportService.getMyTickets();
      setMyTickets(tickets || []);
    } catch {
      // ignore
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'my_tickets') {
      fetchMyTickets();
    }
  }, [activeTab, fetchMyTickets]);

  const handleCopy = async (text: string, label: string) => {
    if (!(await copyToClipboard(text))) return;
    try {
      soundManager.play('button_click');
    } catch {}
    setCopiedChannel(label);
    setTimeout(() => setCopiedChannel(null), 2500);
  };

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userQuery.trim()) return;
    setSubmitting(true);
    try {
      soundManager.play('button_click');
    } catch {}

    try {
      const res = await supportService.submitTicket(
        category,
        subject.trim() || category,
        userQuery.trim()
      );
      setSubmittedTicket(res);
      setUserQuery('');
      setSubject('');
      toast.success('Support ticket submitted successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to submit ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">OPEN</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">IN PROGRESS</span>;
      case 'RESOLVED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">RESOLVED</span>;
      case 'CLOSED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/20 text-gray-300 border border-gray-500/30">CLOSED</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-500/20 text-gray-300">{status}</span>;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 pb-[calc(var(--bottom-nav-height,56px)+var(--safe-bottom,0px)+12px)] bg-black/85 backdrop-blur-sm animate-fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-gradient-to-b from-[#240642] via-[#15032b] to-[#0a0117] rounded-2xl border-2 border-purple-400/70 shadow-[0_0_50px_rgba(168,85,247,0.35)] overflow-hidden text-white flex flex-col max-h-[calc(100dvh-var(--bottom-nav-height,56px)-var(--safe-top,0px)-var(--safe-bottom,0px)-24px)]">
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
        <div className="flex border-b border-purple-500/20 bg-purple-950/40 px-3 pt-2 gap-2 text-xs font-black overflow-x-auto">
          <button
            onClick={() => setActiveTab('channels')}
            className={`pb-2 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'channels'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-purple-300 hover:text-white'
            }`}
          >
            <span>💬</span> Direct Desk
          </button>
          <button
            onClick={() => setActiveTab('ticket')}
            className={`pb-2 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'ticket'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-purple-300 hover:text-white'
            }`}
          >
            <span>📝</span> Submit Ticket
          </button>
          <button
            onClick={() => setActiveTab('my_tickets')}
            className={`pb-2 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'my_tickets'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-purple-300 hover:text-white'
            }`}
          >
            <span>📋</span> My Tickets
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`pb-2 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
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
              {/* WhatsApp Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#0e3b26] to-[#072417] border-2 border-emerald-400/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-3xl text-emerald-400 shrink-0">
                    📱
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-emerald-300">WhatsApp Official VIP Desk</span>
                      <span className="text-[9px] bg-emerald-400/20 text-emerald-200 px-1.5 py-0.5 rounded font-bold uppercase">
                        Instant Live Chat
                      </span>
                    </div>
                    <p className="text-xs text-white font-mono mt-0.5 font-bold">
                      {contactInfo.whatsapp_vip || '+91 98765 43210'}
                    </p>
                    <p className="text-[10px] text-emerald-300/80 mt-0.5">
                      Direct connection to verified platform account managers
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleCopy(contactInfo.whatsapp_vip, 'whatsapp')}
                    className="px-3 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-400/40 rounded-xl text-xs font-bold active:scale-95 transition cursor-pointer"
                  >
                    {copiedChannel === 'whatsapp' ? '✓ Copied' : 'Copy Number'}
                  </button>
                  <a
                    href={contactInfo.whatsapp_url || `https://wa.me/${contactInfo.whatsapp_vip.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/30 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Open WhatsApp</span>
                    <span>➔</span>
                  </a>
                </div>
              </div>

              {/* Official Support Email */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#3b1245] to-[#1e0724] border border-purple-400/30 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-2xl text-purple-300">
                    ✉️
                  </div>
                  <div>
                    <span className="font-extrabold text-sm text-purple-200">Email Escalation Desk</span>
                    <p className="text-[11px] text-gray-300 font-mono mt-0.5">
                      {contactInfo.support_email || 'support@corona888.com'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(contactInfo.support_email, 'email')}
                  className="px-3 py-1.5 bg-purple-600/40 hover:bg-purple-600/60 text-purple-200 border border-purple-400/40 rounded-lg text-[11px] font-bold active:scale-95 transition cursor-pointer"
                >
                  {copiedChannel === 'email' ? '✓ Copied' : 'Copy Email'}
                </button>
              </div>

              {/* Telegram channel + signup bonus instructions */}
              {telegramUrl && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-[#0b2e45] to-[#061a28] border-2 border-sky-400/50 shadow-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                        <TelegramIcon className="w-7 h-7" title="Telegram" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-sky-300">Official Telegram Channel</span>
                          <span className="text-[9px] bg-sky-400/20 text-sky-200 px-1.5 py-0.5 rounded font-bold uppercase">
                            Bonus Desk
                          </span>
                        </div>
                        <p className="text-[10px] text-sky-300/80 mt-0.5">
                          Announcements, bonus drops and claim support
                        </p>
                      </div>
                    </div>
                    <a
                      href={telegramUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl text-xs font-black shadow-lg shadow-sky-600/30 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer self-end sm:self-center shrink-0"
                    >
                      <TelegramIcon className="w-4 h-4" />
                      <span>Join Telegram</span>
                    </a>
                  </div>

                  <div className="p-2.5 rounded-lg bg-sky-950/50 border border-sky-400/30 flex items-start gap-2">
                    <span className="text-sky-300 text-sm shrink-0">🎁</span>
                    <p className="text-[11px] text-sky-100 leading-relaxed">
                      <strong>After sign up, upload your screenshot to our Telegram to get the bonus.</strong>{' '}
                      Send a screenshot of your completed registration to the channel above and our team will credit your
                      welcome bonus.
                    </p>
                  </div>
                </div>
              )}

              {/* Follow us on social media */}
              {(instagramUrl || facebookUrl) && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#241038] to-[#140821] border border-fuchsia-400/30 shadow-lg">
                  <p className="text-[11px] font-bold text-fuchsia-200 mb-2.5">Follow us for giveaways &amp; updates</p>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {instagramUrl && (
                      <a
                        href={instagramUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-lg active:scale-95 transition cursor-pointer bg-gradient-to-r from-[#833AB4] via-[#E4405F] to-[#F77737] hover:opacity-90"
                      >
                        <InstagramIcon className="w-4 h-4" title="Instagram" />
                        <span>Instagram</span>
                      </a>
                    )}
                    {facebookUrl && (
                      <a
                        href={facebookUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-lg active:scale-95 transition cursor-pointer bg-[#1877F2] hover:bg-[#0d6ae0]"
                      >
                        <FacebookIcon className="w-4 h-4" title="Facebook" />
                        <span>Facebook</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Working Hours Banner */}
              <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-xl flex items-center gap-2.5 text-xs text-purple-200">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Working Hours: <strong>{contactInfo.working_hours || '24/7 Priority Support'}</strong></span>
              </div>

              {/* Safety notice */}
              <div className="p-3 bg-amber-500/10 border border-amber-400/30 rounded-xl flex items-start gap-2.5">
                <span className="text-amber-400 text-base shrink-0">🛡️</span>
                <p className="text-[11px] text-amber-200 leading-relaxed">
                  <strong>Security Note:</strong> Official Corona888 staff will never ask for your password, UPI PIN, or bank OTP. Only share your registered User ID and transaction reference number.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: SUBMIT TICKET */}
          {activeTab === 'ticket' && (
            <div className="space-y-3 animate-fade-in">
              {submittedTicket ? (
                <div className="p-5 bg-emerald-950/60 border border-emerald-400/50 rounded-2xl text-center space-y-3 shadow-xl">
                  <span className="text-4xl block">🎉</span>
                  <h4 className="text-emerald-300 font-black text-base">Ticket Submitted Successfully!</h4>
                  <div className="bg-emerald-900/40 p-2.5 rounded-xl font-mono text-xs text-emerald-200 border border-emerald-500/30">
                    Ticket ID: <span className="font-bold text-white text-sm">#{submittedTicket.ticket_number}</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Our support team has received your ticket and is reviewing it. You can check updates anytime in the <strong>My Tickets</strong> tab!
                  </p>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setSubmittedTicket(null);
                        setActiveTab('my_tickets');
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      View Ticket History
                    </button>
                    <button
                      onClick={() => setSubmittedTicket(null)}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-gray-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      Submit Another
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleTicketSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 mb-1">Issue Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-purple-950/80 border border-purple-400/40 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-400 transition"
                    >
                      <option>Deposit Issue (UTR / UPI)</option>
                      <option>Withdrawal Processing Status</option>
                      <option>Game Bet / Payout Question</option>
                      <option>Wager Requirement Inquiry</option>
                      <option>Referral / Bonus Reward</option>
                      <option>Account & Security</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 mb-1">Subject / Summary</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Deposit ₹1000 not reflected in wallet"
                      className="w-full bg-purple-950/80 border border-purple-400/40 rounded-xl p-2.5 text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-amber-400 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 mb-1">Describe Your Issue in Detail</label>
                    <textarea
                      rows={4}
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Include transaction ID (UTR), round number, or account details..."
                      className="w-full bg-purple-950/80 border border-purple-400/40 rounded-xl p-2.5 text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-amber-400 transition resize-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-purple-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg active:scale-95 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>{submitting ? 'Submitting Ticket...' : 'Submit Support Ticket'}</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: MY TICKETS (HISTORY & REPLIES) */}
          {activeTab === 'my_tickets' && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-gray-300">Previous Support Requests</span>
                <button
                  onClick={fetchMyTickets}
                  disabled={loadingTickets}
                  className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingTickets ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {loadingTickets ? (
                <div className="py-12 text-center text-gray-400">Loading your tickets...</div>
              ) : myTickets.length === 0 ? (
                <div className="py-10 text-center text-gray-400 space-y-2">
                  <div className="text-3xl">📭</div>
                  <p className="font-semibold text-gray-300">No support tickets found</p>
                  <p className="text-[11px] text-gray-500">You haven't submitted any inquiries yet.</p>
                  <button
                    onClick={() => setActiveTab('ticket')}
                    className="mt-2 px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-purple-950 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Submit a Ticket
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {myTickets.map((t) => (
                    <div
                      key={t.id}
                      className="p-3.5 bg-purple-950/40 border border-purple-500/30 rounded-xl space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-300 text-xs">
                              #{t.ticket_number}
                            </span>
                            <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">
                              {t.category}
                            </span>
                          </div>
                          <h4 className="font-bold text-white text-xs mt-1">{t.subject}</h4>
                        </div>
                        <div>{getStatusBadge(t.status)}</div>
                      </div>

                      <p className="text-xs text-gray-300 leading-relaxed bg-[#100320]/60 p-2.5 rounded-lg border border-purple-500/20">
                        {t.message}
                      </p>

                      {/* Admin Reply */}
                      {t.admin_reply ? (
                        <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-lg p-2.5 space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Official Support Desk Response:</span>
                          </div>
                          <p className="text-xs text-emerald-100 font-sans leading-relaxed">
                            {t.admin_reply}
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                          <AlertCircle className="w-3 h-3 text-amber-400" />
                          <span>Awaiting response from platform team...</span>
                        </div>
                      )}

                      <div className="text-[10px] text-gray-500 text-right font-mono">
                        {t.created_at ? new Date(t.created_at).toLocaleString('en-IN') : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FAQs — rendered from the admin-managed support config */}
          {activeTab === 'faq' && (
            <div className="space-y-2.5 animate-fade-in">
              {faqs.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <p className="text-2xl mb-1.5">❓</p>
                  <p className="text-[11px] text-gray-400">
                    No FAQs have been published yet.
                  </p>
                </div>
              ) : (
                faqs.map((faq, index) => (
                  <div
                    key={faq.id || `faq-${index}`}
                    className="p-3 bg-purple-950/50 border border-purple-400/20 rounded-xl"
                  >
                    <h4 className="font-extrabold text-amber-300 text-xs mb-1">
                      {faq.question}
                    </h4>
                    <p className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-line break-words">
                      {renderAnswer(faq.answer)}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#0f021f] border-t border-purple-500/30 flex items-center justify-between text-[11px] text-purple-300">
          <span>Corona888 Support Protocol v2.4</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-purple-900/60 hover:bg-purple-800 text-white font-bold rounded-lg transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServiceModal;
