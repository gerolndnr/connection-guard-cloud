// Plugin protocol v1: POST /v1/installs and POST /v1/sync.
// Nothing here is on a Minecraft login path: the plugin calls these from a
// background thread and treats every failure as "try again later".
import { Hono, type Context } from "hono";
import { capture } from "./analytics.ts";
import {
  Command, InstallRequest, MAX_BODY_BYTES, SyncRequest, tolerateSync,
  type Counters, type DesiredConfig, type ErrorResponse, type InstallResponse, type SyncResponse,
} from "@cg/protocol";
import { openSecrets } from "./secrets.ts";
import type { AppEnv, Env } from "./env.ts";
import { governorState, nextSyncIn } from "./governor.ts";
import {
  DAY, gzipJson, hourStart, mergeCounts, newId, newLinkCode, newSecret, readBody, sha256Hex, timingSafeEqualHex,
} from "./util.ts";

const LINK_CODE_TTL = DAY;
// New, still unlinked installs check in every 15 s for their first half hour: that is when operators
// open the link, and the setup assistant should not wait for the server to notice it was linked.
// About 120 extra requests per new install, negligible against the daily budget.
const ONBOARDING_WINDOW = 30 * 60_000;
// Only touch installs.last_seen_at this often when nothing else changed, to save D1 writes.
const SEEN_WRITE_INTERVAL = 4 * 60_000;

type Ctx = Context<AppEnv>;

function fail(c: Ctx, status: 400 | 401 | 413 | 426 | 429 | 500, error: ErrorResponse["error"], retryIn: number | null = null) {
  const body: ErrorResponse = { error, retry_in: retryIn };
  return c.json(body, status);
}

function linkUrl(env: Env, code: string) { return `${env.APP_ORIGIN}/link/${code}`; }

/** Returns a valid link code for an unclaimed install, rotating it when expired. */
async function ensureLinkCode(env: Env, installId: string, now: number): Promise<string> {
  const existing = await env.DB.prepare("SELECT code, expires_at FROM link_codes WHERE install_id = ?")
    .bind(installId).first<{ code: string; expires_at: number }>();
  // Refresh a little before expiry so the console never shows a code that dies minutes later.
  if (existing && existing.expires_at - now > LINK_CODE_TTL / 4) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newLinkCode();
    try {
      await env.DB.prepare(
        "INSERT INTO link_codes (code, install_id, expires_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(install_id) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at",
      ).bind(code, installId, now + LINK_CODE_TTL).run();
      return code;
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e; // code collision on the primary key: retry
    }
  }
  throw new Error("could not allocate link code");
}

async function authenticate(env: Env, header: string | undefined) {
  const match = /^Bearer (ins_[A-Za-z0-9]{20,32})\.(cgs_[A-Za-z0-9_-]{40,64})$/.exec(header ?? "");
  if (!match) return null;
  const [, installId, secret] = match;
  const row = await env.DB.prepare(
    "SELECT i.id, i.secret_hash, i.network_id, i.last_seq, i.last_seen_at, i.created_at, i.status_json, i.plugin_version, i.platform, " +
    "i.platform_version, n.name AS network_name, COALESCE(n.watched_until, 0) AS watched_until FROM installs i LEFT JOIN networks n ON n.id = i.network_id WHERE i.id = ?",
  ).bind(installId).first<{
    id: string; secret_hash: string; network_id: string | null; last_seq: number; last_seen_at: number; created_at: number;
    status_json: string | null; plugin_version: string; platform: string; platform_version: string; network_name: string | null; watched_until: number;
  }>();
  if (!row) return null;
  if (!timingSafeEqualHex(row.secret_hash, await sha256Hex(secret!))) return null;
  return row;
}

async function writeRollup(env: Env, installId: string, counters: Counters) {
  if (counters.checks === 0 && counters.lookups === 0) return;
  const hour = hourStart(counters.window_end);
  const existing = await env.DB.prepare(
    "SELECT countries_json, reasons_json FROM rollups_hourly WHERE install_id = ? AND hour = ?",
  ).bind(installId, hour).first<{ countries_json: string; reasons_json: string }>();
  const countries = mergeCounts(existing ? JSON.parse(existing.countries_json) : {}, counters.countries);
  const reasons = mergeCounts(existing ? JSON.parse(existing.reasons_json) : {}, counters.reasons);
  await env.DB.prepare(
    `INSERT INTO rollups_hourly (install_id, hour, checks, allowed, denied, errors, vpn_positive, geo_flagged,
       cache_hits, lookups, latency_p95_max, countries_json, reasons_json)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
     ON CONFLICT(install_id, hour) DO UPDATE SET
       checks = checks + excluded.checks, allowed = allowed + excluded.allowed, denied = denied + excluded.denied,
       errors = errors + excluded.errors, vpn_positive = vpn_positive + excluded.vpn_positive,
       geo_flagged = geo_flagged + excluded.geo_flagged, cache_hits = cache_hits + excluded.cache_hits,
       lookups = lookups + excluded.lookups,
       latency_p95_max = MAX(COALESCE(latency_p95_max, 0), COALESCE(excluded.latency_p95_max, 0)),
       countries_json = excluded.countries_json, reasons_json = excluded.reasons_json`,
  ).bind(installId, hour, counters.checks, counters.allowed, counters.denied, counters.errors, counters.vpn_positive,
    counters.geo_flagged, counters.cache_hits, counters.lookups, counters.latency_ms_p95,
    JSON.stringify(countries), JSON.stringify(reasons)).run();
}

function writeMetrics(env: Env, installId: string, platform: string, pluginVersion: string, counters: Counters, claimed: boolean) {
  // Analytics Engine has no EU jurisdiction: only ids, versions and counts, never personal data.
  try {
    env.METRICS?.writeDataPoint({
      indexes: [installId],
      blobs: [platform, pluginVersion, claimed ? "claimed" : "unclaimed"],
      doubles: [counters.checks, counters.allowed, counters.denied, counters.errors, counters.vpn_positive,
        counters.geo_flagged, counters.cache_hits, counters.lookups, counters.latency_ms_p95 ?? 0],
    });
  } catch { /* metrics are best effort */ }
}

/** "21.0.4" → 21, "1.8.0_402" → 8. */
function javaMajor(v: string): number | null {
  const m = /^(?:1\.)?(\d+)/.exec(v);
  return m ? Number(m[1]) : null;
}

export const plugin = new Hono<AppEnv>();

plugin.post("/v1/installs", async (c) => {
  const env = c.env;
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  if (env.ENVIRONMENT === "production" && env.INSTALL_LIMITER && !(await env.INSTALL_LIMITER.limit({ key: `install:${ip}` })).success) {
    return fail(c, 429, "rate_limited", 300);
  }
  const raw = await readBody(c.req.raw, 4096);
  if (raw === null) return fail(c, 413, "payload_too_large");
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return fail(c, 400, "bad_request"); }
  if (typeof json === "object" && json !== null && "protocol" in json && json.protocol !== 1) {
    return fail(c, 426, "unsupported_protocol");
  }
  const parsed = InstallRequest.safeParse(json);
  if (!parsed.success) return fail(c, 400, "bad_request");
  const req = parsed.data;
  const now = Date.now();

  let networkId: string | null = null;
  if (req.network_token) {
    const token = await env.DB.prepare("SELECT network_id FROM network_tokens WHERE token_hash = ? AND revoked_at IS NULL")
      .bind(await sha256Hex(req.network_token)).first<{ network_id: string }>();
    if (!token) return fail(c, 401, "unauthorized");
    networkId = token.network_id;
  }

  const installId = newId("ins");
  const secret = newSecret();
  await env.DB.prepare(
    `INSERT INTO installs (id, secret_hash, network_id, platform, platform_version, plugin_version, java_version,
       created_at, last_seen_at, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(installId, await sha256Hex(secret), networkId, req.platform, req.platform_version, req.plugin_version,
    req.java_version, now, now, networkId ? now : null).run();

  const code = networkId ? null : await ensureLinkCode(env, installId, now);
  const gov = await governorState(env, now);
  const body: InstallResponse = {
    install_id: installId,
    secret,
    link_code: code,
    link_url: code ? linkUrl(env, code) : null,
    claimed: networkId !== null,
    // Onboarding pace from the very first sync (see ONBOARDING_WINDOW).
    next_sync_in: nextSyncIn(gov, { busy: true, live: false, fast: true }),
  };
  capture(c, {
    event: "plugin_installed", distinct_id: installId, person: false, groups: { network: networkId },
    properties: { platform: req.platform, platform_version: req.platform_version, plugin_version: req.plugin_version,
      java_major: javaMajor(req.java_version), via_network_token: networkId !== null },
  });
  return c.json(body, 201);
});

plugin.post("/v1/sync", async (c) => {
  const env = c.env;
  const install = await authenticate(env, c.req.header("authorization"));
  if (!install) return fail(c, 401, "unauthorized");
  if (env.ENVIRONMENT === "production" && env.SYNC_LIMITER && !(await env.SYNC_LIMITER.limit({ key: `sync:${install.id}` })).success) {
    return fail(c, 429, "rate_limited", 60);
  }
  const raw = await readBody(c.req.raw, MAX_BODY_BYTES);
  if (raw === null) return fail(c, 413, "payload_too_large");
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return fail(c, 400, "bad_request"); }
  if (typeof json === "object" && json !== null && "protocol" in json && json.protocol !== 1) {
    return fail(c, 426, "unsupported_protocol");
  }
  // A newer plugin may send enum values this version does not know yet; lose those events, not the whole sync.
  const tolerated = tolerateSync(json);
  const parsed = SyncRequest.safeParse(tolerated.json);
  if (!parsed.success) return fail(c, 400, "bad_request");
  if (tolerated.dropped_events > 0 || tolerated.dropped_reasons > 0) {
    // Tells us the dashboard lags behind a plugin release; contains no player data.
    capture(c, {
      event: "sync_partly_unreadable", distinct_id: install.id, person: false,
      properties: { plugin_version: parsed.data.plugin_version, dropped_events: tolerated.dropped_events,
        dropped_reasons: tolerated.dropped_reasons },
    });
  }
  const req = parsed.data;
  const now = Date.now();
  const claimed = install.network_id !== null;
  // A retried request carries the same seq: never count it twice.
  const fresh = req.seq > install.last_seq;

  if (fresh) {
    await writeRollup(env, install.id, req.counters);
    writeMetrics(env, install.id, req.status.mode, req.plugin_version, req.counters, claimed);

    if (claimed && req.events.length > 0) {
      // Activation: the first decisions this server ever sent to the dashboard.
      const first = !(await env.DB.prepare("SELECT 1 FROM event_batches WHERE install_id = ? LIMIT 1").bind(install.id).first());
      if (first) {
        capture(c, {
          event: "first_decisions_received", distinct_id: install.id, person: false, groups: { network: install.network_id },
          properties: { platform: install.platform, plugin_version: req.plugin_version, mode: req.status.mode,
            minutes_since_install: Math.round((now - install.created_at) / 60_000), decisions: req.events.length },
        });
      }
      const ats = req.events.map((e) => e.at);
      await env.DB.prepare(
        `INSERT INTO event_batches (network_id, install_id, received_at, first_at, last_at, event_count, denied_count, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(install.network_id, install.id, now, Math.min(...ats), Math.max(...ats), req.events.length,
        req.events.filter((e) => e.outcome === "DENY").length, await gzipJson(req.events)).run();
    }

    for (const result of req.command_results) {
      await env.DB.prepare(
        "UPDATE commands SET completed_at = ?, result_ok = ?, result_message = ? WHERE id = ? AND install_id = ? AND completed_at IS NULL",
      ).bind(now, result.ok ? 1 : 0, result.message, result.id, install.id).run();
    }
  }

  const statusJson = JSON.stringify(req.status);
  // Uptime changes on every sync; ignore it when deciding whether the status needs a D1 write.
  const stable = (json: string | null) => {
    if (!json) return null;
    const { uptime_seconds: _ignored, ...rest } = JSON.parse(json) as Record<string, unknown>;
    return JSON.stringify(rest);
  };
  const changed = stable(statusJson) !== stable(install.status_json) || req.plugin_version !== install.plugin_version
    || req.platform_version !== install.platform_version;
  if (fresh && (changed || now - install.last_seen_at > SEEN_WRITE_INTERVAL)) {
    await env.DB.prepare(
      "UPDATE installs SET status_json = ?, plugin_version = ?, platform_version = ?, last_seq = ?, last_seen_at = ? WHERE id = ?",
    ).bind(statusJson, req.plugin_version, req.platform_version, req.seq, now, install.id).run();
  } else if (fresh) {
    await env.DB.prepare("UPDATE installs SET last_seq = ? WHERE id = ?").bind(req.seq, install.id).run();
  }

  let commands: Command[] = [];
  if (claimed) {
    const pending = await env.DB.prepare(
      "SELECT id, payload_json FROM commands WHERE install_id = ? AND completed_at IS NULL ORDER BY created_at LIMIT 32",
    ).bind(install.id).all<{ id: string; payload_json: string }>();
    commands = pending.results.flatMap((row) => {
      const cmd = Command.safeParse({ ...JSON.parse(row.payload_json), id: row.id });
      return cmd.success ? [cmd.data] : [];
    });
    if (commands.length > 0) {
      await env.DB.prepare(
        `UPDATE commands SET delivered_at = ? WHERE install_id = ? AND delivered_at IS NULL AND id IN (${commands.map(() => "?").join(",")})`,
      ).bind(now, install.id, ...commands.map((cmd) => cmd.id)).run();
    }
  }

  // Dashboard-managed configuration: record the plugin's result, deliver a newer desired version.
  let desired: DesiredConfig | null = null;
  let configPending = false;
  if (claimed) {
    const cfg = await env.DB.prepare(
      "SELECT version, reset, values_json, keep_secrets_json, secrets_enc, applied_version, error_version FROM install_configs WHERE install_id = ?",
    ).bind(install.id).first<{ version: number; reset: number; values_json: string; keep_secrets_json: string;
      secrets_enc: ArrayBuffer | number[] | null; applied_version: number; error_version: number | null }>();
    if (cfg) {
      const reported = req.status.config_result;
      const appliedNow = (req.status.config_version ?? 0) >= cfg.version || (reported?.ok === true && reported.version >= cfg.version);
      if (fresh && appliedNow && cfg.applied_version < cfg.version) {
        // Applied: the plugin keeps its own copy of the secrets, so ours are deleted now.
        await env.DB.prepare("UPDATE install_configs SET applied_version = ?, applied_at = ?, secrets_enc = NULL, error_version = NULL, error_message = NULL WHERE install_id = ?")
          .bind(cfg.version, now, install.id).run();
        capture(c, { event: "settings_applied", distinct_id: install.id, person: false, groups: { network: install.network_id },
          properties: { version: cfg.version, reset: cfg.reset === 1, platform: install.platform, plugin_version: req.plugin_version } });
      } else if (fresh && reported && !reported.ok && reported.version === cfg.version && cfg.error_version !== cfg.version) {
        await env.DB.prepare("UPDATE install_configs SET error_version = ?, error_message = ? WHERE install_id = ?")
          .bind(cfg.version, reported.message ?? "The server rejected these settings.", install.id).run();
        capture(c, { event: "settings_rejected", distinct_id: install.id, person: false, groups: { network: install.network_id },
          properties: { version: cfg.version, message: (reported.message ?? "").slice(0, 160), platform: install.platform, plugin_version: req.plugin_version } });
      } else if (!appliedNow && cfg.error_version !== cfg.version && !(reported && !reported.ok && reported.version === cfg.version)) {
        configPending = true;
        const values: Record<string, unknown> = JSON.parse(cfg.values_json);
        if (cfg.secrets_enc) Object.assign(values, await openSecrets(env, cfg.secrets_enc));
        desired = { version: cfg.version, reset: cfg.reset === 1, values, keep_secrets: JSON.parse(cfg.keep_secrets_json) } as DesiredConfig;
      }
    }
  }

  const code = claimed ? null : await ensureLinkCode(env, install.id, now);
  const gov = await governorState(env, now);
  const onboarding = !claimed && now - install.created_at < ONBOARDING_WINDOW;
  const busy = req.counters.checks > 0 || req.events.length > 0 || req.status.buffered_events > 0;
  const body: SyncResponse = {
    next_sync_in: nextSyncIn(gov, { busy, live: false, fast: onboarding || configPending || install.watched_until > now }),
    live: false,
    claimed,
    network_name: install.network_name,
    link_code: code,
    link_url: code ? linkUrl(env, code) : null,
    accept_events: claimed,
    commands,
    config: desired,
  };
  return c.json(body);
});
