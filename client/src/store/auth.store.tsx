import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { authApi } from '../api/auth.api';
import { testApi } from '../api/test.api';
import {
  LoginRequest,
  VerifyPhoneRequest,
  User
} from '../types/auth.types';
import { getGuestTestSubmission, clearGuestTestSubmission } from '../utils/session';

interface AuthStoreState {
  user: User | null;
}

let authState: AuthStoreState = { user: null };
const listeners = new Set<() => void>();

export const authStore = {
  getState: (): AuthStoreState => authState,
  setUser: (user: User | null): void => {
    authState = { user };
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  logout: (): void => {
    authState = { user: null };
    listeners.forEach((listener) => listener());
  }
};

interface RequestOtpResult {
  channel?: string;
  botLink?: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginRequest) => Promise<User>;
  loginAdmin: (payload: LoginRequest) => Promise<User>;
  requestOtp: (phone: string) => Promise<RequestOtpResult>;
  verifyPhone: (payload: VerifyPhoneRequest) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function claimPendingGuestTest(): Promise<void> {
  const submission = getGuestTestSubmission();
  if (!submission) return;
  try {
    await testApi.claimGuestTest(submission);
  } catch {
    // ignore — test may already be claimed or expired
  } finally {
    clearGuestTestSubmission();
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const storeState = useSyncExternalStore(authStore.subscribe, authStore.getState, authStore.getState);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const user = await authApi.getMe();
      authStore.setUser(user);
    } catch {
      authStore.setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (payload: LoginRequest) => {
    const user = await authApi.login(payload);
    authStore.setUser(user);
    void claimPendingGuestTest();
    return user;
  }, []);

  const loginAdmin = useCallback(async (payload: LoginRequest) => {
    const user = await authApi.loginAdmin(payload);
    authStore.setUser(user);
    return user;
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    return authApi.requestOtp(phone);
  }, []);

  const verifyPhone = useCallback(async (payload: VerifyPhoneRequest) => {
    const user = await authApi.verifyPhone(payload);
    authStore.setUser(user);
    void claimPendingGuestTest();
    return user;
  }, []);

  const logout = useCallback(() => {
    authStore.logout();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: storeState.user,
      isAuthenticated: Boolean(storeState.user),
      isLoading,
      login,
      loginAdmin,
      requestOtp,
      verifyPhone,
      logout,
      refresh
    }),
    [storeState.user, isLoading, login, loginAdmin, requestOtp, verifyPhone, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
