import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authenticate } from '../lib/credentials'
import { Zap, AlertCircle, LogIn } from 'lucide-react'

export default function Login() {
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const QUICK_LOGINS = [
    { label: 'Owais (Job Seeker)', userId: 'Owais', password: 'demo123' },
    { label: 'recruiter1 (Recruiter)', userId: 'recruiter1', password: 'demo123' },
    { label: 'admin (Admin)', userId: 'admin', password: 'admin123' },
  ]

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const id = userId.trim()
    if (!id) return setError('Please enter your User ID.')
    if (!password) return setError('Please enter your password.')
    const user = authenticate(id, password)
    if (!user) return setError('Invalid credentials.')
    login(user.userId, user.role)
    navigate(
      user.role === 'recruiter' ? '/dashboard'
      : user.role === 'admin' ? '/admin'
      : '/dashboard'
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-prism p-8 border border-slate-100">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center text-white font-black text-xl shadow-lg">
            <Zap size={20} />
          </div>
          <h1 className="text-3xl font-bold tracking-tighter text-indigo-950 font-display">Lumino</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">User ID</label>
            <input
              type="text"
              value={userId}
              onChange={e => { setUserId(e.target.value); setError('') }}
              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500 transition-all"
              placeholder="e.g. Owais"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500 transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-indigo-950 text-white py-4 rounded-xl font-bold hover:bg-indigo-900 transition-all flex items-center justify-center gap-2"
          >
            <LogIn size={20} />
            Sign In
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">Quick Access</p>
          <div className="grid grid-cols-1 gap-2">
            {QUICK_LOGINS.map(acc => (
              <button
                key={acc.userId}
                onClick={() => { setUserId(acc.userId); setPassword(acc.password); setError('') }}
                className="text-left px-4 py-2 rounded-lg hover:bg-slate-50 text-sm text-slate-600 font-medium border border-transparent hover:border-slate-200 transition-all"
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
