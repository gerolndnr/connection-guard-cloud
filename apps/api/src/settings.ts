// Dashboard-managed plugin settings: read effective values, save a new desired version, reset to config.yml.
import type { Hono } from "hono";
import { z } from "zod";
import { CONFIG_FIELDS, ConfigValues, SECRET_PATHS, fieldSchema, isConfigPath, type ConfigPath, type Status } from "@cg/protocol";
import type { AppEnv, Env } from "./env.ts";
import { openSecrets, sealSecrets } from "./secrets.ts";

type Role = "owner" | "admin" | "viewer";
const WATCH_WINDOW = 10 * 60_000;

interface ConfigRow {
  version: number; reset: number; values_json: string; secret_paths_json: string; keep_secrets_json: string;
  secrets_enc: ArrayBuffer | number[] | null; updated_at: number; updated_by_name: string | null;
  applied_version: number; applied_at: number | null; error_version: number | null; error_message: string | null;
}

async function installAccess(env: Env, installId: string, userId: string) {
  return env.DB.prepare(
    `SELECT i.id, i.network_id, i.status_json, i.last_seen_at, m.role FROM installs i
     JOIN memberships m ON m.network_id = i.network_id AND m.user_id = ? WHERE i.id = ?`,
  ).bind(userId, installId).first<{ id: string; network_id: string; status_json: string | null; last_seen_at: number; role: Role }>();
}

const loadRow = (env: Env, installId: string) => env.DB.prepare(
  `SELECT c.*, u.name AS updated_by_name FROM install_configs c LEFT JOIN users u ON u.id = c.updated_by WHERE c.install_id = ?`,
).bind(installId).first<ConfigRow>();

const SaveBody = z.object({
  values: z.record(z.string(), z.unknown()),
  secrets: z.record(z.string(), z.string()).default({}),
  apply_to: z.enum(["server", "network"]).default("server"),
}).strict();

/** Stores the next desired version for one install. Pending, not yet applied secrets are carried over. */
async function saveFor(env: Env, installId: string, userId: string, values: Record<string, unknown>, secrets: Record<string, string>, now: number) {
  const row = await loadRow(env, installId);
  const status = await env.DB.prepare("SELECT status_json FROM installs WHERE id = ?").bind(installId).first<{ status_json: string | null }>();
  const reported = status?.status_json ? ((JSON.parse(status.status_json) as Status).config_version ?? 0) : 0;
  const version = Math.max(row?.version ?? 0, reported) + 1;
  const pendingSecrets = row?.secrets_enc ? await openSecrets(env, row.secrets_enc) : {};
  const allSecrets = { ...pendingSecrets, ...secrets };
  const previousManaged: string[] = row && !row.reset ? JSON.parse(row.secret_paths_json) : [];
  const secretPaths = [...new Set([...previousManaged, ...Object.keys(allSecrets)])];
  // Secrets the plugin already holds and that were not re-entered now.
  const keep = previousManaged.filter((p) => !(p in allSecrets));
  await env.DB.prepare(
    `INSERT INTO install_configs (install_id, version, reset, values_json, secret_paths_json, keep_secrets_json, secrets_enc, updated_by, updated_at)
     VALUES (?1, ?2, 0, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(install_id) DO UPDATE SET version = excluded.version, reset = 0, values_json = excluded.values_json,
       secret_paths_json = excluded.secret_paths_json, keep_secrets_json = excluded.keep_secrets_json, secrets_enc = excluded.secrets_enc,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at, error_version = NULL, error_message = NULL`,
  ).bind(installId, version, JSON.stringify(values), JSON.stringify(secretPaths), JSON.stringify(keep),
    Object.keys(allSecrets).length ? await sealSecrets(env, allSecrets) : null, userId, now).run();
  return version;
}

export function registerSettings(app: Hono<AppEnv>) {
  app.get("/installs/:id/config", async (c) => {
    const env = c.env;
    const access = await installAccess(env, c.req.param("id"), c.get("user").id);
    if (!access) return c.json({ error: "not_found" }, 404);
    const now = Date.now();
    // Someone is looking at settings: let this network's servers sync faster for a while (one write per minute at most).
    await env.DB.prepare("UPDATE networks SET watched_until = ? WHERE id = ? AND watched_until < ?")
      .bind(now + WATCH_WINDOW, access.network_id, now + WATCH_WINDOW - 60_000).run();
    const status = access.status_json ? (JSON.parse(access.status_json) as Status) : null;
    const row = await loadRow(env, access.id);
    const appliedVersion = Math.max(row?.applied_version ?? 0, status?.config_version ?? 0);
    return c.json({
      role: access.role,
      online: now - access.last_seen_at < 20 * 60_000,
      last_seen_at: access.last_seen_at,
      effective: status?.config ?? null,
      managed: status?.managed ?? [],
      mode: status?.mode ?? null,
      applied_version: appliedVersion,
      desired: row ? {
        version: row.version, reset: row.reset === 1, values: JSON.parse(row.values_json), secret_paths: JSON.parse(row.secret_paths_json),
        updated_at: row.updated_at, updated_by: row.updated_by_name,
      } : null,
      pending: Boolean(row && row.version > appliedVersion && row.error_version !== row.version),
      error: row && row.error_version === row.version ? { version: row.version, message: row.error_message } : null,
      fields: CONFIG_FIELDS,
    });
  });

  app.put("/installs/:id/config", async (c) => {
    const env = c.env;
    const user = c.get("user");
    const access = await installAccess(env, c.req.param("id"), user.id);
    if (!access) return c.json({ error: "not_found" }, 404);
    if (access.role === "viewer") return c.json({ error: "forbidden" }, 403);
    const body = SaveBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad_request" }, 400);
    const { values, secrets, apply_to } = body.data;
    if (Object.keys(values).some((p) => (SECRET_PATHS as string[]).includes(p))) return c.json({ error: "bad_request", message: "secrets go in `secrets`" }, 400);
    const parsed = ConfigValues.safeParse(values);
    if (!parsed.success) return c.json({ error: "invalid_settings", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 422);
    for (const [path, value] of Object.entries(secrets)) {
      if (!isConfigPath(path) || !(SECRET_PATHS as string[]).includes(path) || !fieldSchema(path as ConfigPath).safeParse(value).success) {
        return c.json({ error: "invalid_settings", issues: [{ path, message: "invalid value" }] }, 422);
      }
    }
    const now = Date.now();
    const targets = apply_to === "network"
      ? (await env.DB.prepare("SELECT id FROM installs WHERE network_id = ?").bind(access.network_id).all<{ id: string }>()).results.map((r) => r.id)
      : [access.id];
    const versions: Record<string, number> = {};
    for (const id of targets) versions[id] = await saveFor(env, id, user.id, values, secrets, now);
    await env.DB.batch([
      env.DB.prepare("UPDATE networks SET watched_until = ? WHERE id = ?").bind(now + WATCH_WINDOW, access.network_id),
      env.DB.prepare("INSERT INTO audit_log (network_id, user_id, action, detail_json, at) VALUES (?, ?, 'config.saved', ?, ?)")
        // Only which settings changed are logged, never their secret values.
        .bind(access.network_id, user.id, JSON.stringify({ installs: targets, paths: [...Object.keys(values), ...Object.keys(secrets)] }), now),
    ]);
    return c.json({ versions });
  });

  app.post("/installs/:id/config/reset", async (c) => {
    const env = c.env;
    const user = c.get("user");
    const access = await installAccess(env, c.req.param("id"), user.id);
    if (!access) return c.json({ error: "not_found" }, 404);
    if (access.role === "viewer") return c.json({ error: "forbidden" }, 403);
    const now = Date.now();
    const row = await loadRow(env, access.id);
    const reported = access.status_json ? ((JSON.parse(access.status_json) as Status).config_version ?? 0) : 0;
    const version = Math.max(row?.version ?? 0, reported) + 1;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO install_configs (install_id, version, reset, values_json, secret_paths_json, keep_secrets_json, secrets_enc, updated_by, updated_at)
         VALUES (?1, ?2, 1, '{}', '[]', '[]', NULL, ?3, ?4)
         ON CONFLICT(install_id) DO UPDATE SET version = excluded.version, reset = 1, values_json = '{}', secret_paths_json = '[]',
           keep_secrets_json = '[]', secrets_enc = NULL, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
           error_version = NULL, error_message = NULL`,
      ).bind(access.id, version, user.id, now),
      env.DB.prepare("UPDATE networks SET watched_until = ? WHERE id = ?").bind(now + WATCH_WINDOW, access.network_id),
      env.DB.prepare("INSERT INTO audit_log (network_id, user_id, action, detail_json, at) VALUES (?, ?, 'config.reset', ?, ?)")
        .bind(access.network_id, user.id, JSON.stringify({ install_id: access.id }), now),
    ]);
    return c.json({ version });
  });
}
