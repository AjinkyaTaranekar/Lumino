import type { UserRole } from './types';

export interface Credential {
  userId: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

/**
 * Hardcoded demo credentials for frontend-only authentication.
 * To add a user: append an entry to the USERS array.
 */
export const USERS: Credential[] = [
  { userId: 'Owais', name: 'Owais', email: 'owais@lumino.ai', password: 'demo123', role: 'USER' },
  { userId: 'Lara', name: 'Lara', email: 'lara@lumino.ai', password: 'demo123', role: 'USER' },
  { userId: 'Ajinkya', name: 'Ajinkya', email: 'ajinkya@lumino.ai', password: 'demo123', role: 'USER' },
  { userId: 'Xichen', name: 'Xichen', email: 'xichen@lumino.ai', password: 'demo123', role: 'USER' },
  { userId: 'Shreshtha', name: 'Shreshtha', email: 'shreshtha@lumino.ai', password: 'demo123', role: 'USER' },
  { userId: 'recruiter1', name: 'Owen', email: 'owen@lumino.ai', password: 'demo123', role: 'RECRUITER' },
  { userId: 'admin', name: 'Admin', email: 'admin@lumino.ai', password: 'admin123', role: 'ADMIN' },
];

/** Returns the matching credential or null if credentials are invalid. */
export function authenticate(userId: string, password: string): Credential | null {
  return USERS.find(
    u => u.userId === userId.trim() && u.password === password
  ) ?? null;
}
