import axios from 'axios';
import { authStore } from '../store/auth.store';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1';

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
