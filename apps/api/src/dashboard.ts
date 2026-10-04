// JSON API for the dashboard SPA (same origin, cookie session).
import { Hono } from "hono";
import { capture } from "./analytics.ts";
import { z } from "zod";
import type { DecisionEvent, Status } from "@cg/protocol";
import type { AppEnv, Env } from "./env.ts";
import { requireUser, sameOrigin } from "./auth.ts";
import { DAY, HOUR, gunzipJson, mergeCounts, newId, newNetworkToken, normalizeLinkCode, sha256Hex } from "./util.ts";
import { verifyTurnstile } from "./turnstile.ts";
import { registerSettings } from "./settings.ts";
import { audit, canManage, roleIn, type Role } from "./access.ts";
import { registerNetwork, rulesForNewInstall } from "./network.ts";
import { isPlayerName, uuidForName } from "./players.ts";

const ONLINE_WINDOW = 20 * 60_000;

function installView(row: InstallRow, now: number) {
  const status = row.status_json ? (JSON.parse(row.status_json) as Status) : null;
  return {
    id: row.id,
    name: row.display_name,
    platform: row.platform,
    platform_version: row.platform_version,
    plugin_version: row.plugin_version,
    java_version: row.java_version,
    created_at: row.created_at,
    claimed_at: row.claimed_at,
    last_seen_at: row.last_seen_at,
    online: now - row.last_seen_at < ONLINE_WINDOW,
    status,
  };
}

interface InstallRow {
  id: string; display_name: string | null; platform: string; platform_version: string; plugin_version: string;
  java_version: string; created_at: number; claimed_at: number | null; last_seen_at: number; status_json: string | null;
}
const INSTALL_COLUMNS = "id, display_name, platform, platform_version, plugin_version, java_version, created_at, claimed_at, last_seen_at, status_json";

interface RollupRow {
  observing: number;
  hour: number; checks: number; allowed: number; denied: number; errors: number; vpn_positive: number;
  geo_flagged: number; cache_hits: number; lookups: number; latency_p95_max: number | null;
  countries_json: string; reasons_json: string;
}

const RANGES = { "24h": { span: DAY, bucket: HOUR }, "7d": { span: 7 * DAY, bucket: HOUR }, "30d": { span: 30 * DAY, bucket: DAY }, "90d": { span: 90 * DAY, bucket: DAY } } as const;

export function summarize(rows: RollupRow[], from: number, to: number, bucket: number) {
  const totals = { checks: 0, allowed: 0, denied: 0, errors: 0, vpn_positive: 0, geo_flagged: 0, cache_hits: 0, lookups: 0 };
  // Flagged-but-admitted entries mean different things by mode: "would refuse" while a server
  // observes (pencil), "let in by your settings" while it enforces.
  let wouldRefuse = 0;
  let flaggedLetIn = 0;
  const countries: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  const start = Math.floor(from / bucket) * bucket;
  const series = new Map<number, { t: number; checks: number; denied: number; would_refuse: number; vpn_positive: number; latency_p95: number | null }>();
  for (let t = start; t <= to; t += bucket) series.set(t, { t, checks: 0, denied: 0, would_refuse: 0, vpn_positive: 0, latency_p95: null });
  let latencyMax: number | null = null;
  for (const r of rows) {
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += r[k];
    mergeCounts(countries, JSON.parse(r.countries_json));
    const rowReasons = JSON.parse(r.reasons_json) as Record<string, number>;
    mergeCounts(reasons, rowReasons);
    const flagged = rowReasons.FLAG_ALLOWED ?? 0;
    if (r.observing) wouldRefuse += flagged; else flaggedLetIn += flagged;
    const point = series.get(Math.floor(r.hour / bucket) * bucket);
    if (point) {
      point.checks += r.checks; point.denied += r.denied; point.vpn_positive += r.vpn_positive;
      if (r.observing) point.would_refuse += flagged;
      if (r.latency_p95_max !== null) point.latency_p95 = Math.max(point.latency_p95 ?? 0, r.latency_p95_max);
    }
    if (r.latency_p95_max !== null) latencyMax = Math.max(latencyMax ?? 0, r.latency_p95_max);
  }
  const top = (rec: Record<string, number>, n: number) =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, value]) => ({ key, value }));
  return {
    totals: { ...totals, would_refuse: wouldRefuse, flagged_let_in: flaggedLetIn, latency_p95_max: latencyMax, cache_hit_rate: totals.lookups + totals.cache_hits > 0 ? totals.cache_hits / (totals.lookups + totals.cache_hits) : null },
    series: [...series.values()],
    countries: top(countries, 15),
    reasons: top(reasons, 10),
  };
}

export const dashboard = new Hono<AppEnv>();

dashboard.get("/config", (c) => c.json({
  environment: c.env.ENVIRONMENT,
  discord_enabled: Boolean(c.env.DISCORD_CLIENT_ID),
  dev_login: c.env.ENVIRONMENT !== "production" && c.env.APP_ORIGIN.startsWith("http://localhost"),
  turnstile_site_key: c.env.TURNSTILE_SITE_KEY,
  dpa_version: c.env.DPA_VERSION,
  // Set only in production (and for local analytics checks via `--var POSTHOG_KEY:...`).
  posthog_key: c.env.ENVIRONMENT === "test" ? "" : (c.env.POSTHOG_KEY ?? ""),
  posthog_host: c.env.POSTHOG_HOST || "https://eu.i.posthog.com",
}));

// A message for every dashboard user (maintenance, incidents, sub-processor changes), set in KV:
// npx wrangler kv key put announcement '{"id":"…","tone":"info","text":"…","url":"…"}' --binding PUBLIC --env production --remote
let announcementCache: { at: number; value: unknown } | null = null;
dashboard.get("/announcement", async (c) => {
  const now = Date.now();
  if (!announcementCache || now - announcementCache.at > 60_000) {
    const raw = await c.env.PUBLIC.get("announcement");
    let value: unknown = null;
    try { value = raw ? JSON.parse(raw) : null; } catch { value = null; }
    announcementCache = { at: now, value };
  }
  return c.json({ announcement: announcementCache.value });
});

dashboard.use("/*", sameOrigin);
dashboard.use("/me", requireUser);
dashboard.use("/link/*", requireUser);
dashboard.use("/networks/*", requireUser);
dashboard.use("/installs/*", requireUser);
dashboard.use("/invites/*", requireUser);
dashboard.use("/players", requireUser);

dashboard.get("/me", async (c) => {
  const user = c.get("user");
  const networks = await c.env.DB.prepare(
    `SELECT n.id, n.name, m.role, (SELECT COUNT(*) FROM installs i WHERE i.network_id = n.id) AS servers
     FROM memberships m JOIN networks n ON n.id = m.network_id WHERE m.user_id = ? ORDER BY n.created_at`,
  ).bind(user.id).all<{ id: string; name: string; role: Role; servers: number }>();
  return c.json({ user, networks: networks.results });
});

dashboard.get("/link/:code", async (c) => {
  const code = normalizeLinkCode(c.req.param("code"));
  if (!code) return c.json({ error: "invalid_code" }, 400);
  const now = Date.now();
  const row = await c.env.DB.prepare(
    `SELECT ${INSTALL_COLUMNS.split(", ").map((col) => `i.${col}`).join(", ")}, i.network_id FROM link_codes l
     JOIN installs i ON i.id = l.install_id WHERE l.code = ? AND l.expires_at > ?`,
  ).bind(code, now).first<InstallRow & { network_id: string | null }>();
  if (!row || row.network_id) return c.json({ error: "unknown_code" }, 404);
  const since = await c.env.DB.prepare(
    "SELECT SUM(checks) AS checks, SUM(denied) AS denied, SUM(vpn_positive) AS vpn_positive FROM rollups_hourly WHERE install_id = ?",
  ).bind(row.id).first<{ checks: number | null; denied: number | null; vpn_positive: number | null }>();
  return c.json({
    code,
    install: installView(row, now),
    since_install: { checks: since?.checks ?? 0, denied: since?.denied ?? 0, vpn_positive: since?.vpn_positive ?? 0 },
  });
});

const ClaimBody = z.object({
  network_id: z.string().regex(/^net_[A-Za-z0-9]{24}$/).optional(),
  network_name: z.string().trim().min(1).max(64).optional(),
  server_name: z.string().trim().min(1).max(64).optional(),
  accept_dpa: z.literal(true),
  dpa_version: z.string(),
  turnstile_token: z.string().max(2048),
}).refine((b) => Boolean(b.network_id) !== Boolean(b.network_name), "choose an existing network or name a new one");

dashboard.post("/link/:code", async (c) => {
  const env = c.env;
  const user = c.get("user");
  const code = normalizeLinkCode(c.req.param("code"));
  const parsed = ClaimBody.safeParse(await c.req.json().catch(() => null));
  if (!code || !parsed.success) return c.json({ error: "bad_request" }, 400);
  const body = parsed.data;
  if (body.dpa_version !== env.DPA_VERSION) return c.json({ error: "dpa_outdated" }, 409);
  if (!(await verifyTurnstile(env, body.turnstile_token, c.req.header("cf-connecting-ip")))) {
    return c.json({ error: "turnstile_failed" }, 403);
  }
  const now = Date.now();
  const link = await env.DB.prepare(
    "SELECT l.install_id FROM link_codes l JOIN installs i ON i.id = l.install_id WHERE l.code = ? AND l.expires_at > ? AND i.network_id IS NULL",
  ).bind(code, now).first<{ install_id: string }>();
  if (!link) return c.json({ error: "unknown_code" }, 404);

  let networkId = body.network_id;
  const statements: D1PreparedStatement[] = [];
  if (networkId) {
    if (!canManage(await roleIn(env, networkId, user.id))) return c.json({ error: "forbidden" }, 403);
  } else {
    networkId = newId("net");
    statements.push(
      env.DB.prepare("INSERT INTO networks (id, name, created_by, created_at) VALUES (?, ?, ?, ?)").bind(networkId, body.network_name, user.id, now),
      env.DB.prepare("INSERT INTO memberships (network_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(networkId, user.id, now),
    );
  }
  statements.push(
    env.DB.prepare("INSERT OR IGNORE INTO dpa_acceptances (network_id, user_id, version, accepted_at) VALUES (?, ?, ?, ?)")
      .bind(networkId, user.id, env.DPA_VERSION, now),
    env.DB.prepare("UPDATE installs SET network_id = ?, claimed_at = ?, display_name = COALESCE(?, display_name) WHERE id = ? AND network_id IS NULL")
      .bind(networkId, now, body.server_name ?? null, link.install_id),
    env.DB.prepare("DELETE FROM link_codes WHERE install_id = ?").bind(link.install_id),
    // The setup assistant opens right after linking: let the network's servers check in every 15 s for a while.
    env.DB.prepare("UPDATE networks SET watched_until = ? WHERE id = ?").bind(now + 10 * 60_000, networkId),
    env.DB.prepare("INSERT INTO audit_log (network_id, user_id, action, detail_json, at) VALUES (?, ?, 'install.linked', ?, ?)")
      .bind(networkId, user.id, JSON.stringify({ install_id: link.install_id }), now),
    // Access rules the network already has apply to the new server too.
    ...(body.network_id ? await rulesForNewInstall(env, networkId, link.install_id, now) : []),
  );
  await env.DB.batch(statements);
  const ins = await env.DB.prepare("SELECT platform, plugin_version, created_at FROM installs WHERE id = ?").bind(link.install_id)
    .first<{ platform: string; plugin_version: string; created_at: number }>();
  capture(c, {
    event: "server_linked", distinct_id: user.id, groups: { network: networkId },
    properties: { install_id: link.install_id, new_network: !body.network_id, platform: ins?.platform, plugin_version: ins?.plugin_version,
      minutes_since_install: ins ? Math.round((now - ins.created_at) / 60_000) : null, server_named: Boolean(body.server_name) },
  });
  return c.json({ network_id: networkId, install_id: link.install_id }, 201);
});

dashboard.get("/networks/:id", async (c) => {
  const env = c.env;
  const id = c.req.param("id");
  const role = await roleIn(env, id, c.get("user").id);
  if (!role) return c.json({ error: "not_found" }, 404);
  const network = await env.DB.prepare("SELECT id, name, retention_days, created_at FROM networks WHERE id = ?").bind(id).first();
  const installs = await env.DB.prepare(`SELECT ${INSTALL_COLUMNS} FROM installs WHERE network_id = ? ORDER BY claimed_at`)
    .bind(id).all<InstallRow>();
  const now = Date.now();
  return c.json({ network, role, installs: installs.results.map((row) => installView(row, now)) });
});

dashboard.get("/networks/:id/stats", async (c) => {
  const env = c.env;
  const id = c.req.param("id");
  if (!(await roleIn(env, id, c.get("user").id))) return c.json({ error: "not_found" }, 404);
  const rangeKey = (c.req.query("range") ?? "24h") as keyof typeof RANGES;
  const range = RANGES[rangeKey];
  if (!range) return c.json({ error: "bad_request" }, 400);
  const installId = c.req.query("install");
  const to = Date.now();
  const from = to - range.span;
  const rows = await env.DB.prepare(
    `SELECT (json_extract(i.status_json, '$.mode') = 'OBSERVE') AS observing, r.hour, r.checks, r.allowed, r.denied, r.errors, r.vpn_positive, r.geo_flagged, r.cache_hits, r.lookups,
       r.latency_p95_max, r.countries_json, r.reasons_json
     FROM rollups_hourly r JOIN installs i ON i.id = r.install_id
     WHERE i.network_id = ? AND r.hour >= ? ${installId ? "AND r.install_id = ?" : ""}`,
  ).bind(...(installId ? [id, from - HOUR, installId] : [id, from - HOUR])).all<RollupRow>();
  // The same window just before, for "vs previous period" deltas. Aggregates only.
  const prev = await env.DB.prepare(
    `SELECT COALESCE(SUM(r.checks), 0) AS checks, COALESCE(SUM(r.denied), 0) AS denied, COALESCE(SUM(r.vpn_positive), 0) AS vpn_positive
     FROM rollups_hourly r JOIN installs i ON i.id = r.install_id
     WHERE i.network_id = ? AND r.hour >= ? AND r.hour < ? ${installId ? "AND r.install_id = ?" : ""}`,
  ).bind(...(installId ? [id, from - range.span - HOUR, from - HOUR, installId] : [id, from - range.span - HOUR, from - HOUR]))
    .first<{ checks: number; denied: number; vpn_positive: number }>();
  return c.json({ range: rangeKey, from, to, bucket_ms: range.bucket, ...summarize(rows.results, from, to, range.bucket),
    previous: prev ?? { checks: 0, denied: 0, vpn_positive: 0 } });
});

dashboard.get("/networks/:id/events", async (c) => {
  const env = c.env;
  const id = c.req.param("id");
  if (!(await roleIn(env, id, c.get("user").id))) return c.json({ error: "not_found" }, 404);
  const before = Number(c.req.query("before") ?? Date.now() + 1);
  const outcome = c.req.query("outcome");
  const query = (c.req.query("q") ?? "").trim().toLowerCase();
  // A player name is looked up at Mojang so decisions can be found by name; names are not stored with decisions.
  const nameUuid = env.ENVIRONMENT !== "test" && isPlayerName(query) && !/^[0-9a-f.:]+$/.test(query) ? await uuidForName(query) : null;
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50)));
  const installId = c.req.query("install");
  const batches = await env.DB.prepare(
    `SELECT install_id, payload FROM event_batches WHERE network_id = ? AND first_at < ?
     ${outcome === "DENY" ? "AND denied_count > 0" : ""} ${installId ? "AND install_id = ?" : ""} ORDER BY last_at DESC LIMIT 40`,
  ).bind(...(installId ? [id, before, installId] : [id, before])).all<{ install_id: string; payload: ArrayBuffer | number[] }>();
  const events: (DecisionEvent & { install_id: string })[] = [];
  for (const b of batches.results) {
    for (const e of await gunzipJson<DecisionEvent[]>(b.payload)) {
      if (e.at >= before) continue;
      if (outcome === "WOULD_REFUSE") {
        // Observe mode: flagged but admitted, i.e. what ENFORCE would have refused.
        if (!(e.mode === "OBSERVE" && e.outcome === "ALLOW" && e.flags.length > 0)) continue;
      } else if (outcome && e.outcome !== outcome) continue;
      if (query && !e.ip.toLowerCase().includes(query) && !(e.uuid ?? "").includes(query) && !(nameUuid && e.uuid === nameUuid)
        && !e.sources.some((s) => (s.country ?? "").toLowerCase() === query || (s.isp ?? "").toLowerCase().includes(query))) continue;
      events.push({ ...e, install_id: b.install_id });
    }
  }
  events.sort((a, b) => b.at - a.at);
  const page = events.slice(0, limit);
  return c.json({ events: page, next_before: page.length === limit ? page[page.length - 1]!.at : null });
});

dashboard.post("/networks/:id/tokens", async (c) => {
  const env = c.env;
  const id = c.req.param("id");
  const user = c.get("user");
  if (!canManage(await roleIn(env, id, user.id))) return c.json({ error: "forbidden" }, 403);
  const token = newNetworkToken();
  await env.DB.prepare("INSERT INTO network_tokens (token_hash, network_id, created_by, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), id, user.id, Date.now()).run();
  await audit(env, id, user.id, "network_token.created");
  capture(c, { event: "network_token_created", distinct_id: user.id, groups: { network: id } });
  // Shown exactly once; only the hash is stored.
  return c.json({ token }, 201);
});

async function installForManager(env: Env, installId: string, userId: string) {
  const row = await env.DB.prepare("SELECT network_id FROM installs WHERE id = ?").bind(installId).first<{ network_id: string | null }>();
  if (!row?.network_id || !canManage(await roleIn(env, row.network_id, userId))) return null;
  return row.network_id;
}

dashboard.patch("/installs/:id", async (c) => {
  const env = c.env;
  const user = c.get("user");
  const installId = c.req.param("id");
  const networkId = await installForManager(env, installId, user.id);
  if (!networkId) return c.json({ error: "not_found" }, 404);
  const parsed = z.object({ name: z.string().trim().min(1).max(64).nullable() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "bad_request" }, 400);
  await env.DB.prepare("UPDATE installs SET display_name = ? WHERE id = ?").bind(parsed.data.name, installId).run();
  await audit(env, networkId, user.id, "install.renamed", { install_id: installId });
  capture(c, { event: "server_renamed", distinct_id: user.id, groups: { network: networkId } });
  return c.json({ ok: true });
});

registerSettings(dashboard);
registerNetwork(dashboard);

dashboard.post("/installs/:id/unlink", async (c) => {
  const env = c.env;
  const user = c.get("user");
  const installId = c.req.param("id");
  const networkId = await installForManager(env, installId, user.id);
  if (!networkId) return c.json({ error: "not_found" }, 404);
  const now = Date.now();
  // Events of this server are deleted right away; aggregates stay with the anonymous install.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM event_batches WHERE install_id = ?").bind(installId),
    env.DB.prepare("DELETE FROM commands WHERE install_id = ?").bind(installId),
    env.DB.prepare("UPDATE installs SET network_id = NULL, claimed_at = NULL, display_name = NULL WHERE id = ?").bind(installId),
    env.DB.prepare("INSERT INTO audit_log (network_id, user_id, action, detail_json, at) VALUES (?, ?, 'install.unlinked', ?, ?)")
      .bind(networkId, user.id, JSON.stringify({ install_id: installId }), now),
  ]);
  capture(c, { event: "server_unlinked", distinct_id: user.id, groups: { network: networkId } });
  return c.json({ ok: true });
});
