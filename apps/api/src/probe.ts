// Connection-probe counts: which measured connection traits identify VPNs and proxies, before any is used for
// detection. Only counts per trait value and verdict ever reach this code (packages/protocol ProbeCounts).
import type { ProbeCounts } from "@cg/protocol";
import type { Env } from "./env.ts";
import { DAY } from "./util.ts";

export const PROBE_RETENTION = 90 * DAY;
/**
 * At most this many windows a day are stored (four per linked Velocity server); later ones are dropped. A window costs
 * two row writes (stored, then deleted by the rollup); the rollup adds one row per distinct signal value a day.
 */
export const PROBE_WINDOWS_PER_DAY = 2_000;

/** One statement, so the day's limit holds even for concurrent windows. */
export async function recordProbe(env: Env, source: string, probe: ProbeCounts, now: number): Promise<boolean> {
  if (probe.counts.length === 0) return false;
  const day = Math.floor(now / DAY) * DAY;
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO probe_windows (day, source, received_at, logins, counts)
     SELECT ?1, ?2, ?3, ?4, ?5 WHERE (SELECT COUNT(*) FROM probe_windows WHERE day = ?1) < ?6`,
  ).bind(day, source, now, probe.logins, JSON.stringify(probe.counts), PROBE_WINDOWS_PER_DAY).run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * Daily: adds the windows of past days into probe_daily and deletes them, then drops days past the retention. D1 expands
 * the JSON and groups itself, so the cron's CPU budget never depends on how many windows there are.
 */
export async function rollUpProbe(env: Env, now = Date.now()): Promise<void> {
  const today = Math.floor(now / DAY) * DAY;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO probe_daily (day, signal, value, label, n, sources)
       SELECT w.day, json_extract(e.value, '$.s'), json_extract(e.value, '$.v'), json_extract(e.value, '$.l'),
         SUM(json_extract(e.value, '$.n')), COUNT(DISTINCT w.source)
       FROM probe_windows w, json_each(w.counts) e WHERE w.day < ?1
       GROUP BY w.day, json_extract(e.value, '$.s'), json_extract(e.value, '$.v'), json_extract(e.value, '$.l')
       ON CONFLICT(day, signal, value, label) DO UPDATE SET n = n + excluded.n, sources = MAX(sources, excluded.sources)`,
    ).bind(today),
    env.DB.prepare("DELETE FROM probe_windows WHERE day < ?").bind(today),
    env.DB.prepare("DELETE FROM probe_daily WHERE day < ?").bind(today - PROBE_RETENTION),
  ]);
}

/**
 * The totals for a decision, rolled-up days and today's windows together: per signal value and label the count and the
 * most networks that reported it on one day. Read by scripts/probe-report.mjs (repository root) through wrangler; there is no endpoint.
 */
export const PROBE_REPORT_SQL = `SELECT signal, value, label, SUM(n) AS n, MAX(sources) AS sources FROM (
  SELECT signal, value, label, n, sources FROM probe_daily
  UNION ALL
  SELECT json_extract(e.value, '$.s'), json_extract(e.value, '$.v'), json_extract(e.value, '$.l'), json_extract(e.value, '$.n'), 1
  FROM probe_windows w, json_each(w.counts) e
) GROUP BY signal, value, label ORDER BY signal, value, label`;
