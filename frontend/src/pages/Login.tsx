import { AlertCircle, LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already logged in
  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim()) { setError('Please enter your User ID.'); return; }
    if (!password) { setError('Please enter your password.'); return; }

    setError('');
    setLoading(true);
    try {
      const ok = await login(userId.trim(), password);
      if (ok) {
        navigate('/dashboard');
      } else {
        setError('Invalid User ID or password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Page title for WCAG */}
      <title>Sign In - Lumino</title>

      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100"
          role="main"
          aria-label="Sign in to Lumino"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 justify-center">
            <img
              src="/logo.png"
              alt="Lumino logo"
              className="w-10 h-10 object-contain"
            />
            <h1 className="text-3xl font-bold tracking-tighter text-indigo-950">Lumino</h1>
          </div>

          <p className="text-center text-slate-500 text-sm mb-8">
            Graph-based transparent job matching
          </p>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="userId" className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
                User ID
              </label>
              <input
                id="userId"
                type="text"
                value={userId}
                onChange={e => { setUserId(e.target.value); setError(''); }}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                placeholder="e.g. Owais"
                autoComplete="username"
                required
                aria-required="true"
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                aria-required="true"
              />
            </div>

            {error && (
              <div
                id="login-error"
                role="alert"
                className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-4 py-3"
              >
                <AlertCircle size={16} aria-hidden="true" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-950 text-white py-4 rounded-xl font-bold hover:bg-indigo-900 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
            >
              {loading ? (
                <><div className="spinner-sm" aria-hidden="true" /> Signing in…</>
              ) : (
                <><LogIn size={20} aria-hidden="true" /> Sign In</>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Powered by knowledge graph matching
          </p>
        </motion.div>
      </div>
    </>
  );
}
