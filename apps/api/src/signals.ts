// Network signals for Connection Guard Intel: stored per day, prefix and source, published once a day as the prefixes
// that several networks report. Only prefixes and counts ever reach this code (packages/protocol NetworkSignals).
import type { NetworkSignals } from "@cg/protocol";
import type { Env } from "./env.ts";
import { DAY } from "./util.ts";

export const SIGNAL_RETENTION = 7 * DAY;
/** A prefix is published once this many different networks (or unlinked servers) reported it within SIGNAL_RETENTION. */
export const MIN_SOURCES = 3;
/** ...and their largest windows add up to at least this many accounts. */
export const MIN_ACCOUNTS = 10;
const MAX_PUBLISHED = 20_000;
export const KV_KEY = "intel:signals";
/** Signals may write at most this many rows a day (the free plan allows 100,000 for everything); later windows are dropped. */
export const SIGNAL_ROWS_PER_DAY = 20_000;

/**
 * One statement for the whole window: D1 expands the JSON itself, so a window costs one query and one written row per
 * prefix, whatever its size, plus the budget check and counter (the free plan allows 50 queries per invocation and 100 bound parameters per query).
 */
export async function recordSignals(env: Env, source: string, signals: NetworkSignals, now: number): Promise<boolean> {
  const n = signals.prefixes.length, day = Math.floor(now / DAY) * DAY;
  if (n === 0) return false;
  const used = await env.DB.prepare("SELECT rows FROM signal_budget WHERE day = ?").bind(day).first<{ rows: number }>();
  if ((used?.rows ?? 0) + n > SIGNAL_ROWS_PER_DAY) return false;
  await env.DB.batch([env.DB.prepare(
    `INSERT INTO network_signals (day, prefix, source, logins, accounts, vpn, denied, banned, allowed_by_rule)
     SELECT ?1, json_extract(value, '$.p'), ?2, json_extract(value, '$.logins'), json_extract(value, '$.accounts'),
       json_extract(value, '$.vpn'), json_extract(value, '$.denied'), json_extract(value, '$.banned'),
       json_extract(value, '$.allowed_by_rule')
     FROM json_each(?3) WHERE true
     ON CONFLICT(day, prefix, source) DO UPDATE SET logins = logins + excluded.logins, accounts = MAX(accounts, excluded.accounts),
       vpn = vpn + excluded.vpn, denied = denied + excluded.denied, banned = banned + excluded.banned,
       allowed_by_rule = allowed_by_rule + excluded.allowed_by_rule`,
  ).bind(day, source, JSON.stringify(signals.prefixes)),
  env.DB.prepare("INSERT INTO signal_budget (day, rows) VALUES (?1, ?2) ON CONFLICT(day) DO UPDATE SET rows = rows + excluded.rows")
    .bind(day, n)]);
  return true;
}

/** The published document (GET /v1/intel/signals.json). */
export type PublishedSignals = {
  as_of: string; window_days: number; min_sources: number; min_accounts: number;
  prefixes: { p: string; sources: number; logins: number; accounts: number; vpn: number; denied: number; banned: number; allowed_by_rule: number }[];
};

/**
 * Daily: the prefixes several sources reported in the last 7 days, stored in KV for Intel. D1 aggregates and writes the
 * JSON itself (json_group_array), so the cron's 10 ms CPU budget never depends on how many prefixes there are.
 */
export async function publishSignals(env: Env, now = Date.now()): Promise<string> {
  const since = Math.floor((now - SIGNAL_RETENTION) / DAY) * DAY;
  await env.DB.batch([env.DB.prepare("DELETE FROM network_signals WHERE day < ?").bind(since),
    env.DB.prepare("DELETE FROM signal_budget WHERE day < ?").bind(since)]);
  // Accounts: per source its largest day, then summed over sources, so a regular player counts once per network.
  const row = await env.DB.prepare(
    `SELECT json_group_array(json_object('p', p, 'sources', sources, 'logins', logins, 'accounts', accounts, 'vpn', vpn,
       'denied', denied, 'banned', banned, 'allowed_by_rule', allowed_by_rule)) AS prefixes
     FROM (SELECT prefix AS p, COUNT(*) AS sources, SUM(logins) AS logins, SUM(accounts) AS accounts, SUM(vpn) AS vpn,
             SUM(denied) AS denied, SUM(banned) AS banned, SUM(allowed_by_rule) AS allowed_by_rule
           FROM (SELECT prefix, source, SUM(logins) AS logins, MAX(accounts) AS accounts, SUM(vpn) AS vpn, SUM(denied) AS denied,
                   SUM(banned) AS banned, SUM(allowed_by_rule) AS allowed_by_rule
                 FROM network_signals WHERE day >= ?1 GROUP BY prefix, source)
           GROUP BY prefix HAVING COUNT(*) >= ?2 AND SUM(accounts) >= ?3
           ORDER BY sources DESC, accounts DESC, p LIMIT ?4)`,
  ).bind(since, MIN_SOURCES, MIN_ACCOUNTS, MAX_PUBLISHED).first<{ prefixes: string }>();
  const body = `{"as_of":"${new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z")}","window_days":${SIGNAL_RETENTION / DAY},`
    + `"min_sources":${MIN_SOURCES},"min_accounts":${MIN_ACCOUNTS},"prefixes":${row?.prefixes ?? "[]"}}`;
  await env.PUBLIC.put(KV_KEY, body);
  return body;
}
