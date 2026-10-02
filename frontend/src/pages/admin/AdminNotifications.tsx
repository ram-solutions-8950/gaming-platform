import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import {
  Bell,
  RefreshCw,
  CheckCheck,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldAlert,
  AlertTriangle,
  Info,
  Clock,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AdminNotification {
  id: string;
  type: 'WITHDRAWAL' | 'DEPOSIT' | 'SYSTEM' | string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  title: string;
  message: string;
  created_at: string;
  link: string;
  action_id?: string;
  is_read: boolean;
}

export function AdminNotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'HIGH' | 'WITHDRAWAL' | 'DEPOSIT' | 'SYSTEM'>('ALL');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await adminService.getNotifications(50);
      if (data) {
        setNotifications(data.items || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to fetch admin notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(() => {
      fetchNotifications(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    toast.success('Marked all notifications as read');
  };

  const handleToggleRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id === id) {
          const nextState = !n.is_read;
          setUnreadCount((c) => (nextState ? Math.max(0, c - 1) : c + 1));
          return { ...n, is_read: nextState };
        }
        return n;
      })
    );
  };

  const handleQuickApproveWithdrawal = async (notifId: string, withdrawalId?: string) => {
    if (!withdrawalId) return;
    setActionInProgress(notifId);
    try {
      await adminService.approveWithdrawal(withdrawalId);
      toast.success('Withdrawal approved successfully');
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true, message: `${n.message} (APPROVED)` } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to approve withdrawal');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleQuickRejectWithdrawal = async (notifId: string, withdrawalId?: string) => {
    if (!withdrawalId) return;
    const reason = window.prompt('Enter rejection reason for player:');
    if (reason === null) return;

    setActionInProgress(notifId);
    try {
      await adminService.rejectWithdrawal(withdrawalId, reason || 'Administrative review');
      toast.success('Withdrawal rejected and funds refunded');
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true, message: `${n.message} (REJECTED)` } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to reject withdrawal');
    } finally {
      setActionInProgress(null);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'HIGH') return n.priority === 'HIGH';
    if (activeFilter === 'WITHDRAWAL') return n.type === 'WITHDRAWAL';
    if (activeFilter === 'DEPOSIT') return n.type === 'DEPOSIT';
    if (activeFilter === 'SYSTEM') return n.type === 'SYSTEM';
    return true;
  });

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            CRITICAL
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" />
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Info className="w-3 h-3" />
            INFO
          </span>
        );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'WITHDRAWAL':
        return <ArrowUpRight className="w-5 h-5 text-red-400" />;
      case 'DEPOSIT':
        return <ArrowDownLeft className="w-5 h-5 text-emerald-400" />;
      case 'SYSTEM':
        return <ShieldAlert className="w-5 h-5 text-amber-400" />;
      default:
        return <Bell className="w-5 h-5 text-brand-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Bell className="w-6 h-6 text-brand-500" />
              Notifications & Action Center
            </h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                {unreadCount} Unread
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm mt-1">
            Real-time feed of player withdrawals, high-value deposit verifications, and audit alerts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-2 px-3.5 py-2 bg-dark-800 hover:bg-dark-700 text-gray-200 rounded-lg text-sm font-medium border border-dark-600 transition disabled:opacity-40"
          >
            <CheckCheck className="w-4 h-4 text-emerald-400" />
            Mark All Read
          </button>
          <button
            onClick={() => fetchNotifications(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-black font-semibold rounded-lg text-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-dark-800 pb-3">
        {[
          { key: 'ALL', label: 'All Alerts' },
          { key: 'HIGH', label: 'Actionable / Critical' },
          { key: 'WITHDRAWAL', label: 'Withdrawal Payouts' },
          { key: 'DEPOSIT', label: 'Deposits' },
          { key: 'SYSTEM', label: 'System Logs' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key as any)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeFilter === tab.key
                ? 'bg-brand-500 text-black shadow-md'
                : 'bg-dark-900 text-gray-400 hover:text-gray-200 hover:bg-dark-800 border border-dark-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <Card className="!p-0 bg-dark-900 border-dark-800 divide-y divide-dark-800/80 overflow-hidden">
        {loading ? (
          <div className="py-20">
            <Loader size="lg" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald-400" />
            <p className="text-base font-medium text-gray-300">You are all caught up!</p>
            <p className="text-xs text-gray-500 mt-1">No alerts matching the selected filter.</p>
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-5 transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                !notif.is_read ? 'bg-dark-950/60 border-l-4 border-l-brand-500' : 'hover:bg-dark-800/30'
              }`}
            >
              {/* Left Details */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-dark-800 border border-dark-700 flex items-center justify-center shrink-0 mt-0.5">
                  {getTypeIcon(notif.type)}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-sm text-gray-100">{notif.title}</span>
                    {getPriorityBadge(notif.priority)}
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-brand-500 inline-block" title="Unread" />
                    )}
                  </div>

                  <p className="text-sm text-gray-400">{notif.message}</p>

                  <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {new Date(notif.created_at).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'medium',
                      })}
                    </span>
                    <button
                      onClick={() => handleToggleRead(notif.id)}
                      className="text-gray-400 hover:text-brand-400 underline underline-offset-2"
                    >
                      {notif.is_read ? 'Mark as Unread' : 'Mark as Read'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons on Right */}
              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                {notif.type === 'WITHDRAWAL' && notif.action_id && !notif.message.includes('(APPROVED)') && !notif.message.includes('(REJECTED)') && (
                  <>
                    <button
                      onClick={() => handleQuickApproveWithdrawal(notif.id, notif.action_id)}
                      disabled={actionInProgress === notif.id}
                      className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                    >
                      {actionInProgress === notif.id ? 'Processing...' : 'Quick Approve'}
                    </button>
                    <button
                      onClick={() => handleQuickRejectWithdrawal(notif.id, notif.action_id)}
                      disabled={actionInProgress === notif.id}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}

                <button
                  onClick={() => navigate(notif.link)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-gray-300 hover:text-white border border-dark-700 rounded-lg text-xs font-medium transition"
                >
                  <span>Open Page</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
