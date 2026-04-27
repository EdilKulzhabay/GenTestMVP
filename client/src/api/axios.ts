import axios from 'axios';
import { authStore } from '../store/auth.store';

/** В dev без .env запросы идут через прокси Vite → тот же порт, что и API (см. vite.config `proxy`). */
const baseURL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? '/api/v1' : 'http://localhost:5000/api/v1');

export const axiosInstance = axios.create({
  baseURL,
  withCredentials: true
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      authStore.logout();
      const path = window.location.pathname;
      if (
        !path.startsWith('/welcome') &&
        !path.startsWith('/login') &&
        !path.startsWith('/admin/login') &&
        !path.startsWith('/guest')
      ) {
        const returnUrl = encodeURIComponent(path + window.location.search);
        const isAdminPath = path.startsWith('/admin');
        window.location.assign(
          isAdminPath ? `/admin/login?returnUrl=${returnUrl}` : `/welcome?returnUrl=${returnUrl}`
        );
      }
    }
    return Promise.reject(error);
  }
);
