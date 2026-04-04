import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import {
  AuthPayload,
  LoginRequest,
  VerifyPhoneRequest,
  User
} from '../types/auth.types';

const getApiBase = (): string => {
  const url = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1';
  return url.startsWith('http') ? url : `${window.location.origin}${url}`;
};

export const authApi = {
  async login(payload: LoginRequest): Promise<User> {
    const { data } = await axiosInstance.post<ApiResponse<AuthPayload>>('/auth/login', payload);
    return data.data.user;
  },

  /** Вход только для роли admin; 403 если пользователь не админ */
  async loginAdmin(payload: LoginRequest): Promise<User> {
    const { data } = await axiosInstance.post<ApiResponse<AuthPayload>>('/auth/login/admin', payload);
    return data.data.user;
  },

  async requestOtp(phone: string): Promise<{ channel?: string; botLink?: string }> {
    const { data } = await axiosInstance.post<ApiResponse<{ channel?: string; botLink?: string }>>(
      '/auth/request-otp',
      { phone }
    );
    return data.data ?? {};
  },

  async verifyPhone(payload: VerifyPhoneRequest): Promise<User> {
    const { data } = await axiosInstance.post<ApiResponse<AuthPayload>>(
      '/auth/verify-phone',
      payload
    );
    const user = data.data?.user;
    if (!user) throw new Error('Invalid response from server');
    return user;
  },

  getGoogleAuthUrl(): string {
    const base = getApiBase();
    const redirectOrigin = encodeURIComponent(window.location.origin);
    return `${base}/auth/google?redirect_origin=${redirectOrigin}`;
  },

  async getMe(): Promise<User> {
    const { data } = await axiosInstance.get<ApiResponse<User>>('/auth/me');
    return data.data;
  }
};
