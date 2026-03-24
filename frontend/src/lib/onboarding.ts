const key = (userId: string) => `lumino_ob_${userId}`

export function isOnboardingComplete(userId: string): boolean {
  return localStorage.getItem(key(userId)) === '1'
}

export function markOnboardingComplete(userId: string): void {
  localStorage.setItem(key(userId), '1')
}
