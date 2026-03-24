import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { User, LegacySession, UserRole } from '../lib/types';
import { authenticate } from '../lib/credentials';
import { toLegacyRole } from '../lib/utils';

const SESSION_KEY = 'lumino_session';

interface AuthContextType {
  /** Lumino-format user (null when not logged in) */
  user: User | null;
  /** Legacy session for backward-compat pages */
  session: LegacySession | null;
  /** Login with userId + password; returns true on success */
  login: (userId: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function loadPersistedUser(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = loadPersistedUser();
    if (saved) setUser(saved);
    setIsLoading(false);
  }, []);

  const login = useCallback(async (userId: string, password: string): Promise<boolean> => {
    const cred = authenticate(userId, password);
    if (!cred) return false;

    const newUser: User = {
      id: cred.userId,
      name: cred.name,
      email: cred.email,
      role: cred.role as UserRole,
    };
    setUser(newUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
    return true;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  /** Backward-compat session derived from user */
  const session: LegacySession | null = useMemo(
    () => user ? { userId: user.id, role: toLegacyRole(user.role) } : null,
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, session, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
