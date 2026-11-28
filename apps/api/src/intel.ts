// Player Intelligence (Intel Cloud). The plugin's /v1/intel/* calls and the dashboard's intel routes are checked here
// (install secret, link, membership) and handed to Intel Cloud, a separate Worker, through the INTEL Service Binding.
// Intel Cloud itself checks the agreement version and the network's choice about contributing.
import { Hono, type Context } from "hono";
import { z } from "zod";
import { INTEL_MAX_BODY_BYTES, type IntelErrorResponse } from "@cg/protocol/intel";
import { audit, canManage, roleIn } from "./access.ts";
import { capture } from "./analytics.ts";
import type { AppEnv, Env, IntelResult } from "./env.ts";
import { authenticate } from "./plugin.ts";
import { newId, readBody, sha256Hex } from "./util.ts";

type Ctx = Context<AppEnv>;
const UUID = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

function fail(c: Ctx, status: number, error: IntelErrorResponse["error"], retryIn: number | null = null) {
  if (retryIn) c.header("retry-after", String(retryIn));
  return c.json({ error, retry_in: retryIn } satisfies IntelErrorResponse, status as 400);
}
const relay = (c: Ctx, r: IntelResult) => {
  const retry = (r.body as { retry_in?: unknown } | null)?.retry_in;
  if (r.status >= 400 && typeof retry === "number") c.header("retry-after", String(retry));
  return c.json(r.body as object, r.status as 200);
};

// ---- plugin -----------------------------------------------------------------------

export const intelPlugin = new Hono<AppEnv>();

async function pluginCall(c: Ctx, call: "lookup" | "contribute") {
  const env = c.env;
  const install = await authenticate(env, c.req.header("authorization"));
  if (!install) return fail(c, 401, "unauthorized");
  // Player Intelligence is for linked servers only; an unlinked server never sends a UUID anywhere.
  if (!install.network_id) return fail(c, 403, "not_linked", 3600);
  if (!env.INTEL) return fail(c, 503, "intel_unavailable", 86_400);
  if (env.ENVIRONMENT === "production" && env.INTEL_LIMITER && !(await env.INTEL_LIMITER.limit({ key: `intel:${install.id}` })).success) {
    return fail(c, 429, "rate_limited", 30);
  }
  const raw = await readBody(c.req.raw, INTEL_MAX_BODY_BYTES);
  if (raw === null) return fail(c, 413, "payload_too_large");
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return fail(c, 400, "bad_request"); }
  try {
    return relay(c, await env.INTEL[call]({ network_id: install.network_id, install_id: install.id }, json));
  } catch (e) {
    console.error("intel", call, String(e));
    return fail(c, 503, "intel_unavailable", 60);
  }
}

intelPlugin.post("/v1/intel/lookup", (c) => pluginCall(c, "lookup"));
intelPlugin.post("/v1/intel/contributions", (c) => pluginCall(c, "contribute"));

// ---- dashboard ----------------------------------------------------------------------

/** Network keys for the Intel Cloud API: cgk_ + 40 characters, shown once. */
export const newNetworkKey = () => newId("cgk", 40);

interface KeyRow { id: string; name: string; hint: string; created_at: number; revoked_at: number | null; created_by_name: string | null }

export function registerIntel(app: Hono<AppEnv>) {
  /** Settings, keys and what Intel Cloud offers, for the network's Player Intelligence page. */
  app.get("/networks/:id/intel", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    const role = await roleIn(env, id, c.get("user").id);
    if (!role) return c.json({ error: "not_found" }, 404);
    const info = env.INTEL ? await env.INTEL.info().catch(() => null) : null;
    const [setting, keys, accepted] = await Promise.all([
      env.DB.prepare("SELECT contribute FROM network_intel WHERE network_id = ?").bind(id).first<{ contribute: number }>(),
      canManage(role) ? env.DB.prepare(
        `SELECT k.id, k.name, k.hint, k.created_at, k.revoked_at, u.name AS created_by_name FROM network_api_keys k
         LEFT JOIN users u ON u.id = k.created_by WHERE k.network_id = ? ORDER BY k.created_at DESC LIMIT 50`,
      ).bind(id).all<KeyRow>().then((r) => r.results) : Promise.resolve([] as KeyRow[]),
      info?.agreement_version ? env.DB.prepare("SELECT 1 FROM dpa_acceptances WHERE network_id = ? AND version >= ? LIMIT 1")
        .bind(id, info.agreement_version).first().then(Boolean) : Promise.resolve(false),
    ]);
    return c.json({
      available: info !== null,
      offered: info?.offered ?? false,
      agreement_version: info?.agreement_version ?? null,
      agreement_accepted: accepted,
      contribute: setting ? setting.contribute === 1 : true,
      accept_kinds: info?.accept_kinds ?? [],
      sources: info?.sources ?? [],
      can_manage: canManage(role),
      keys: keys.map((k) => ({ ...k, revoked: k.revoked_at !== null })),
    });
  });

  app.put("/networks/:id/intel", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    const user = c.get("user");
    if (!canManage(await roleIn(env, id, user.id))) return c.json({ error: "forbidden" }, 403);
    const body = z.object({ contribute: z.boolean() }).strict().safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad_request" }, 400);
    await env.DB.prepare(
      `INSERT INTO network_intel (network_id, contribute, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(network_id) DO UPDATE SET contribute = excluded.contribute, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).bind(id, body.data.contribute ? 1 : 0, user.id, Date.now()).run();
    await audit(env, id, user.id, "intel.contribute", { contribute: body.data.contribute });
    capture(c, { event: "intel_contribute_changed", distinct_id: user.id, groups: { network: id }, properties: { contribute: body.data.contribute } });
    return c.json({ ok: true });
  });

  app.post("/networks/:id/intel/keys", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    const user = c.get("user");
    if (!canManage(await roleIn(env, id, user.id))) return c.json({ error: "forbidden" }, 403);
    const body = z.object({ name: z.string().trim().min(1).max(48) }).strict().safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad_request" }, 400);
    const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM network_api_keys WHERE network_id = ? AND revoked_at IS NULL").bind(id).first<number>("n");
    if ((active ?? 0) >= 10) return c.json({ error: "too_many_keys" }, 409);
    const key = newNetworkKey();
    const keyId = newId("key");
    await env.DB.prepare("INSERT INTO network_api_keys (id, key_hash, network_id, name, hint, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(keyId, await sha256Hex(key), id, body.data.name, key.slice(-4), user.id, Date.now()).run();
    await audit(env, id, user.id, "intel.key_created", { key_id: keyId, name: body.data.name });
    capture(c, { event: "intel_key_created", distinct_id: user.id, groups: { network: id } });
    // Shown exactly once; only the hash is stored.
    return c.json({ id: keyId, key }, 201);
  });

  app.delete("/networks/:id/intel/keys/:keyId", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    const user = c.get("user");
    if (!canManage(await roleIn(env, id, user.id))) return c.json({ error: "forbidden" }, 403);
    const res = await env.DB.prepare("UPDATE network_api_keys SET revoked_at = ? WHERE id = ? AND network_id = ? AND revoked_at IS NULL")
      .bind(Date.now(), c.req.param("keyId"), id).run();
    if (!res.meta.changes) return c.json({ error: "not_found" }, 404);
    await audit(env, id, user.id, "intel.key_revoked", { key_id: c.req.param("keyId") });
    return c.json({ ok: true });
  });

  /** A full report on one player, for any member of the network. */
  app.get("/networks/:id/players/:uuid/intel", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    if (!(await roleIn(env, id, c.get("user").id))) return c.json({ error: "not_found" }, 404);
    if (!UUID.test(c.req.param("uuid"))) return c.json({ error: "bad_request" }, 400);
    if (!env.INTEL) return fail(c, 503, "intel_unavailable", null);
    try {
      return relay(c, await env.INTEL.report({ network_id: id }, c.req.param("uuid"), undefined, "full"));
    } catch (e) {
      console.error("intel report", String(e));
      return fail(c, 503, "intel_unavailable", 60);
    }
  });
}

/** Tells Intel Cloud right away; its daily purge catches anything missed. */
export function forgetInIntel(env: Env, ctx: { waitUntil(p: Promise<unknown>): void } | undefined, kind: "network" | "install", id: string) {
  if (!env.INTEL || !ctx) return;
  const call = kind === "network" ? env.INTEL.forgetNetwork(id) : env.INTEL.forgetInstall(id);
  ctx.waitUntil(call.catch((e) => console.warn("intel forget", kind, String(e))));
}
