/**
 * Screen readers cannot keep up with a caption that changes every beat. The
 * visible caption updates every note; the spoken one waits at least `gap` ms,
 * except for outliers and messages that are not per-note (errors, page changes),
 * which are spoken at once.
 */
export const ANNOUNCE_GAP_MS = 3000;

export function isUrgent(text: string): boolean {
  return /outlier|anomal|fail|error|did not|missing|not answering/i.test(text);
}

export function shouldAnnounce(text: string, previous: string, now: number, lastAt: number, playing: boolean, gap = ANNOUNCE_GAP_MS): boolean {
  if (!text || text === previous) return false;
  if (!playing || isUrgent(text)) return true;
  return now - lastAt >= gap;
}
