// When the overview asks for a review. Asked once Connection Guard has visibly done its job on a healthy, finished
// setup, never during setup or while something is broken, and never twice in a row: "Later" waits 30 days, a click on
// a review link or "Don't ask again" ends it. Remembered per browser (a convenience; it can be empty).
import type { Install, Role } from "./api.ts";

const DAY = 86_400_000;
export const REVIEW_KEY = "cg-review-prompt";
export const REVIEW_LINKS = {
  spigotmc: "https://www.spigotmc.org/resources/121509/reviews",
  hangar: "https://hangar.papermc.io/gerolndnr/connection-guard",
} as const;

export interface ReviewState { state: "later" | "done" | "never"; until?: number }

export function readReviewState(): ReviewState | null {
  try { return JSON.parse(localStorage.getItem(REVIEW_KEY) ?? "null") as ReviewState | null; } catch { return null; }
}
export function writeReviewState(s: ReviewState) {
  try { localStorage.setItem(REVIEW_KEY, JSON.stringify(s)); } catch { /* private mode: asks again next visit */ }
}

/**
 * Whether to ask now:
 * - an owner or admin (they run the servers);
 * - the first server was linked at least 7 days ago, and one reported in the last 24 hours;
 * - every server enforces and nothing needs attention (setup finished, nothing broken);
 * - in the last 7 days it checked at least 100 players and found at least one VPN or proxy;
 * - not answered before ("Later" waits 30 days).
 */
export function shouldAskForReview(o: {
  role: Role; installs: readonly Install[]; issues: number; week: { checks: number; vpn_positive: number } | null;
  state: ReviewState | null; now: number;
}): boolean {
  if (o.role === "viewer" || o.installs.length === 0 || o.issues > 0 || !o.week) return false;
  if (o.state && (o.state.state !== "later" || (o.state.until ?? 0) > o.now)) return false;
  const linked = Math.min(...o.installs.map((i) => i.claimed_at ?? i.created_at));
  if (o.now - linked < 7 * DAY) return false;
  if (!o.installs.some((i) => o.now - i.last_seen_at < DAY)) return false;
  if (o.installs.some((i) => i.status?.mode !== "ENFORCE")) return false;
  return o.week.checks >= 100 && o.week.vpn_positive >= 1;
}

export const LATER_MS = 30 * DAY;
