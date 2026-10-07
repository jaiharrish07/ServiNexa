import { create } from 'zustand';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, full_name: string, phone?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  hydrate: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: true,

  hydrate: () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      api.setToken(token);
      set({ token, loading: true });
    } else {
      set({ loading: false });
    }
  },

  login: async (email: string, password: string) => {
    const data = await api.post<{ token: string; user: User }>('/api/auth/login', { email, password });
    api.setToken(data.token);
    set({ user: data.user, token: data.token, loading: false });
  },

  signup: async (email: string, password: string, full_name: string, phone?: string) => {
    const data = await api.post<{ token: string; user: User }>('/api/auth/signup', { email, password, full_name, phone });
    api.setToken(data.token);
    set({ user: data.user, token: data.token, loading: false });
  },

  logout: () => {
    api.setToken(null);
    set({ user: null, token: null });
  },

  loadUser: async () => {
    try {
      const data = await api.get<{ user: User }>('/api/auth/me');
      set({ user: data.user, loading: false });
    } catch {
      api.setToken(null);
      set({ user: null, token: null, loading: false });
    }
  },
}));
