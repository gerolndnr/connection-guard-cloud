// Discord alerts for networks that turned them on. Runs from the 5-minute cron, every 15 minutes.
// Alerts contain server names, counts and provider names, never player data.
import type { Status } from "@cg/protocol";
import type { Env } from "./env.ts";
import { COLOR, postWebhook, type Embed } from "./discord.ts";
import { webhookFor } from "./network.ts";
import { DAY, HOUR } from "./util.ts";

const OFFLINE_AFTER = 30 * 60_000;
const REPEAT_AFTER = DAY;

type Kind = "server_offline" | "provider_trouble" | "quota_low" | "refusal_spike" | "weekly_digest";
interface Install { id: string; display_name: string | null; platform: string; status_json: string | null; last_seen_at: number }
interface Alert { kind: Kind; key: string; embed: Embed }

const serverName = (i: Install) => i.display_name ?? `${i.platform === "VELOCITY" ? "Velocity" : i.platform === "BUNGEE" ? "BungeeCord" : "Paper/Spigot"} server`;
const num = (n: number) => n.toLocaleString("en-US");

/** ISO week like "2026-W40", the key of the weekly digest. */
function isoWeek(t: number) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function findAlerts(env: Env, networkId: string, kinds: Set<Kind>, now: number): Promise<Alert[]> {
  const installs = (await env.DB.prepare("SELECT id, display_name, platform, status_json, last_seen_at FROM installs WHERE network_id = ?")
    .bind(networkId).all<Install>()).results;
  const alerts: Alert[] = [];
  const link = `${env.APP_ORIGIN}/n/${networkId}`;

  for (const i of installs) {
    const offline = now - i.last_seen_at > OFFLINE_AFTER;
    if (kinds.has("server_offline") && offline && now - i.last_seen_at < 7 * DAY) {
      alerts.push({ kind: "server_offline", key: i.id, embed: {
        title: `${serverName(i)} stopped reporting`, color: COLOR.red, url: link,
        description: `Last report ${Math.round((now - i.last_seen_at) / 60_000)} minutes ago. Players are still checked by the plugin if the server is running; check that it can reach api.connectionguard.net.`,
      } });
    }
    if (offline || !i.status_json) continue;
    const status = JSON.parse(i.status_json) as Status;
    for (const p of status.providers) {
      const failing = p.paused || p.last_reason === "AUTHENTICATION" || p.last_reason === "BUDGET_EXHAUSTED"
        || (p.attempts >= 5 && p.successes / p.attempts < 0.5);
      if (kinds.has("provider_trouble") && failing) {
        const why = p.last_reason === "AUTHENTICATION" ? "rejects the API key" : p.last_reason === "BUDGET_EXHAUSTED" ? "has no quota left today"
          : p.paused ? "is paused after repeated errors" : `answered ${Math.round((p.successes / p.attempts) * 100)}% of lookups`;
        alerts.push({ kind: "provider_trouble", key: `${i.id}:${p.id}`, embed: {
          title: `${p.id} ${why}`, color: COLOR.amber, url: link,
          description: `On ${serverName(i)}. What happens to players depends on your failure settings; see Settings in the dashboard.`,
        } });
      }
      if (kinds.has("quota_low") && p.daily_budget && p.daily_used !== null && p.daily_used / p.daily_budget >= 0.8) {
        alerts.push({ kind: "quota_low", key: `${i.id}:${p.id}:${new Date(now).toISOString().slice(0, 10)}`, embed: {
          title: `${p.id} quota at ${Math.round((p.daily_used / p.daily_budget) * 100)}%`, color: COLOR.amber, url: link,
          description: `${num(p.daily_used)} of ${num(p.daily_budget)} lookups used today on ${serverName(i)}. A free account key or a second service spreads the load.`,
        } });
      }
    }
  }

  const ids = installs.map((i) => i.id);
  if (ids.length && (kinds.has("refusal_spike") || kinds.has("weekly_digest"))) {
    const marks = ids.map(() => "?").join(",");
    const hourNow = Math.floor(now / HOUR) * HOUR;
    if (kinds.has("refusal_spike")) {
      const rows = (await env.DB.prepare(`SELECT hour, SUM(denied) AS denied FROM rollups_hourly WHERE install_id IN (${marks}) AND hour >= ? GROUP BY hour`)
        .bind(...ids, hourNow - 25 * HOUR).all<{ hour: number; denied: number }>()).results;
      const last = rows.find((r) => r.hour === hourNow - HOUR)?.denied ?? 0;
      const before = rows.filter((r) => r.hour < hourNow - HOUR);
      const avg = before.reduce((n, r) => n + r.denied, 0) / 24;
      if (last >= 10 && last >= 3 * Math.max(avg, 1)) {
        alerts.push({ kind: "refusal_spike", key: String(hourNow - HOUR), embed: {
          title: `${num(last)} connections refused in the last hour`, color: COLOR.red, url: `${link}/register`,
          description: `About ${avg < 1 ? "none" : num(Math.round(avg))} per hour is usual. This can be a wave of alts or bots, or a rule that is too strict. Check Decisions.`,
        } });
      }
    }
    const date = new Date(now);
    if (kinds.has("weekly_digest") && date.getUTCDay() === 1 && date.getUTCHours() === 8) {
      const t = await env.DB.prepare(`SELECT SUM(checks) AS checks, SUM(denied) AS denied, SUM(vpn_positive) AS vpn FROM rollups_hourly WHERE install_id IN (${marks}) AND hour >= ?`)
        .bind(...ids, hourNow - 7 * DAY).first<{ checks: number | null; denied: number | null; vpn: number | null }>();
      const online = installs.filter((i) => now - i.last_seen_at <= OFFLINE_AFTER).length;
      alerts.push({ kind: "weekly_digest", key: isoWeek(now), embed: {
        title: "Your week with Connection Guard", color: COLOR.gray, url: link, description: "The last 7 days across your network.",
        fields: [
          { name: "Checked", value: num(t?.checks ?? 0), inline: true },
          { name: "Refused", value: num(t?.denied ?? 0), inline: true },
          { name: "VPN or proxy found", value: num(t?.vpn ?? 0), inline: true },
          { name: "Servers reporting", value: `${online} of ${installs.length}`, inline: true },
        ],
      } });
    }
  }
  return alerts;
}

export async function runAlerts(env: Env, now = Date.now()) {
  const networks = (await env.DB.prepare("SELECT network_id, webhook_enc, kinds_json FROM alert_settings WHERE webhook_enc IS NOT NULL AND kinds_json != '[]'")
    .all<{ network_id: string; webhook_enc: ArrayBuffer | number[]; kinds_json: string }>()).results;
  for (const n of networks) {
    const alerts = await findAlerts(env, n.network_id, new Set(JSON.parse(n.kinds_json) as Kind[]), now);
    if (!alerts.length) continue;
    const sent = (await env.DB.prepare("SELECT kind, key, last_sent_at FROM alert_state WHERE network_id = ?").bind(n.network_id)
      .all<{ kind: string; key: string; last_sent_at: number }>()).results;
    const due = alerts.filter((a) => !sent.some((s) => s.kind === a.kind && s.key === a.key && now - s.last_sent_at < REPEAT_AFTER));
    if (!due.length) continue;
    const url = await webhookFor(env, n.webhook_enc);
    if (!url) continue;
    const res = await postWebhook(url, due.map((a) => a.embed));
    if (!res.ok) continue;
    await env.DB.batch(due.map((a) => env.DB.prepare(
      "INSERT INTO alert_state (network_id, kind, key, last_sent_at) VALUES (?, ?, ?, ?) ON CONFLICT(network_id, kind, key) DO UPDATE SET last_sent_at = excluded.last_sent_at",
    ).bind(n.network_id, a.kind, a.key, now)));
  }
  await env.DB.prepare("DELETE FROM alert_state WHERE last_sent_at < ?").bind(now - 14 * DAY).run();
}
