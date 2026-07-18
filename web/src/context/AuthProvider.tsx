import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loginUser, logoutUser, registerUser, restoreSession } from '../api/auth';
import type { AuthUser } from '../types';
import { AuthContext } from './auth-context';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isReady: boolean;
}

const INITIAL_STATE: AuthState = { user: null, accessToken: null, isReady: false };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;
    restoreSession().then((session) => {
      if (cancelled) return;
      setState({
        user: session?.user ?? null,
        accessToken: session?.accessToken ?? null,
        isReady: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await loginUser({ email, password });
    setState({ user: session.user, accessToken: session.accessToken, isReady: true });
    return session.user;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const session = await registerUser({ name, email, password });
    setState({ user: session.user, accessToken: session.accessToken, isReady: true });
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    await logoutUser().catch(() => undefined);
    setState({ user: null, accessToken: null, isReady: true });
  }, []);

  const value = useMemo(
    () => ({
      user: state.user,
      accessToken: state.accessToken,
      isReady: state.isReady,
      login,
      register,
      logout,
    }),
    [state, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
