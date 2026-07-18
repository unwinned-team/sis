import { createContext } from 'react';
import type { AuthUser } from '../types';
import type { UpdateProfileInput } from '../api/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<AuthUser>;
  updateProfile: (input: UpdateProfileInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
