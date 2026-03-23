'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const success = await login(email, password);
    if (success) {
      router.push('/dashboard');
    } else {
      setError('Invalid email or password. Use abc123 as password.');
    }
  };

  const accounts = [
    { name: 'Lara (User)', email: 'lara@lumino.ai' },
    { name: 'Ajinkya (User)', email: 'ajinkya@lumino.ai' },
    { name: 'Owen (Recruiter)', email: 'owen@lumino.ai' },
    { name: 'Admin', email: 'admin@lumino.ai' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100"
      >
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white font-black text-xl shadow-lg shadow-primary/20">L</div>
          <h1 className="text-3xl font-bold tracking-tighter text-indigo-950 font-display">Lumino</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border-slate-200 bg-slate-50 focus:ring-primary focus:border-primary transition-all"
              placeholder="name@lumino.ai"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border-slate-200 bg-slate-50 focus:ring-primary focus:border-primary transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

          <button 
            type="submit"
            className="w-full bg-indigo-950 text-white py-4 rounded-xl font-bold hover:bg-indigo-900 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <LogIn size={20} />
            Sign In
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">Quick Access (Password: abc123)</p>
          <div className="grid grid-cols-1 gap-2">
            {accounts.map((acc) => (
              <button 
                key={acc.email}
                onClick={() => {
                  setEmail(acc.email);
                  setPassword('abc123');
                }}
                className="text-left px-4 py-2 rounded-lg hover:bg-slate-50 text-sm text-slate-600 font-medium border border-transparent hover:border-slate-200 transition-all"
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
