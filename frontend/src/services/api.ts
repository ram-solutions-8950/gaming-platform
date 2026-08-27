import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.trim() : '') || 'http://76.13.177.44/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh_token = localStorage.getItem('refresh_token');
      if (refresh_token) {
        try {
          const res = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refresh_token });
          const { access_token, refresh_token: new_refresh } = res.data.data;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', new_refresh);
          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${access_token}`;
          return api(original);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          if (typeof window !== 'undefined') window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
