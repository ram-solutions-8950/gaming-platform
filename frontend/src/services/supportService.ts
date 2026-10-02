import api from './api';

export interface SupportContactInfo {
  whatsapp_vip: string;
  whatsapp_url: string;
  support_email: string;
  helpline_number: string;
  working_hours: string;
  faqs: Array<{ id: string; question: string; answer: string }>;
}

export interface UserSupportTicket {
  id: string;
  ticket_number: string;
  category: string;
  subject: string;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  admin_reply: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const supportService = {
  getContactConfig: async (): Promise<SupportContactInfo> => {
    const res = await api.get('/support/contact', { params: { _t: Date.now() } });
    return res.data.data;
  },

  submitTicket: async (category: string, subject: string, message: string) => {
    const res = await api.post('/support/tickets', {
      category,
      subject,
      message,
    });
    return res.data.data;
  },

  getMyTickets: async (): Promise<UserSupportTicket[]> => {
    const res = await api.get('/support/my-tickets');
    return res.data.data;
  },
};
