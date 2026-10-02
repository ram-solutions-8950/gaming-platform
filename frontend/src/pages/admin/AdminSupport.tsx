import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import {
  LifeBuoy,
  MessageCircle,
  Send,
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
  telegram_handle: string;
  telegram_channel: string;
  support_email: string;
  helpline_number: string;
  working_hours: string;
  faqs: FAQItem[];
}

export function AdminSupportPage() {
  const [config, setConfig] = useState<SupportConfig>({
    whatsapp_vip: '+91 98765 43210',
    whatsapp_url: 'https://wa.me/919876543210',
    telegram_handle: '@Corona888Support',
    telegram_channel: 'https://t.me/Corona888Support',
    support_email: 'support@corona888.tech',
    helpline_number: '1800-888-2026',
    working_hours: '24/7 Live Support',
    faqs: [],
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminService
      .getSupportConfig()
      .then((data) => {
        if (data) {
          setConfig({
            whatsapp_vip: data.whatsapp_vip || '',
            whatsapp_url: data.whatsapp_url || '',
            telegram_handle: data.telegram_handle || '',
            telegram_channel: data.telegram_channel || '',
            support_email: data.support_email || '',
            helpline_number: data.helpline_number || '',
            working_hours: data.working_hours || '24/7 Live Support',
            faqs: data.faqs || [],
          });
        }
      })
      .catch((err) => {
        toast.error(err.response?.data?.detail || 'Failed to load support config');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminService.updateSupportConfig(config);
      toast.success('Support configuration updated successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update support configuration');
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <div className="py-24">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-brand-500" />
            Support & VIP Helpdesk Configuration
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Configure direct VIP channels (WhatsApp, Telegram), player helplines, and published knowledge-base FAQs.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-black font-bold rounded-lg text-sm transition shadow-lg disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Config */}
        <div className="lg:col-span-2 space-y-6">
          {/* VIP Channels */}
          <Card className="bg-dark-900 border-dark-800 space-y-4" title="1. Direct VIP Channels">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  WhatsApp VIP Number
                </label>
                <input
                  type="text"
                  value={config.whatsapp_vip}
                  onChange={(e) => setConfig({ ...config, whatsapp_vip: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                  WhatsApp Direct URL
                </label>
                <input
                  type="text"
                  value={config.whatsapp_url}
                  onChange={(e) => setConfig({ ...config, whatsapp_url: e.target.value })}
                  placeholder="https://wa.me/919876543210"
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-sky-400" />
                  Telegram Support Handle
                </label>
                <input
                  type="text"
                  value={config.telegram_handle}
                  onChange={(e) => setConfig({ ...config, telegram_handle: e.target.value })}
                  placeholder="@Corona888Support"
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                  Telegram Group / Channel URL
                </label>
                <input
                  type="text"
                  value={config.telegram_channel}
                  onChange={(e) => setConfig({ ...config, telegram_channel: e.target.value })}
                  placeholder="https://t.me/Corona888Support"
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </Card>

          {/* Official Helpline & Email */}
          <Card className="bg-dark-900 border-dark-800 space-y-4" title="2. Official Helpline & Contact">
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
                  placeholder="support@corona888.tech"
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
                  placeholder="24/7 Live Support (Average reply under 3 minutes)"
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
                className="flex items-center gap-1 px-3 py-1 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-lg text-xs font-semibold transition"
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
                      className="text-gray-500 hover:text-red-400 transition p-1"
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
        </div>

        {/* Right Col: Live VIP Preview Widget & Helpdesk SOP */}
        <div className="space-y-6">
          <Card className="bg-gradient-to-b from-dark-900 to-dark-950 border-brand-500/20 space-y-4">
            <div className="flex items-center gap-2">
              <Headphones className="w-5 h-5 text-brand-400" />
              <h3 className="text-sm font-bold text-white">Live Player Preview</h3>
            </div>
            <p className="text-xs text-gray-400">
              This is how your VIP support lines are rendered on the player application:
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

                <a
                  href={config.telegram_channel || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg text-sky-300 text-xs font-medium transition"
                >
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-sky-400" />
                    <span>Telegram ({config.telegram_handle || 'Not Set'})</span>
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
                <strong className="text-gray-300">Payment Inquiries:</strong> Always request the 12-digit bank UTR before approving manual credits.
              </li>
              <li>
                <strong className="text-gray-300">High Roller Withdrawals:</strong> Withdrawals over ₹50,000 should be dual-verified by finance supervisor.
              </li>
              <li>
                <strong className="text-gray-300">Disputed Rounds:</strong> Inspect audit logs under <code className="text-brand-400">/admin/audit-logs</code> with round reference ID.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
