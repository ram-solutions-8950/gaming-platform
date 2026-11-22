/**
 * Notification bell, inbox panel and the live-arrival popup.
 *
 * Uses createPortal directly onto document.body to escape header clipping
 * (e.g. overflow-x-auto in mobile headers) and stacking context limits,
 * ensuring flawless tap-to-open on both mobile APK and desktop browsers.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

  // Close on Escape key.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      <div className="relative shrink-0 flex items-center">
        <button
          type="button"
          onClick={handleOpen}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          className="relative flex items-center justify-center w-8 h-8 rounded-full bg-purple-950/90 hover:bg-purple-900 border border-purple-400/50 text-white transition shadow-md active:scale-95 cursor-pointer touch-manipulation"
        >
          <span className="text-sm leading-none select-none">🔔</span>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-red-600 border border-red-300/80 text-[10px] font-black text-white flex items-center justify-center shadow-md animate-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {open &&
          createPortal(
            <div
              className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                ref={panelRef}
                className="relative w-full max-w-sm max-h-[82vh] flex flex-col rounded-3xl bg-gradient-to-b from-[#240c49] via-[#16062d] to-[#0c021c] border border-purple-400/50 shadow-[0_0_50px_rgba(168,85,247,0.35)] overflow-hidden animate-scale-in"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-purple-400/25 bg-gradient-to-r from-[#3b0f7d] to-[#200749] shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">🔔</span>
                    <span className="text-sm font-black text-white tracking-wide">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-red-600 border border-red-300/70 text-[9px] font-black text-white">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="text-[11px] font-black text-amber-300 hover:text-amber-200 px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/30 transition cursor-pointer active:scale-95"
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center text-sm font-bold transition cursor-pointer"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Notification List */}
                <div className="overflow-y-auto flex-1 divide-y divide-purple-400/15">
                  {loading && items.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-gray-400">Loading notifications…</p>
                  ) : items.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <p className="text-3xl mb-2">🔕</p>
                      <p className="text-xs font-bold text-gray-300">No notifications yet</p>
                      <p className="text-[10px] text-gray-500 mt-1">Platform updates and bonuses will appear here.</p>
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
                          className={`w-full text-left px-4 py-3 transition cursor-pointer active:bg-purple-900/30 ${
                            n.is_read
                              ? 'bg-transparent hover:bg-purple-900/20'
                              : 'bg-purple-500/15 hover:bg-purple-500/25'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-xl shrink-0 mt-0.5">{style.icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${style.className}`}
                                >
                                  {style.label}
                                </span>
                                {!n.is_read && (
                                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-sm shadow-amber-400 animate-pulse" />
                                )}
                                <span className="text-[10px] text-gray-400 ml-auto font-mono">
                                  {timeAgo(n.created_at)}
                                </span>
                              </div>
                              <p
                                className={`text-xs mt-1 leading-snug ${
                                  n.is_read ? 'text-gray-200 font-bold' : 'text-white font-black'
                                }`}
                              >
                                {n.title}
                              </p>
                              <p
                                className={`text-[11px] text-gray-300 mt-1 leading-relaxed break-words whitespace-pre-wrap ${
                                  expanded ? '' : 'line-clamp-2'
                                }`}
                              >
                                {n.message}
                              </p>
                              {n.message && n.message.length > 70 && (
                                <span className="text-[9px] text-amber-300 font-extrabold mt-1 inline-block">
                                  {expanded ? '▲ Show less' : '▼ Tap to read full message'}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>

      {/* Live arrival popup, shown while the app is open */}
      {liveArrival &&
        createPortal(
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[10001] w-[min(94vw,400px)] animate-fade-in pointer-events-auto">
            <div
              onClick={() => {
                dismissLiveArrival();
                setOpen(true);
              }}
              className="rounded-2xl bg-gradient-to-r from-[#2d0c61] via-[#1f0747] to-[#12022e] border border-amber-400/60 shadow-[0_10px_35px_rgba(0,0,0,0.85)] p-3.5 flex items-start gap-3 cursor-pointer active:scale-98 transition select-none"
            >
              <span className="text-2xl shrink-0 mt-0.5">{styleFor(liveArrival.category).icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded border ${styleFor(liveArrival.category).className}`}
                  >
                    {styleFor(liveArrival.category).label}
                  </span>
                  <span className="text-[10px] font-black text-amber-300">New Notification</span>
                  <span className="text-[9px] text-gray-400 ml-auto font-mono">Tap to open</span>
                </div>
                <p className="text-xs font-black text-white truncate leading-tight">{liveArrival.title}</p>
                <p className="text-[11px] text-gray-300 mt-1 line-clamp-2 leading-relaxed">{liveArrival.message}</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissLiveArrival();
                }}
                aria-label="Dismiss notification"
                className="text-gray-400 hover:text-white text-base leading-none p-1 shrink-0 cursor-pointer"
              >
                ×
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
