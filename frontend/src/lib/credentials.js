/**
 * Hardcoded demo credentials for frontend-only authentication.
 * To add a user: append an entry to the USERS array.
 */
export const USERS = [
  { userId: 'Owais',      password: 'demo123', role: 'seeker'    },
  { userId: 'recruiter1', password: 'demo123', role: 'recruiter' },
  { userId: 'admin',      password: 'admin123', role: 'admin'    },
]

/**
 * Returns the matching user object or null if credentials are invalid.
 */
export function authenticate(userId, password) {
  return USERS.find(
    u => u.userId === userId.trim() && u.password === password
  ) || null
}
