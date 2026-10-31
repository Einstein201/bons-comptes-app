'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, getAccessToken, setAccessToken, subscribeSession } from '../services/api';
import { login, logout, restoreSession, type AuthUser, type LoginInput } from '../services/auth';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'signed-out' | 'unavailable';

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
  retrySession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const operation = useRef(0);

  const retrySession = useCallback(async () => {
    const currentOperation = ++operation.current;
    setStatus('loading');
    try {
      const currentUser = await restoreSession();
      if (operation.current === currentOperation) {
        setUser(currentUser);
        setStatus('authenticated');
      }
    } catch (error) {
      if (operation.current !== currentOperation) return;
      setUser(null);
      setStatus(error instanceof ApiError && error.status === 401
        ? 'unauthenticated'
        : 'unavailable');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSession(() => {
      if (!getAccessToken()) {
        operation.current += 1;
        setUser(null);
        setStatus('unauthenticated');
      }
    });
    void retrySession();
    return unsubscribe;
  }, [retrySession]);

  const signIn = useCallback(async (input: LoginInput) => {
    const currentOperation = ++operation.current;
    setStatus('loading');
    try {
      const signedInUser = await login(input);
      if (operation.current === currentOperation) {
        setUser(signedInUser);
        setStatus('authenticated');
      }
    } catch (error) {
      setAccessToken(null);
      if (operation.current === currentOperation) {
        setUser(null);
        setStatus('unauthenticated');
      }
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    operation.current += 1;
    try {
      await logout();
    } finally {
      setUser(null);
      setStatus('signed-out');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, signIn, signOut, retrySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider.');
  }
  return context;
}
