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
  { userId: 'Ajinkya2', name: 'Ajinkya (new)', email: 'ajinkya@lumino.ai', password: 'demo123', role: 'USER' },
  { userId: 'Xichen', name: 'Xichen', email: 'xichen@lumino.ai', password: 'demo123', role: 'USER' },
  { userId: 'Shreshtha', name: 'Shreshtha', email: 'shreshtha@lumino.ai', password: 'demo123', role: 'USER' },
  { userId: 'recruiter1', name: 'Owen', email: 'owen@lumino.ai', password: 'demo123', role: 'RECRUITER' },
  { userId: 'sarah.chen', name: 'Sarah Chen', email: 'sarah.chen@google.com', password: 'google123', role: 'RECRUITER' },
  { userId: 'james.park', name: 'James Park', email: 'james.park@meta.com', password: 'meta123', role: 'RECRUITER' },
  { userId: 'priya.nair', name: 'Priya Nair', email: 'priya.nair@amazon.com', password: 'amazon123', role: 'RECRUITER' },
  { userId: 'marcus.wu', name: 'Marcus Wu', email: 'marcus.wu@apple.com', password: 'apple123', role: 'RECRUITER' },
  { userId: 'emily.davis', name: 'Emily Davis', email: 'emily.davis@apple.com', password: 'apple123', role: 'RECRUITER' },
  { userId: 'elena.ross', name: 'Elena Ross', email: 'elena.ross@netflix.com', password: 'netflix123', role: 'RECRUITER' },
  { userId: 'admin', name: 'Admin', email: 'admin@lumino.ai', password: 'admin123', role: 'ADMIN' },
];

/** Returns the matching credential or null if credentials are invalid. */
export function authenticate(userId: string, password: string): Credential | null {
  return USERS.find(
    u => u.userId === userId.trim() && u.password === password
  ) ?? null;
}
