/**
 * Client-side analytics event firing.
 *
 * All events are fire-and-forget — they never block the UI.
 * Errors are silently swallowed; analytics failure must not break the app.
 *
 * Usage:
 *   trackEvent(userId, jobId, 'job_clicked')
 *   trackDwell(userId, jobId, durationMs)  // fires 'job_viewed' if >= 5s
 */

import type { AnalyticsEventType } from './types';

const BASE = '/api/v1';

/** Fire an analytics event without waiting for a response. */
export function trackEvent(
  userId: string,
  jobId: string,
  eventType: AnalyticsEventType,
  durationMs?: number,
): void {
  fetch(`${BASE}/users/${userId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, event_type: eventType, duration_ms: durationMs }),
    // keepalive lets the request complete even if the page navigates away
    keepalive: true,
  }).catch(() => {
    // Intentionally silent — analytics failures must not affect UX
  });
}

// Minimum dwell time to count as a 'viewed' event
const MIN_VIEW_MS = 5000;

/**
 * Track dwell time on a job card.
 * Fires 'job_viewed' only if the user spent >= 5 seconds on the card.
 */
export function trackDwell(userId: string, jobId: string, durationMs: number): void {
  if (durationMs >= MIN_VIEW_MS) {
    trackEvent(userId, jobId, 'job_viewed', durationMs);
  }
}

/**
 * Returns IntersectionObserver-based dwell tracker for a job card element.
 * Call startDwell() when the element enters the viewport,
 * stopDwell() when it leaves or unmounts.
 */
export function createDwellTracker(userId: string, jobId: string) {
  let startTime: number | null = null;

  return {
    start() {
      startTime = Date.now();
    },
    stop() {
      if (startTime !== null) {
        const elapsed = Date.now() - startTime;
        trackDwell(userId, jobId, elapsed);
        startTime = null;
      }
    },
  };
}
