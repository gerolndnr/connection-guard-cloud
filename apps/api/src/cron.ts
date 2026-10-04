// Scheduled maintenance: retention, cleanup and the free-tier governor.
import type { Env } from "./env.ts";
import { recomputeGovernor } from "./governor.ts";
import { DAY } from "./util.ts";

export const UNCLAIMED_RETENTION = 30 * DAY;
export const ROLLUP_RETENTION = 395 * DAY; // ~13 months

export async function runMaintenance(env: Env, now = Date.now()) {
  await env.DB.batch([
    // Raw events: per-network retention (default 30 days).
    env.DB.prepare(
      "DELETE FROM event_batches WHERE last_at < ?1 - (SELECT retention_days FROM networks WHERE networks.id = event_batches.network_id) * 86400000",
    ).bind(now),
    env.DB.prepare("DELETE FROM rollups_hourly WHERE hour < ?").bind(now - ROLLUP_RETENTION),
    env.DB.prepare("DELETE FROM installs WHERE network_id IS NULL AND last_seen_at < ?").bind(now - UNCLAIMED_RETENTION),
    env.DB.prepare("DELETE FROM link_codes WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM commands WHERE completed_at IS NOT NULL AND completed_at < ?").bind(now - 30 * DAY),
  ]);
}

export async function scheduled(controller: ScheduledController, env: Env) {
  if (controller.cron === "17 3 * * *") await runMaintenance(env);
  else await recomputeGovernor(env);
}
