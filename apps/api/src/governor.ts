// Keeps plugin sync traffic inside the Workers Free plan.
//
// Every install syncs at most once per `floor` seconds. The floor is chosen so
// that even if every active install synced at the floor all day, plugin syncs
// would stay below SYNC_BUDGET_PER_DAY. Idle installs (no events, no checks)
// heartbeat less often. The value is recomputed by the 5-minute cron and
// stored in KV (one write per run, ~288/day, well below the KV free limit).
import type { Env } from "./env.ts";

// Free plan: 100k Worker requests/day and 100k D1 rows written/day. Syncs
// write at most ~2 rows when they carry data, so 40k syncs leaves headroom
// for dashboard traffic, installs and cron work.
export const SYNC_BUDGET_PER_DAY = 40_000;
export const MIN_INTERVAL = 60;
export const IDLE_INTERVAL = 300;
export const MAX_INTERVAL = 3600;
export const LIVE_INTERVAL = 5;
/** While a config change is pending or the settings page is open (bounded to minutes). */
export const FAST_INTERVAL = 15;
/** How long a network stays in fast mode after someone who can change settings opens it in the dashboard. */
export const WATCH_WINDOW = 10 * 60_000;
const KV_KEY = "governor:v1";

export interface GovernorState { floor: number; activeInstalls: number; computedAt: number }

export function computeFloor(activeInstalls: number): number {
  const needed = Math.ceil((activeInstalls * 86_400) / SYNC_BUDGET_PER_DAY);
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, needed));
}

let cached: { state: GovernorState; until: number } | null = null;

export async function governorState(env: Env, now = Date.now()): Promise<GovernorState> {
  if (cached && cached.until > now) return cached.state;
  let state: GovernorState = { floor: MIN_INTERVAL, activeInstalls: 0, computedAt: now };
  try {
    const stored = await env.PUBLIC.get<GovernorState>(KV_KEY, "json");
    if (stored && typeof stored.floor === "number") state = stored;
  } catch { /* KV unavailable: fall back to the minimum interval */ }
  cached = { state, until: now + 60_000 };
  return state;
}

export function nextSyncIn(state: GovernorState, opts: { busy: boolean; live: boolean; fast?: boolean }): number {
  if (opts.live) return LIVE_INTERVAL;
  if (opts.fast) return FAST_INTERVAL;
  if (opts.busy) return state.floor;
  return Math.min(MAX_INTERVAL, Math.max(IDLE_INTERVAL, state.floor * 3));
}

export async function recomputeGovernor(env: Env, now = Date.now()): Promise<GovernorState> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM installs WHERE last_seen_at > ?")
    .bind(now - 2 * MAX_INTERVAL * 1000).first<{ n: number }>();
  const activeInstalls = row?.n ?? 0;
  const state: GovernorState = { floor: computeFloor(activeInstalls), activeInstalls, computedAt: now };
  await env.PUBLIC.put(KV_KEY, JSON.stringify(state));
  cached = { state, until: now + 60_000 };
  return state;
}

export function resetGovernorCache() { cached = null; }
