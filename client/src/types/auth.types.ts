export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  fullName: string;
  userName: string;
  role: UserRole;
}

export interface LoginRequest {
  userName: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  userName: string;
  password: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface AuthPayload {
  token: string;
  user: User;
}
