import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

interface AuthUser { id: string; username: string; }
interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthUser | null;
  username: string | null;
  token: string | null;
  login:    (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, email?: string) => Promise<{ ok: boolean; error?: string }>;
  logout:   () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,  setUser]  = useState<AuthUser | null>(() => {
    try { return JSON.parse(localStorage.getItem('bb_user') || 'null'); } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('bb_token'));

  const isAuthenticated = !!user && !!token;
  const username        = user?.username ?? null;

  // Verify token on mount
  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (!u) { setUser(null); setToken(null); localStorage.clear(); } else setUser(u); })
      .catch(() => {});
  }, []);

  const login = useCallback(async (uname: string, pwd: string) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, password: pwd }),
      credentials: 'include',
    });
    if (!r.ok) return false;
    const { user: u, token: t } = await r.json();
    setUser(u); setToken(t);
    localStorage.setItem('bb_user', JSON.stringify(u));
    localStorage.setItem('bb_token', t);
    return true;
  }, []);

  const register = useCallback(async (uname: string, pwd: string, email?: string) => {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: uname, password: pwd, email }),
      credentials: 'include',
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: data.error || 'Registration failed' };
    setUser(data.user); setToken(data.token);
    localStorage.setItem('bb_user', JSON.stringify(data.user));
    localStorage.setItem('bb_token', data.token);
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, credentials: 'include'
      }).catch(() => {});
    }
    setUser(null); setToken(null);
    localStorage.removeItem('bb_user');
    localStorage.removeItem('bb_token');
  }, [token]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, username, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
