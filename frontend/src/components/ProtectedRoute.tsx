import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isOnboardingComplete } from '../lib/onboarding';
import type { LegacyRole, UserRole } from '../lib/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Accept new UserRole ('USER' | 'RECRUITER' | 'ADMIN') or legacy role */
  role?: UserRole | LegacyRole | Array<UserRole | LegacyRole>;
  /** Skip the onboarding gate (used for the /onboarding route itself) */
  skipOnboardingGate?: boolean;
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

export default function ProtectedRoute({ children, role, skipOnboardingGate }: ProtectedRouteProps) {
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

  // Gate USER routes: redirect to onboarding until it's complete
  if (!skipOnboardingGate && user.role === 'USER' && !isOnboardingComplete(user.id)) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
