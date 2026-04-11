import type { MatchResult } from './types';

interface CacheEntry {
  results: MatchResult[];
  cachedAt: number;
}

// 5-minute frontend TTL. The backend has its own 2-hour TTL keyed by graph version,
// so the server will never return stale data even if this cache is cold.
const CACHE_TTL_MS = 5 * 60 * 1000;

const _store: Record<string, CacheEntry> = {};

export function getCachedMatches(userId: string): MatchResult[] | null {
  const entry = _store[userId];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    delete _store[userId];
    return null;
  }
  return entry.results;
}

export function setCachedMatches(userId: string, results: MatchResult[]): void {
  _store[userId] = { results, cachedAt: Date.now() };
}

/** Call this after any user profile mutation (resume upload, prefs save, clarification resolve, graph edit). */
export function clearUserMatchCache(userId: string): void {
  delete _store[userId];
}
