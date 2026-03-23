import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, role }) {
  const { session } = useAuth()

  if (!session) return <Navigate to="/login" replace />

  if (role) {
    const allowed = Array.isArray(role) ? role : [role]
    if (!allowed.includes(session.role)) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return children
}
