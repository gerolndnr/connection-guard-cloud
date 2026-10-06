// Scheduled maintenance: retention, cleanup and the free-tier governor.
import type { Env } from "./env.ts";
import { recomputeGovernor } from "./governor.ts";
import { DAY } from "./util.ts";
import { sendEvents, type ServerEvent } from "./analytics.ts";
import { runAlerts } from "./alerts.ts";

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
    // Commands of active access rules stay: they show on which servers the rule is in place.
    env.DB.prepare("DELETE FROM commands WHERE completed_at IS NOT NULL AND completed_at < ? AND (rule_id IS NULL OR rule_id IN (SELECT id FROM access_rules WHERE removed_at IS NOT NULL))").bind(now - 30 * DAY),
    // Expired time-limited rules: the plugin already dropped them; here they stop counting as active.
    env.DB.prepare("UPDATE access_rules SET removed_at = expires_at WHERE removed_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM access_rules WHERE removed_at IS NOT NULL AND removed_at < ?").bind(now - 30 * DAY),
    env.DB.prepare("DELETE FROM invites WHERE expires_at < ?").bind(now - DAY),
    // Error reports: kept while they recur, gone 30 days after the last occurrence.
    env.DB.prepare("DELETE FROM install_errors WHERE last_at < ?").bind(now - 30 * DAY),
  ]);
}

/**
 * Once a day: one event per server seen in the last 24 hours (the honest "active servers" number) and the
 * current shape of each network. Counts and categories only.
 */
export async function reportDaily(env: Env, now = Date.now()) {
  if (!env.POSTHOG_KEY) return;
  const rows = (await env.DB.prepare(
    "SELECT id, network_id, platform, plugin_version, status_json FROM installs WHERE last_seen_at > ?",
  ).bind(now - DAY).all<{ id: string; network_id: string | null; platform: string; plugin_version: string; status_json: string | null }>()).results;
  const events: ServerEvent[] = [];
  const networks = new Map<string, { servers: number; enforce: number; platforms: Set<string>; versions: Set<string> }>();
  for (const r of rows) {
    const mode = r.status_json ? (JSON.parse(r.status_json) as { mode?: string }).mode ?? null : null;
    events.push({ event: "server_active_daily", distinct_id: r.id, person: false, groups: { network: r.network_id },
      properties: { platform: r.platform, plugin_version: r.plugin_version, mode, linked: r.network_id !== null } });
    if (!r.network_id) continue;
    const n = networks.get(r.network_id) ?? { servers: 0, enforce: 0, platforms: new Set(), versions: new Set() };
    n.servers++; if (mode === "ENFORCE") n.enforce++; n.platforms.add(r.platform); n.versions.add(r.plugin_version);
    networks.set(r.network_id, n);
  }
  for (const [id, n] of networks) {
    events.push({ event: "$groupidentify", distinct_id: `network:${id}`, person: false, properties: {
      $group_type: "network", $group_key: id,
      $group_set: { active_servers: n.servers, enforcing_servers: n.enforce, platforms: [...n.platforms], plugin_versions: [...n.versions] },
    } });
  }
  // PostHog accepts large batches, but keep each request small.
  for (let i = 0; i < events.length; i += 500) await sendEvents(env, events.slice(i, i + 500), now);
}

export async function scheduled(controller: ScheduledController, env: Env) {
  if (controller.cron === "17 3 * * *") { await runMaintenance(env); await reportDaily(env); return; }
  await recomputeGovernor(env);
  // Discord alerts every 15 minutes (the 5-minute cron at :00, :15, :30 and :45).
  if (new Date(controller.scheduledTime).getUTCMinutes() % 15 === 0) await runAlerts(env, controller.scheduledTime);
}
