import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { authApi } from '../api/auth.api';
import { testApi } from '../api/test.api';
import {
  LoginRequest,
  RegisterRequest,
  VerifyEmailRequest,
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

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginRequest) => Promise<User>;
  register: (payload: RegisterRequest) => Promise<void>;
  verifyEmail: (payload: VerifyEmailRequest) => Promise<User>;
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

  const register = useCallback(async (payload: RegisterRequest) => {
    await authApi.register(payload);
  }, []);

  const verifyEmail = useCallback(async (payload: VerifyEmailRequest) => {
    const user = await authApi.verifyEmail(payload);
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
      register,
      verifyEmail,
      logout,
      refresh
    }),
    [storeState.user, isLoading, login, register, verifyEmail, logout, refresh]
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
