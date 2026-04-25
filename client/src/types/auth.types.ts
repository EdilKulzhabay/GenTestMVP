export type UserRole = 'admin' | 'user';

/** Пара профильных предметов (из GET /auth/me при populate) */
export interface ProfileSubjectPairBrief {
  _id: string;
  title: string;
  subject1Id: { _id: string; title: string; subjectKind?: string };
  subject2Id: { _id: string; title: string; subjectKind?: string };
}

export interface User {
  id: string;
  _id?: string;
  fullName: string;
  userName?: string;
  email?: string;
  phone?: string;
  role: UserRole;
  profileSubjectPairId?: ProfileSubjectPairBrief | string | null;
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
