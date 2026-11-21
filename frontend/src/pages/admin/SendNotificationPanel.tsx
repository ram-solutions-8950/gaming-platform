/**
 * Compose and send in-app notifications to players.
 *
 * Two audiences: everyone, or a hand-picked set of players found by search.
 * A broadcast is irreversible in the sense that players may read it
 * instantly, so sending to everyone asks for confirmation first — and the
 * sent list offers a retraction that pulls it from every inbox.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '../../components/common/Card';
import { adminService } from '../../services/adminService';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Send, Users, User as UserIcon, X, Trash2, Search } from 'lucide-react';

interface PickedUser {
  id: string;
  username: string;
  name?: string | null;
  role?: string | null;
}

interface SentNotification {
  id: string;
  title: string;
  message: string;
  category: string;
  audience: 'ALL' | 'SELECTED' | string;
  is_active: boolean;
  created_at: string | null;
  author_name?: string | null;
  recipient_count?: number | null;
  read_count: number;
}

const CATEGORIES = [
  { value: 'GENERAL', label: 'General update' },
  { value: 'PROMO', label: 'Promotion' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'ALERT', label: 'Important alert' },
];

const MAX_TITLE = 140;
const MAX_MESSAGE = 2000;

export const SendNotificationPanel: React.FC = () => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [audience, setAudience] = useState<'ALL' | 'SELECTED'>('ALL');
  const [sending, setSending] = useState(false);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PickedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PickedUser[]>([]);

  const [sent, setSent] = useState<SentNotification[]>([]);
  const [loadingSent, setLoadingSent] = useState(false);

  const searchTimer = useRef<number | null>(null);

  const loadSent = useCallback(async () => {
    setLoadingSent(true);
    try {
      setSent(await adminService.getSentNotifications(30));
    } catch {
      // Non-fatal: composing still works without the history.
    } finally {
      setLoadingSent(false);
    }
  }, []);

  useEffect(() => {
    loadSent();
  }, [loadSent]);

  // Debounced player search, so typing does not fire a request per keystroke.
  useEffect(() => {
    if (audience !== 'SELECTED') return undefined;
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      return undefined;
    }

    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get('/admin/users', {
          params: { search: term, page: 1, page_size: 15 },
        });
        const items = res.data?.data?.items ?? res.data?.data ?? [];
        setResults(
          (Array.isArray(items) ? items : []).map((u: any) => ({
            id: String(u.id),
            username: u.username,
            name: u.name,
            role: u.role,
          })),
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    };
  }, [search, audience]);

  const togglePick = (user: PickedUser) => {
    setSelected((prev) =>
      prev.some((p) => p.id === user.id)
        ? prev.filter((p) => p.id !== user.id)
        : [...prev, user],
    );
  };

  const resetForm = () => {
    setTitle('');
    setMessage('');
    setCategory('GENERAL');
    setSelected([]);
    setSearch('');
    setResults([]);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error('Title and message are both required.');
      return;
    }
    if (audience === 'SELECTED' && selected.length === 0) {
      toast.error('Pick at least one player, or switch to "Everyone".');
      return;
    }
    if (
      audience === 'ALL' &&
      !window.confirm(
        'Send this to EVERY player? They will see it immediately in the app. ' +
          'You can withdraw it afterwards, but players may have read it by then.',
      )
    ) {
      return;
    }

    setSending(true);
    try {
      const result = await adminService.sendNotification({
        title: title.trim(),
        message: message.trim(),
        category,
        audience,
        user_ids: audience === 'SELECTED' ? selected.map((u) => u.id) : undefined,
      });
      toast.success(
        audience === 'ALL'
          ? `Sent to all players (${result.recipients} recipients).`
          : `Sent to ${result.recipients} player(s).`,
      );
      resetForm();
      loadSent();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          'Could not send the notification.',
      );
    } finally {
      setSending(false);
    }
  };

  const handleRetract = async (n: SentNotification) => {
    if (!window.confirm(`Withdraw "${n.title}" from every player's inbox?`)) return;
    try {
      await adminService.retractNotification(n.id);
      toast.success('Withdrawn from all inboxes.');
      loadSent();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not withdraw it.');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-dark-900 border-dark-800 space-y-4" title="Send a notification to players">
        <form onSubmit={handleSend} className="space-y-4">
          {/* Audience */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">Who should receive this?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setAudience('ALL')}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                  audience === 'ALL'
                    ? 'bg-brand-500/15 border-brand-500 text-white'
                    : 'bg-dark-950 border-dark-700 text-gray-400 hover:border-dark-600'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>
                  <span className="block text-xs font-bold">Bulk Broadcast (Everyone)</span>
                  <span className="block text-[10px] text-gray-500">Send to all players in bulk</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAudience('SELECTED')}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition cursor-pointer ${
                  audience === 'SELECTED'
                    ? 'bg-brand-500/15 border-brand-500 text-white'
                    : 'bg-dark-950 border-dark-700 text-gray-400 hover:border-dark-600'
                }`}
              >
                <UserIcon className="w-4 h-4 shrink-0" />
                <span>
                  <span className="block text-xs font-bold">Separate / Selected Users</span>
                  <span className="block text-[10px] text-gray-500">
                    {selected.length > 0 ? `${selected.length} user(s) selected` : 'Search and pick specific users'}
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Player picker */}
          {audience === 'SELECTED' && (
            <div className="rounded-xl border border-dark-700 bg-dark-950 p-3 space-y-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by username, name, email or phone…"
                  className="w-full bg-dark-900 border border-dark-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.map((u) => (
                    <span
                      key={u.id}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-500/20 border border-brand-500/40 text-[11px] text-white"
                    >
                      @{u.username}
                      <button
                        type="button"
                        onClick={() => togglePick(u)}
                        aria-label={`Remove ${u.username}`}
                        className="text-gray-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {searching && <p className="text-[11px] text-gray-500">Searching…</p>}
              {!searching && search.trim().length >= 2 && results.length === 0 && (
                <p className="text-[11px] text-gray-500">No players matched.</p>
              )}
              {results.length > 0 && (
                <div className="max-h-44 overflow-y-auto divide-y divide-dark-800 rounded-lg border border-dark-800">
                  {results.map((u) => {
                    const picked = selected.some((p) => p.id === u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => togglePick(u)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition cursor-pointer ${
                          picked ? 'bg-brand-500/15 text-white' : 'text-gray-300 hover:bg-dark-800'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-semibold">@{u.username}</span>
                          {u.name && <span className="text-gray-500">{u.name}</span>}
                          {u.role && u.role !== 'USER' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {u.role}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-gray-500">{picked ? 'Selected' : 'Add'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Type</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Title <span className="text-gray-500 font-normal">({title.length}/{MAX_TITLE})</span>
            </label>
            <input
              type="text"
              value={title}
              maxLength={MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Diwali bonus is live"
              className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Message <span className="text-gray-500 font-normal">({message.length}/{MAX_MESSAGE})</span>
            </label>
            <textarea
              value={message}
              maxLength={MAX_MESSAGE}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Write what players should see…"
              className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500 resize-y"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-lg text-xs text-gray-400 hover:text-white transition cursor-pointer"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold transition disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? 'Sending…' : audience === 'ALL' ? 'Send to everyone' : `Send to ${selected.length || 0}`}
            </button>
          </div>
        </form>
      </Card>

      {/* Sent history */}
      <Card className="bg-dark-900 border-dark-800" title="Recently sent">
        {loadingSent && sent.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">Loading…</p>
        ) : sent.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">Nothing sent yet.</p>
        ) : (
          <div className="divide-y divide-dark-800">
            {sent.map((n) => (
              <div key={n.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white">{n.title}</span>
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-dark-800 text-gray-400 border border-dark-700">
                      {n.category}
                    </span>
                    {!n.is_active && (
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        Withdrawn
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {n.audience === 'ALL' ? 'All players' : `${n.recipient_count ?? 0} selected`}
                    {' · '}
                    {n.read_count} read
                    {n.created_at ? ` · ${new Date(n.created_at).toLocaleString()}` : ''}
                    {n.author_name ? ` · by @${n.author_name}` : ''}
                  </p>
                </div>
                {n.is_active && (
                  <button
                    type="button"
                    onClick={() => handleRetract(n)}
                    title="Withdraw from all inboxes"
                    className="shrink-0 p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
