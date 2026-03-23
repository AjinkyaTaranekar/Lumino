import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole, LegacyRole } from '../lib/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Accept new UserRole ('USER' | 'RECRUITER' | 'ADMIN') or legacy role */
  role?: UserRole | LegacyRole | Array<UserRole | LegacyRole>;
}

const legacyToNew: Record<LegacyRole, UserRole> = {
  seeker: 'USER',
  recruiter: 'RECRUITER',
  admin: 'ADMIN',
};

function normalizeRole(r: UserRole | LegacyRole): UserRole {
  if (r === 'USER' || r === 'RECRUITER' || r === 'ADMIN') return r;
  return legacyToNew[r as LegacyRole];
}

export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (role) {
    const allowed = (Array.isArray(role) ? role : [role]).map(normalizeRole);
    if (!allowed.includes(user.role)) {
      const redirect =
        user.role === 'RECRUITER' ? '/talent-pool'
        : user.role === 'ADMIN' ? '/admin'
        : '/dashboard';
      return <Navigate to={redirect} replace />;
    }
  }

  return <>{children}</>;
}
