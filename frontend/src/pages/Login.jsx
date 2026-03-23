import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authenticate } from '../lib/credentials'
import { Zap, AlertCircle } from 'lucide-react'

export default function Login() {
  const [userId,   setUserId]   = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const { login }               = useAuth()
  const navigate                = useNavigate()

  function handleEnter() {
    const id = userId.trim()
    if (!id)       return setError('Please enter your ID.')
    if (!password) return setError('Please enter your password.')

    const user = authenticate(id, password)
    if (!user) return setError('Invalid ID or password.')

    login(user.userId, user.role)
    navigate(
      user.role === 'recruiter' ? '/recruiter/post'
      : user.role === 'admin'   ? '/admin'
      : '/user/upload'
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-bg">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-500 mb-4 shadow-card-md">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-content-primary">Lumino</h1>
          <p className="text-sm text-content-muted mt-1">Graph-based transparent job matching</p>
        </div>

        {/* Card */}
        <div className="card p-8">
          <h2 className="text-lg font-semibold text-content-primary mb-6">Sign in to your account</h2>

          <div className="space-y-4">
            <div>
              <label className="label">User ID</label>
              <input
                type="text"
                value={userId}
                onChange={e => { setUserId(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleEnter()}
                placeholder="e.g. Owais"
                className="input"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleEnter()}
                placeholder="••••••••"
                className="input"
              />
            </div>
          </div>

          {error && (
            <div className="alert-error mt-4">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleEnter}
            className="btn-primary btn-lg w-full mt-6">
            Sign In →
          </button>
        </div>

        <p className="text-center text-xs text-content-subtle mt-6">
          Powered by knowledge graph matching
        </p>
      </div>
    </div>
  )
}
