import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  loginUser,
  logoutUser,
  registerUser,
  restoreSession,
  updateProfile as updateProfileRequest,
} from '../api/auth';
import type { UpdateProfileInput } from '../api/auth';
import { logoutAfterRefresh, onAccessTokenChange, setAccessToken } from '../api/client';
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
    return onAccessTokenChange((token) => {
      setState((prev) =>
        token === null
          ? { user: null, accessToken: null, isReady: true }
          : prev.accessToken === token
            ? prev
            : { ...prev, accessToken: token },
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    restoreSession().then((session) => {
      if (cancelled) return;
      setAccessToken(session?.accessToken ?? null);
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
    setAccessToken(session.accessToken);
    setState({ user: session.user, accessToken: session.accessToken, isReady: true });
    return session.user;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const session = await registerUser({ name, email, password });
    setAccessToken(session.accessToken);
    setState({ user: session.user, accessToken: session.accessToken, isReady: true });
    return session.user;
  }, []);

  const updateProfile = useCallback(
    async (input: UpdateProfileInput) => {
      if (!state.accessToken) {
        throw new Error('Not authenticated');
      }
      const user = await updateProfileRequest(state.accessToken, input);
      setState((prev) => ({ ...prev, user }));
      return user;
    },
    [state.accessToken],
  );

  const logout = useCallback(async () => {
    await logoutAfterRefresh(logoutUser).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({
      user: state.user,
      accessToken: state.accessToken,
      isReady: state.isReady,
      login,
      register,
      updateProfile,
      logout,
    }),
    [state, login, register, updateProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
