/**
 * Notification bell, inbox panel and the live-arrival popup.
 *
 * Mounted once in the lobby header so a single websocket serves the whole
 * app. Opening the panel does not mark everything read: a player should be
 * able to glance at the list and come back to it, so read state follows the
 * tap on an item (or the explicit "Mark all read").
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNotifications } from '../../hooks/useNotifications';
import type { PlayerNotification } from '../../services/notificationService';

const CATEGORY_STYLES: Record<string, { label: string; className: string; icon: string }> = {
  PROMO: { label: 'Promo', className: 'bg-amber-500/20 text-amber-300 border-amber-400/40', icon: '🎁' },
  MAINTENANCE: { label: 'Maintenance', className: 'bg-sky-500/20 text-sky-300 border-sky-400/40', icon: '🛠️' },
  ALERT: { label: 'Alert', className: 'bg-rose-500/20 text-rose-300 border-rose-400/40', icon: '⚠️' },
  GENERAL: { label: 'Update', className: 'bg-purple-500/20 text-purple-300 border-purple-400/40', icon: '📢' },
};

const styleFor = (category: string) => CATEGORY_STYLES[category] ?? CATEGORY_STYLES.GENERAL;

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const NotificationBell: React.FC<{ enabled?: boolean }> = ({ enabled = true }) => {
  const {
    items,
    unreadCount,
    loading,
    liveArrival,
    dismissLiveArrival,
    markRead,
    markAllRead,
    refresh,
  } = useNotifications(enabled);

  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The live toast auto-dismisses, but stays long enough to read.
  useEffect(() => {
    if (!liveArrival) return undefined;
    const timer = window.setTimeout(dismissLiveArrival, 8000);
    return () => window.clearTimeout(timer);
  }, [liveArrival, dismissLiveArrival]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) refresh();
  };

  const handleItemTap = (n: PlayerNotification) => {
    setExpandedId((cur) => (cur === n.id ? null : n.id));
    if (!n.is_read) markRead(n.id);
  };

  return (
    <>
      <div className="relative shrink-0" ref={panelRef}>
        <button
          type="button"
          onClick={handleOpen}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          className="relative flex items-center justify-center w-7 h-7 rounded-full bg-purple-950/80 hover:bg-purple-900/90 border border-purple-400/40 text-white transition shadow-md active:scale-95 cursor-pointer"
        >
          <span className="text-[13px] leading-none">🔔</span>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-red-600 border border-red-300/70 text-[9px] font-black text-white flex items-center justify-center shadow">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-[min(88vw,340px)] max-h-[70vh] flex flex-col rounded-2xl bg-[#140a2b] border border-purple-400/40 shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-purple-400/25 bg-gradient-to-r from-[#2d0c61] to-[#1e0744]">
              <span className="text-xs font-extrabold text-white">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[10px] font-bold text-amber-300 hover:text-amber-200 transition cursor-pointer"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {loading && items.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-[11px] text-gray-400">Loading…</p>
              ) : items.length === 0 ? (
                <div className="px-3.5 py-8 text-center">
                  <p className="text-2xl mb-1.5">🔕</p>
                  <p className="text-[11px] text-gray-400">No notifications yet</p>
                </div>
              ) : (
                items.map((n) => {
                  const style = styleFor(n.category);
                  const expanded = expandedId === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleItemTap(n)}
                      className={`w-full text-left px-3.5 py-2.5 border-b border-purple-400/15 transition cursor-pointer ${
                        n.is_read ? 'bg-transparent hover:bg-purple-900/20' : 'bg-purple-500/10 hover:bg-purple-500/20'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-sm shrink-0 mt-0.5">{style.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${style.className}`}>
                              {style.label}
                            </span>
                            {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                            <span className="text-[9px] text-gray-500 ml-auto">{timeAgo(n.created_at)}</span>
                          </div>
                          <p className={`text-[11px] mt-1 ${n.is_read ? 'text-gray-300 font-semibold' : 'text-white font-extrabold'}`}>
                            {n.title}
                          </p>
                          <p className={`text-[10px] text-gray-400 mt-0.5 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                            {n.message}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live arrival popup, shown while the app is open */}
      {liveArrival && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,380px)] animate-fade-in">
          <div className="rounded-2xl bg-gradient-to-r from-[#2d0c61] to-[#1b0540] border border-amber-400/50 shadow-2xl p-3.5 flex items-start gap-2.5">
            <span className="text-lg shrink-0">{styleFor(liveArrival.category).icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-white truncate">{liveArrival.title}</p>
              <p className="text-[11px] text-gray-300 mt-0.5 line-clamp-3 leading-relaxed">{liveArrival.message}</p>
              <button
                type="button"
                onClick={() => {
                  dismissLiveArrival();
                  setOpen(true);
                }}
                className="mt-1.5 text-[10px] font-bold text-amber-300 hover:text-amber-200 cursor-pointer"
              >
                View all
              </button>
            </div>
            <button
              type="button"
              onClick={dismissLiveArrival}
              aria-label="Dismiss notification"
              className="text-gray-400 hover:text-white text-sm leading-none shrink-0 cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
};
