'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DUMMY_USERS: Record<string, { name: string; role: UserRole }> = {
  'lara@lumino.ai': { name: 'Lara', role: 'USER' },
  'ajinkya@lumino.ai': { name: 'Ajinkya', role: 'USER' },
  'owais@lumino.ai': { name: 'Owais', role: 'USER' },
  'xinchen@lumino.ai': { name: 'Xinchen', role: 'USER' },
  'shrestha@lumino.ai': { name: 'Shrestha', role: 'USER' },
  'owen@lumino.ai': { name: 'Owen', role: 'RECRUITER' },
  'admin@lumino.ai': { name: 'Admin', role: 'ADMIN' },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const savedUser = localStorage.getItem('lumino_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    // Simple dummy login
    if (password === 'abc123' && DUMMY_USERS[email]) {
      const newUser: User = {
        id: email.split('@')[0],
        email,
        name: DUMMY_USERS[email].name,
        role: DUMMY_USERS[email].role,
      };
      setUser(newUser);
      localStorage.setItem('lumino_user', JSON.stringify(newUser));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('lumino_user');
    router.push('/login');
  };

  useEffect(() => {
    if (!isLoading && !user && pathname !== '/login') {
      router.push('/login');
    }
  }, [user, isLoading, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
