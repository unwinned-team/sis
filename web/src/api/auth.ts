import { apiRequest } from './client';
import type { AuthUser } from '../types';

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export function registerUser(input: RegisterInput): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/web/register', {
    method: 'POST',
    body: input,
    withCredentials: true,
  });
}

export function loginUser(input: LoginInput): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/web/login', {
    method: 'POST',
    body: input,
    withCredentials: true,
  });
}

export function refreshAccessToken(): Promise<{ accessToken: string }> {
  return apiRequest<{ accessToken: string }>('/auth/web/refresh', {
    method: 'POST',
    withCredentials: true,
  });
}

export function fetchCurrentUser(accessToken: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/me', { accessToken });
}

export interface UpdateProfileInput {
  name?: string;
  phone?: string | null;
}

export function updateProfile(accessToken: string, input: UpdateProfileInput): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/me', {
    method: 'PATCH',
    body: input,
    accessToken,
  });
}

export function logoutUser(): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    withCredentials: true,
  });
}

let restorePromise: Promise<AuthSession | null> | null = null;

export function restoreSession(): Promise<AuthSession | null> {
  restorePromise ??= (async () => {
    try {
      const { accessToken } = await refreshAccessToken();
      const user = await fetchCurrentUser(accessToken);
      return { user, accessToken };
    } catch {
      return null;
    }
  })();
  return restorePromise;
}
