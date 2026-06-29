import { apiRequest, type ApiErrorPayload, ApiError } from '@/infra/api';
import { resolveApiBaseUrl } from '@/infra/api/apiConfig';

export { ApiError, type ApiErrorPayload };

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  createdAt: string;
};

export type AuthResponse = {
  user: PublicUser;
  token: string;
  expiresAt: string;
};

const request = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<T> => apiRequest<T>(path, options);

const mergeHeaders = (...sources: Array<HeadersInit | undefined>): Headers => {
  const headers = new Headers();
  sources.forEach((source) => {
    if (!source) return;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  });
  return headers;
};

export const authApi = {
  register: async (
    data: {
      email: string;
      password: string;
      name: string;
      description?: string;
    },
    options: RequestInit = {}
  ) =>
    request<AuthResponse>('/auth/register', {
      ...options,
      method: 'POST',
      headers: mergeHeaders(
        { 'Content-Type': 'application/json' },
        options.headers
      ),
      body: JSON.stringify(data),
    }),
  login: async (
    data: { email: string; password: string },
    options: RequestInit = {}
  ) =>
    request<AuthResponse>('/auth/login', {
      ...options,
      method: 'POST',
      headers: mergeHeaders(
        { 'Content-Type': 'application/json' },
        options.headers
      ),
      body: JSON.stringify(data),
    }),
  me: async (token: string, options: RequestInit = {}) =>
    request<{ user: PublicUser }>('/auth/me', {
      ...options,
      headers: mergeHeaders(
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        options.headers
      ),
    }),
  logout: async (token: string, options: RequestInit = {}) =>
    request<void>('/auth/logout', {
      ...options,
      method: 'POST',
      headers: mergeHeaders(
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        options.headers
      ),
    }),
  updateProfile: async (
    token: string,
    data: { name?: string; description?: string },
    options: RequestInit = {}
  ) =>
    request<{ user: PublicUser }>('/users/me', {
      ...options,
      method: 'PATCH',
      headers: mergeHeaders(
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        options.headers
      ),
      body: JSON.stringify(data),
    }),
  uploadAvatar: async (
    token: string,
    avatar: File,
    options: RequestInit = {}
  ) => {
    const formData = new FormData();
    formData.append('avatar', avatar);
    return request<{ user: PublicUser }>('/users/me/avatar', {
      ...options,
      method: 'PUT',
      headers: mergeHeaders(
        {
          Authorization: `Bearer ${token}`,
        },
        options.headers
      ),
      body: formData,
    });
  },
};

export const resolveUserAvatarUrl = (avatarUrl?: string | null) => {
  const value = avatarUrl?.trim();
  if (!value) return undefined;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:')) {
    return value;
  }
  const base = resolveApiBaseUrl();
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
};
