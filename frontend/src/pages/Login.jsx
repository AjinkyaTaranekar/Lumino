import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authenticate } from '../lib/credentials'
import { Network } from 'lucide-react'

export default function Login() {
  const [userId, setUserId]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
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
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: '#1a1a2e' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: '#e94560' }}>
            <Network size={28} color="white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#e0e0e0' }}>Adaptive Matching</h1>
          <p className="text-sm mt-1" style={{ color: '#8892a4' }}>Graph-based transparent job matching</p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: '#16213e', border: '1px solid #0f3460' }}>
          <h2 className="text-lg font-semibold mb-6" style={{ color: '#e0e0e0' }}>Sign in</h2>

          {/* User ID */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2" style={{ color: '#8892a4' }}>
              User ID
            </label>
            <input
              type="text"
              value={userId}
              onChange={e => { setUserId(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleEnter()}
              placeholder="e.g. Owais"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none"
              style={{ background: '#1a1a2e', border: '1px solid #0f3460', color: '#e0e0e0' }}
              onFocus={e => e.target.style.borderColor = '#e94560'}
              onBlur={e => e.target.style.borderColor = '#0f3460'}
            />
          </div>

          {/* Password */}
          <div className="mb-5">
            <label className="block text-sm font-medium mb-2" style={{ color: '#8892a4' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleEnter()}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none"
              style={{ background: '#1a1a2e', border: '1px solid #0f3460', color: '#e0e0e0' }}
              onFocus={e => e.target.style.borderColor = '#e94560'}
              onBlur={e => e.target.style.borderColor = '#0f3460'}
            />
          </div>

          {error && (
            <p className="text-xs mb-4" style={{ color: '#e74c3c' }}>{error}</p>
          )}

          <button
            onClick={handleEnter}
            className="w-full py-3 rounded-lg font-semibold text-sm transition-colors"
            style={{ background: '#e94560', color: '#fff' }}
            onMouseEnter={e => e.currentTarget.style.background = '#c73652'}
            onMouseLeave={e => e.currentTarget.style.background = '#e94560'}>
            Sign In →
          </button>
        </div>
      </div>
    </div>
  )
}
