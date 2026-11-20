import api from './api';

export interface PlayerNotification {
  id: string;
  title: string;
  message: string;
  category: 'GENERAL' | 'PROMO' | 'MAINTENANCE' | 'ALERT' | string;
  created_at: string | null;
  is_read: boolean;
  read_at?: string | null;
}

export interface NotificationInbox {
  items: PlayerNotification[];
  unread_count: number;
}

export const notificationService = {
  getInbox: async (limit = 50): Promise<NotificationInbox> => {
    const res = await api.get('/notifications', { params: { limit } });
    return res.data.data;
  },

  getUnreadCount: async (): Promise<number> => {
    const res = await api.get('/notifications/unread-count');
    return res.data.data?.unread_count ?? 0;
  },

  markRead: async (id: string): Promise<number> => {
    const res = await api.post(`/notifications/${id}/read`);
    return res.data.data?.unread_count ?? 0;
  },

  markAllRead: async (): Promise<number> => {
    const res = await api.post('/notifications/read-all');
    return res.data.data?.unread_count ?? 0;
  },
};
