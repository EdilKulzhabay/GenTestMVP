import { axiosInstance } from './axios';
import { ApiResponse } from '../types/api.types';
import {
  AuthPayload,
  LoginRequest,
  RegisterRequest,
  VerifyEmailRequest,
  User
} from '../types/auth.types';

export const authApi = {
  async login(payload: LoginRequest): Promise<User> {
    const { data } = await axiosInstance.post<ApiResponse<AuthPayload>>('/auth/login', payload);
    return data.data.user;
  },

  async register(payload: RegisterRequest): Promise<void> {
    await axiosInstance.post('/auth/register', payload);
  },

  async verifyEmail(payload: VerifyEmailRequest): Promise<User> {
    const { data } = await axiosInstance.post<ApiResponse<AuthPayload>>(
      '/auth/verify-email',
      payload
    );
    return data.data.user;
  },

  async getMe(): Promise<User> {
    const { data } = await axiosInstance.get<ApiResponse<User>>('/auth/me');
    return data.data;
  }
};
