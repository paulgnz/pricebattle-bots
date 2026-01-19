/**
 * Get current Unix timestamp in seconds
 */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Format seconds as human-readable duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return 'Ended';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/**
 * Format Unix timestamp as ISO string
 */
export function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Get time remaining until a Unix timestamp
 */
export function timeRemaining(unixSeconds: number): number {
  return Math.max(0, unixSeconds - nowSeconds());
}

/**
 * Check if a Unix timestamp has passed
 */
export function hasPassed(unixSeconds: number): boolean {
  return nowSeconds() >= unixSeconds;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}
