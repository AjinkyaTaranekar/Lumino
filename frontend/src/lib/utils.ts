import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LegacyRole, UserRole } from './types';

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Map Lumino UserRole → legacy session role */
export function toLegacyRole(role: UserRole): LegacyRole {
  switch (role) {
    case 'RECRUITER': return 'recruiter';
    case 'ADMIN': return 'admin';
    default: return 'seeker';
  }
}

/** Map legacy session role → Lumino UserRole */
export function toUserRole(role: LegacyRole): UserRole {
  switch (role) {
    case 'recruiter': return 'RECRUITER';
    case 'admin': return 'ADMIN';
    default: return 'USER';
  }
}

/** Format a score (0–1) as a percentage string */
export function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** Returns Tailwind color class based on match score */
export function scoreColorClass(score: number): string {
  if (score >= 0.7) return 'text-emerald-600';
  if (score >= 0.4) return 'text-orange-500';
  return 'text-red-500';
}

/** Returns background color class based on match score */
export function scoreBgClass(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.4) return 'bg-orange-500';
  return 'bg-red-500';
}
