export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  fullName: string;
  userName?: string;
  email?: string;
  role: UserRole;
}

export interface LoginRequest {
  userName: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  phone: string;
  userName: string;
  password: string;
}

export interface VerifyPhoneRequest {
  phone: string;
  code: string;
}

export interface AuthPayload {
  token: string;
  user: User;
}
