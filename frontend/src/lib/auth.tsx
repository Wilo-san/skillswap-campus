import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import type { Me } from './types';

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  register: (d: { email: string; password: string; firstName: string; lastName: string; field: string }) => Promise<Me>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (u: Me) => void;
}

const Ctx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    if (tokenStore.get()) api.post('/auth/logout').catch(() => {});
    tokenStore.clear();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const r = await api.get<{ user: Me }>('/auth/me');
    setUser(r.user);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { tokenStore.clear(); setUser(null); });
    if (!tokenStore.get()) return;
    refresh().catch(() => tokenStore.clear()).finally(() => setLoading(false));
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: Me }>('/auth/login', { email, password });
    tokenStore.set(r.token);
    setUser(r.user);
    return r.user;
  };
  const register: AuthState['register'] = async (d) => {
    const r = await api.post<{ token: string; user: Me }>('/auth/register', d);
    tokenStore.set(r.token);
    setUser(r.user);
    return r.user;
  };

  return <Ctx.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>{children}</Ctx.Provider>;
}
