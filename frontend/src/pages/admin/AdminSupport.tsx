import { useEffect, useState, useCallback } from 'react';
import { adminService } from '../../services/adminService';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import {
  LifeBuoy,
  MessageCircle,
  Mail,
  Phone,
  Clock,
  Save,
  Plus,
  Trash2,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Headphones,
  Search,
  X,
  Send,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

interface SupportConfig {
  whatsapp_vip: string;
  whatsapp_url: string;
  support_email: string;
  helpline_number: string;
  working_hours: string;
  faqs: FAQItem[];
}

interface AdminTicketItem {
  id: string;
  ticket_number: string;
  user_id: string;
  user_name: string;
  username: string;
  user_email: string;
  category: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  admin_reply: string | null;
  resolved_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function AdminSupportPage() {
  const [activeTab, setActiveTab] = useState<'tickets' | 'channels'>('tickets');

  // Tickets State
  const [tickets, setTickets] = useState<AdminTicketItem[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketPage, setTicketPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Selected Ticket for View / Reply Modal
  const [selectedTicket, setSelectedTicket] = useState<AdminTicketItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<string>('RESOLVED');
  const [updatingTicket, setUpdatingTicket] = useState(false);

  // Channels Config State
  const [config, setConfig] = useState<SupportConfig>({
    whatsapp_vip: '+91 98765 43210',
    whatsapp_url: 'https://wa.me/919876543210',
    support_email: 'support@corona888.com',
    helpline_number: '1800-888-2026',
    working_hours: '24/7 Priority Support Desk',
    faqs: [],
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  const pageSize = 15;

  const fetchTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const data = await adminService.getSupportTickets(
        ticketPage,
        pageSize,
        statusFilter,
        categoryFilter,
        search.trim() || undefined
      );
      if (data) {
        setTickets(data.items || []);
        setTotalTickets(data.total || 0);
      }
    } catch (err: any) {
      toast.error('Failed to load support tickets');
    } finally {
      setTicketsLoading(false);
    }
  }, [ticketPage, statusFilter, categoryFilter, search]);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const data = await adminService.getSupportConfig();
      if (data) {
        setConfig({
          whatsapp_vip: data.whatsapp_vip || '',
          whatsapp_url: data.whatsapp_url || '',
          support_email: data.support_email || '',
          helpline_number: data.helpline_number || '',
          working_hours: data.working_hours || '24/7 Priority Support Desk',
          faqs: data.faqs || [],
        });
      }
    } catch {
      toast.error('Failed to load support configuration');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (activeTab === 'channels') {
      fetchConfig();
    }
  }, [activeTab, fetchConfig]);

  const handleOpenTicketModal = (ticket: AdminTicketItem) => {
    setSelectedTicket(ticket);
    setReplyText(ticket.admin_reply || '');
    setReplyStatus(ticket.status === 'OPEN' ? 'RESOLVED' : ticket.status);
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    setUpdatingTicket(true);
    try {
      await adminService.updateSupportTicket(selectedTicket.id, {
        status: replyStatus,
        admin_reply: replyText.trim() || undefined,
      });
      toast.success('Ticket updated and reply sent successfully!');
      setSelectedTicket(null);
      fetchTickets();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update ticket');
    } finally {
      setUpdatingTicket(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await adminService.updateSupportConfig(config);
      toast.success('Support configuration updated successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update support configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddFaq = () => {
    const newId = `faq-${Date.now()}`;
    setConfig((prev) => ({
      ...prev,
      faqs: [
        ...prev.faqs,
        {
          id: newId,
          question: 'New Question?',
          answer: 'Detailed resolution steps for player inquiries.',
        },
      ],
    }));
  };

  const handleUpdateFaq = (index: number, field: 'question' | 'answer', value: string) => {
    setConfig((prev) => {
      const nextFaqs = [...prev.faqs];
      nextFaqs[index] = { ...nextFaqs[index], [field]: value };
      return { ...prev, faqs: nextFaqs };
    });
  };

  const handleDeleteFaq = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      faqs: prev.faqs.filter((_, i) => i !== index),
    }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            OPEN
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            IN PROGRESS
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            RESOLVED
          </span>
        );
      case 'CLOSED':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">
            CLOSED
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalTickets / pageSize));

  // Compute status counts for metrics
  const openCount = tickets.filter((t) => t.status === 'OPEN').length;
  const inProgressCount = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
  const resolvedCount = tickets.filter((t) => t.status === 'RESOLVED').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-brand-400" />
            Support & Helpdesk Management
          </h1>
          <p className="text-gray-400 text-xs mt-1">
            Resolve player tickets, reply with official support notes, and configure VIP channels.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 p-1 bg-[#111726] border border-[#1d273d] rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'tickets'
                ? 'bg-brand-500 text-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Headphones size={15} />
            <span>Tickets Queue ({totalTickets})</span>
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'channels'
                ? 'bg-brand-500 text-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <MessageCircle size={15} />
            <span>Channels & Settings</span>
          </button>
        </div>
      </div>

      {/* TAB 1: TICKETS QUEUE */}
      {activeTab === 'tickets' && (
        <div className="space-y-6 animate-fade-in">
          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Tickets</span>
              <p className="text-2xl font-black text-white mt-1 font-mono">{totalTickets}</p>
            </div>
            <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Open / Pending</span>
              <p className="text-2xl font-black text-amber-400 mt-1 font-mono">{openCount}</p>
            </div>
            <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">In Progress</span>
              <p className="text-2xl font-black text-cyan-400 mt-1 font-mono">{inProgressCount}</p>
            </div>
            <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Resolved</span>
              <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">{resolvedCount}</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by ticket #, username, subject, or message..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setTicketPage(1);
                }}
                className="w-full bg-[#111726] border border-[#1d273d] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setTicketPage(1);
              }}
              className="bg-[#111726] border border-[#1d273d] text-white text-xs font-semibold rounded-xl px-4 py-2.5 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">OPEN Only</option>
              <option value="IN_PROGRESS">IN PROGRESS Only</option>
              <option value="RESOLVED">RESOLVED Only</option>
              <option value="CLOSED">CLOSED Only</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setTicketPage(1);
              }}
              className="bg-[#111726] border border-[#1d273d] text-white text-xs font-semibold rounded-xl px-4 py-2.5 focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="Deposit">Deposit Issues</option>
              <option value="Withdrawal">Withdrawal Issues</option>
              <option value="Game">Game / Bet Inquiries</option>
              <option value="Wager">Wager Requirement</option>
              <option value="Account">Account & Security</option>
            </select>

            <button
              onClick={() => fetchTickets()}
              className="p-2.5 rounded-xl bg-[#111726] border border-[#1d273d] text-gray-300 hover:text-white transition cursor-pointer"
              title="Refresh tickets"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Tickets Table */}
          <Card title="Player Support Tickets">
            {ticketsLoading ? (
              <div className="py-16 flex justify-center">
                <Loader size="lg" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <LifeBuoy className="w-12 h-12 mx-auto mb-3 opacity-30 text-brand-400" />
                <p className="text-base font-semibold text-gray-300">No support tickets found</p>
                <p className="text-xs text-gray-500 mt-1">Player inquiries submitted from the APK or web app will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="text-gray-400 border-b border-[#1d273d] uppercase text-[10px]">
                      <th className="py-3 px-3">Ticket #</th>
                      <th className="py-3 px-3">Player</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3">Subject</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#182136]">
                    {tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-[#141b2d] transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-amber-300 whitespace-nowrap">
                          #{t.ticket_number}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-bold text-white block">{t.user_name || 'Player'}</span>
                          <span className="text-[11px] text-gray-400 font-mono">@{t.username || t.user_id.slice(0, 8)}</span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {t.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 max-w-xs truncate text-gray-200">
                          {t.subject}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {getStatusBadge(t.status)}
                        </td>
                        <td className="py-3 px-3 text-gray-400 whitespace-nowrap">
                          {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleOpenTicketModal(t)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1a233a] hover:bg-brand-500 hover:text-black text-gray-200 border border-[#222c44] transition cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>View / Reply</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalTickets > pageSize && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#1d273d] text-xs text-gray-400">
                <span>
                  Showing {(ticketPage - 1) * pageSize + 1} - {Math.min(ticketPage * pageSize, totalTickets)} of {totalTickets} tickets
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTicketPage((p) => Math.max(1, p - 1))}
                    disabled={ticketPage === 1}
                    className="p-1.5 rounded-lg bg-[#141b2d] border border-[#222c44] text-gray-300 hover:text-white disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span>
                    Page {ticketPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setTicketPage((p) => Math.min(totalPages, p + 1))}
                    disabled={ticketPage >= totalPages}
                    className="p-1.5 rounded-lg bg-[#141b2d] border border-[#222c44] text-gray-300 hover:text-white disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </Card>

          {/* Modal: View / Reply Ticket */}
          {selectedTicket && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-[#0f1422] border border-[#222c44] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#222c44]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-300 text-sm">
                        #{selectedTicket.ticket_number}
                      </span>
                      {getStatusBadge(selectedTicket.status)}
                    </div>
                    <span className="text-xs text-gray-400 mt-0.5 block">{selectedTicket.category}</span>
                  </div>
                  <button
                    onClick={() => setSelectedTicket(null)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white transition"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-[#141b2d] rounded-xl border border-[#222c44] flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Player</span>
                      <span className="font-bold text-white text-sm">{selectedTicket.user_name || 'Player'}</span>
                      <span className="text-gray-400 font-mono text-[11px] block">@{selectedTicket.username} • {selectedTicket.user_id}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Submitted</span>
                      <span className="text-gray-300 font-mono">
                        {selectedTicket.created_at ? new Date(selectedTicket.created_at).toLocaleString('en-IN') : '—'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Subject
                    </label>
                    <p className="font-bold text-white text-sm">{selectedTicket.subject}</p>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Player Message
                    </label>
                    <div className="p-3 bg-[#141b2d] border border-[#222c44] rounded-xl text-gray-200 leading-relaxed font-sans max-h-36 overflow-y-auto">
                      {selectedTicket.message}
                    </div>
                  </div>

                  <form onSubmit={handleUpdateTicket} className="space-y-3 pt-2 border-t border-[#222c44]">
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block mb-1">
                        Update Ticket Status
                      </label>
                      <select
                        value={replyStatus}
                        onChange={(e) => setReplyStatus(e.target.value)}
                        className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                      >
                        <option value="OPEN">OPEN (Under Review)</option>
                        <option value="IN_PROGRESS">IN PROGRESS (Investigating)</option>
                        <option value="RESOLVED">RESOLVED (Resolution Provided)</option>
                        <option value="CLOSED">CLOSED (Issue Concluded)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block mb-1">
                        Official Admin Reply (Visible to Player in App)
                      </label>
                      <textarea
                        rows={3}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type response to player explaining resolution, UTR verification, or instructions..."
                        className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl p-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTicket(null)}
                        className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={updatingTicket}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold bg-brand-500 hover:bg-brand-600 text-black transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send size={14} />
                        <span>{updatingTicket ? 'Saving...' : 'Send Reply & Save'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CHANNELS & SETTINGS (WhatsApp Direct, Email, Helplines) */}
      {activeTab === 'channels' && (
        <div className="space-y-6 animate-fade-in max-w-5xl">
          {configLoading ? (
            <div className="py-20 flex justify-center">
              <Loader size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Form Config */}
              <div className="lg:col-span-2 space-y-6">
                {/* WhatsApp VIP Channel */}
                <Card className="bg-dark-900 border-dark-800 space-y-4" title="1. WhatsApp VIP Desk (Player Modal)">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        WhatsApp Support Number
                      </label>
                      <input
                        type="text"
                        value={config.whatsapp_vip}
                        onChange={(e) => setConfig({ ...config, whatsapp_vip: e.target.value })}
                        placeholder="+91 98765 43210"
                        className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                        WhatsApp Direct URL (wa.me link)
                      </label>
                      <input
                        type="text"
                        value={config.whatsapp_url}
                        onChange={(e) => setConfig({ ...config, whatsapp_url: e.target.value })}
                        placeholder="https://wa.me/919876543210"
                        className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500 font-mono"
                      />
                    </div>
                  </div>
                </Card>

                {/* Official Helpline & Email */}
                <Card className="bg-dark-900 border-dark-800 space-y-4" title="2. Official Support Email & Desk Info">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-brand-400" />
                        Support Email Address
                      </label>
                      <input
                        type="email"
                        value={config.support_email}
                        onChange={(e) => setConfig({ ...config, support_email: e.target.value })}
                        placeholder="support@corona888.com"
                        className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-brand-400" />
                        Helpline / Toll-Free Number
                      </label>
                      <input
                        type="text"
                        value={config.helpline_number}
                        onChange={(e) => setConfig({ ...config, helpline_number: e.target.value })}
                        placeholder="1800-888-2026"
                        className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-brand-400" />
                        Operating Hours / Response SLA
                      </label>
                      <input
                        type="text"
                        value={config.working_hours}
                        onChange={(e) => setConfig({ ...config, working_hours: e.target.value })}
                        placeholder="24/7 Priority Support Desk (Average reply under 2 minutes)"
                        className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>
                </Card>

                {/* FAQs Manager */}
                <Card className="bg-dark-900 border-dark-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-brand-500" />
                      Frequently Asked Questions (FAQs)
                    </h2>
                    <button
                      type="button"
                      onClick={handleAddFaq}
                      className="flex items-center gap-1 px-3 py-1 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-lg text-xs font-semibold transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add FAQ
                    </button>
                  </div>

                  <div className="space-y-4">
                    {config.faqs.map((faq, index) => (
                      <div key={faq.id || index} className="p-4 bg-dark-950 border border-dark-800 rounded-xl space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-brand-400 font-mono">Q#{index + 1}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteFaq(index)}
                            className="text-gray-500 hover:text-red-400 transition p-1 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <input
                          type="text"
                          value={faq.question}
                          onChange={(e) => handleUpdateFaq(index, 'question', e.target.value)}
                          placeholder="Question..."
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-medium focus:outline-none focus:border-brand-500"
                        />

                        <textarea
                          rows={2}
                          value={faq.answer}
                          onChange={(e) => handleUpdateFaq(index, 'answer', e.target.value)}
                          placeholder="Answer for players..."
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-brand-500 resize-none"
                        />
                      </div>
                    ))}
                  </div>
                </Card>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveConfig}
                    disabled={savingConfig}
                    className="flex items-center gap-2 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-black font-black rounded-xl text-xs uppercase tracking-wider transition shadow-lg disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingConfig ? 'Saving...' : 'Save All Settings'}</span>
                  </button>
                </div>
              </div>

              {/* Right Col: Live VIP Preview Widget & Helpdesk SOP */}
              <div className="space-y-6">
                <Card className="bg-gradient-to-b from-dark-900 to-dark-950 border-brand-500/20 space-y-4">
                  <div className="flex items-center gap-2">
                    <Headphones className="w-5 h-5 text-brand-400" />
                    <h3 className="text-sm font-bold text-white">Live Player Preview</h3>
                  </div>
                  <p className="text-xs text-gray-400">
                    Live representation in player app:
                  </p>

                  <div className="p-4 bg-dark-950 border border-dark-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-dark-800 pb-2">
                      <span className="text-xs font-semibold text-gray-300">VIP Channel</span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono font-bold">
                        {config.working_hours}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <a
                        href={config.whatsapp_url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs font-medium transition"
                      >
                        <div className="flex items-center gap-2">
                          <MessageCircle className="w-4 h-4 text-emerald-400" />
                          <span>WhatsApp VIP ({config.whatsapp_vip || 'Not Set'})</span>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>

                      <div className="p-2.5 bg-dark-900 border border-dark-800 rounded-lg text-xs space-y-1">
                        <div className="flex items-center justify-between text-gray-400">
                          <span>Helpline:</span>
                          <span className="text-gray-200 font-mono font-bold">{config.helpline_number}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-400">
                          <span>Email:</span>
                          <span className="text-gray-200 font-mono">{config.support_email}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="bg-dark-900 border-dark-800 space-y-3">
                  <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-brand-500" />
                    Agent Escalation SOP
                  </h3>
                  <ul className="text-xs text-gray-400 space-y-2 list-disc list-inside">
                    <li>
                      <strong className="text-gray-300">Deposit Tickets:</strong> Cross-check 12-digit UTR with bank/gateway statement before approving.
                    </li>
                    <li>
                      <strong className="text-gray-300">Withdrawal Holds:</strong> Verify player's wager turnover progress under Wager Controls.
                    </li>
                    <li>
                      <strong className="text-gray-300">Disputed Rounds:</strong> Inspect audit logs under <code className="text-brand-400">/admin/audit-logs</code>.
                    </li>
                  </ul>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
