// Network tools for the dashboard: access rules, team and invites, Discord alerts, activity, deletion.
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "./env.ts";
import { audit, canManage, roleIn, type Role } from "./access.ts";
import { capture } from "./analytics.ts";
import { COLOR, isDiscordWebhook, postWebhook, webhookHint } from "./discord.ts";
import { openSecrets, sealSecrets } from "./secrets.ts";
import { namesFor } from "./players.ts";
import { DAY, newId, sha256Hex } from "./util.ts";

type C = Context<AppEnv>;
const INVITE_TTL = 7 * DAY;
const WATCH_WINDOW = 10 * 60_000;
export const ALERT_KINDS = ["server_offline", "provider_trouble", "quota_low", "refusal_spike", "weekly_digest"] as const;

// ---- access rules ------------------------------------------------------------

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?:\/(?:3[0-2]|[12]?\d))?$/;
const IPV6 = /^[0-9a-fA-F:]{2,39}(?:\/(?:12[0-8]|1[01]\d|\d?\d))?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASN = /^ASN:[1-9]\d{0,9}$/;

/** The rule targets the dashboard offers: an address or range, a verified player UUID, or a provider network. */
export function ruleTarget(raw: string): string | null {
  const t = raw.trim();
  if (IPV4.test(t) || (t.includes(":") && !t.startsWith("ASN") && IPV6.test(t))) return t.toLowerCase();
  if (UUID.test(t)) return t.toLowerCase();
  const asn = t.toUpperCase().replace(/^AS(?=\d)/, "ASN:");
  if (ASN.test(asn)) return asn;
  return null;
}

const RuleBody = z.object({
  effect: z.enum(["ALLOW", "DENY", "EXEMPT"]),
  scope: z.enum(["VPN", "GEO", "ALL"]),
  target: z.string().min(2).max(64),
  note: z.string().trim().max(100).nullable().optional(),
});

async function claimedInstalls(env: Env, networkId: string) {
  return (await env.DB.prepare("SELECT id FROM installs WHERE network_id = ?").bind(networkId).all<{ id: string }>()).results.map((r) => r.id);
}

function commandStatements(env: Env, installs: string[], payload: Record<string, unknown>, userId: string | null, ruleId: string | null, now: number) {
  return installs.map((installId) => env.DB.prepare(
    "INSERT INTO commands (id, install_id, created_by, payload_json, created_at, rule_id) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(newId("cmd"), installId, userId, JSON.stringify(payload), now, ruleId));
}

/** Rules added before a server joined the network are sent to it when it joins. */
export async function rulesForNewInstall(env: Env, networkId: string, installId: string, now: number) {
  const rules = (await env.DB.prepare("SELECT id, effect, scope, target, note FROM access_rules WHERE network_id = ? AND removed_at IS NULL")
    .bind(networkId).all<{ id: string; effect: string; scope: string; target: string; note: string | null }>()).results;
  return rules.flatMap((r) => commandStatements(env, [installId], { type: "access_rule.add", effect: r.effect, scope: r.scope, target: r.target, note: r.note }, null, r.id, now));
}

// ---- deletion ------------------------------------------------------------------

/** Statements that remove a network: its servers become unlinked (anonymous) again, everything else goes. */
async function deleteNetworkStatements(env: Env, networkId: string) {
  const installs = await claimedInstalls(env, networkId);
  return [
    ...installs.flatMap((id) => [
      env.DB.prepare("DELETE FROM commands WHERE install_id = ?").bind(id),
      env.DB.prepare("DELETE FROM install_configs WHERE install_id = ?").bind(id),
    ]),
    env.DB.prepare("UPDATE installs SET network_id = NULL, claimed_at = NULL, display_name = NULL WHERE network_id = ?").bind(networkId),
    // Cascades: memberships, DPA acceptances, tokens, events, audit log, rules, invites, alerts.
    env.DB.prepare("DELETE FROM networks WHERE id = ?").bind(networkId),
  ];
}

// ---- alerts --------------------------------------------------------------------

async function alertSettings(env: Env, networkId: string) {
  return env.DB.prepare("SELECT webhook_enc, webhook_hint, kinds_json FROM alert_settings WHERE network_id = ?")
    .bind(networkId).first<{ webhook_enc: ArrayBuffer | number[] | null; webhook_hint: string | null; kinds_json: string }>();
}

export async function webhookFor(env: Env, enc: ArrayBuffer | number[] | null): Promise<string | null> {
  if (!enc) return null;
  try { return (await openSecrets(env, enc)).url ?? null; } catch { return null; }
}

// ---- routes --------------------------------------------------------------------

async function memberOr404(c: C, networkId: string, need: "member" | "manage" | "owner") {
  const role = await roleIn(c.env, networkId, c.get("user").id);
  const ok = need === "member" ? role !== null : need === "manage" ? canManage(role) : role === "owner";
  return ok ? role! : null;
}

export function registerNetwork(app: Hono<AppEnv>) {
  // Rules -----------------------------------------------------------------------
  app.get("/networks/:id/rules", async (c) => {
    const id = c.req.param("id");
    if (!(await memberOr404(c, id, "member"))) return c.json({ error: "not_found" }, 404);
    const rules = (await c.env.DB.prepare(
      `SELECT r.id, r.effect, r.scope, r.target, r.note, r.created_at, u.name AS created_by_name FROM access_rules r
       LEFT JOIN users u ON u.id = r.created_by WHERE r.network_id = ? AND r.removed_at IS NULL ORDER BY r.created_at DESC`,
    ).bind(id).all<{ id: string; effect: string; scope: string; target: string; note: string | null; created_at: number; created_by_name: string | null }>()).results;
    const commands = rules.length ? (await c.env.DB.prepare(
      `SELECT rule_id, install_id, delivered_at, completed_at, result_ok, result_message FROM commands
       WHERE rule_id IN (${rules.map(() => "?").join(",")}) ORDER BY created_at`,
    ).bind(...rules.map((r) => r.id)).all<{ rule_id: string; install_id: string; delivered_at: number | null; completed_at: number | null; result_ok: number | null; result_message: string | null }>()).results : [];
    return c.json({
      rules: rules.map((r) => ({
        ...r,
        servers: commands.filter((x) => x.rule_id === r.id).map((x) => ({
          install_id: x.install_id,
          state: x.completed_at ? (x.result_ok ? "applied" : "failed") : x.delivered_at ? "delivered" : "pending",
          message: x.result_ok === 0 ? x.result_message : null,
        })),
      })),
    });
  });

  app.post("/networks/:id/rules", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    const user = c.get("user");
    if (!(await memberOr404(c, id, "manage"))) return c.json({ error: "forbidden" }, 403);
    const body = RuleBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad_request" }, 400);
    const target = ruleTarget(body.data.target);
    if (!target) return c.json({ error: "invalid_target", message: "Use an IP address or range, a player UUID or an ASN like AS3320." }, 422);
    const existing = await env.DB.prepare("SELECT id FROM access_rules WHERE network_id = ? AND target = ? AND effect = ? AND scope = ? AND removed_at IS NULL")
      .bind(id, target, body.data.effect, body.data.scope).first<{ id: string }>();
    if (existing) return c.json({ id: existing.id, duplicate: true });
    const now = Date.now();
    const ruleId = newId("rul");
    const installs = await claimedInstalls(env, id);
    const note = body.data.note || null;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO access_rules (id, network_id, effect, scope, target, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(ruleId, id, body.data.effect, body.data.scope, target, note, user.id, now),
      ...commandStatements(env, installs, { type: "access_rule.add", effect: body.data.effect, scope: body.data.scope, target, note }, user.id, ruleId, now),
      env.DB.prepare("UPDATE networks SET watched_until = ? WHERE id = ?").bind(now + WATCH_WINDOW, id),
      env.DB.prepare("INSERT INTO audit_log (network_id, user_id, action, detail_json, at) VALUES (?, ?, 'rule.added', ?, ?)")
        .bind(id, user.id, JSON.stringify({ rule_id: ruleId, effect: body.data.effect, scope: body.data.scope }), now),
    ]);
    const kind = target.startsWith("asn:") || target.startsWith("ASN:") ? "asn" : UUID.test(target) ? "player" : target.includes("/") ? "range" : "ip";
    capture(c, { event: "rule_added", distinct_id: user.id, groups: { network: id }, properties: { effect: body.data.effect, scope: body.data.scope, kind, servers: installs.length } });
    return c.json({ id: ruleId, servers: installs.length }, 201);
  });

  app.delete("/networks/:id/rules/:ruleId", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    const user = c.get("user");
    if (!(await memberOr404(c, id, "manage"))) return c.json({ error: "forbidden" }, 403);
    const rule = await env.DB.prepare("SELECT effect, target FROM access_rules WHERE id = ? AND network_id = ? AND removed_at IS NULL")
      .bind(c.req.param("ruleId"), id).first<{ effect: string; target: string }>();
    if (!rule) return c.json({ error: "not_found" }, 404);
    const now = Date.now();
    const installs = await claimedInstalls(env, id);
    await env.DB.batch([
      env.DB.prepare("UPDATE access_rules SET removed_at = ? WHERE id = ?").bind(now, c.req.param("ruleId")),
      // Commands that never reached a server are dropped; servers that applied the rule get a removal.
      env.DB.prepare("DELETE FROM commands WHERE rule_id = ? AND delivered_at IS NULL").bind(c.req.param("ruleId")),
      ...commandStatements(env, installs, { type: "access_rule.remove", effect: rule.effect, target: rule.target }, user.id, null, now),
      env.DB.prepare("UPDATE networks SET watched_until = ? WHERE id = ?").bind(now + WATCH_WINDOW, id),
      env.DB.prepare("INSERT INTO audit_log (network_id, user_id, action, detail_json, at) VALUES (?, ?, 'rule.removed', ?, ?)")
        .bind(id, user.id, JSON.stringify({ rule_id: c.req.param("ruleId") }), now),
    ]);
    capture(c, { event: "rule_removed", distinct_id: user.id, groups: { network: id } });
    return c.json({ ok: true });
  });

  app.post("/networks/:id/recheck", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    const user = c.get("user");
    if (!(await memberOr404(c, id, "manage"))) return c.json({ error: "forbidden" }, 403);
    const parsed = z.object({ ip: z.string().regex(/^[0-9a-fA-F:.]{2,45}$/) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const now = Date.now();
    const installs = await claimedInstalls(env, id);
    await env.DB.batch([
      ...commandStatements(env, installs, { type: "cache.clear", ip: parsed.data.ip }, user.id, null, now),
      env.DB.prepare("UPDATE networks SET watched_until = ? WHERE id = ?").bind(now + WATCH_WINDOW, id),
    ]);
    await audit(env, id, user.id, "cache.cleared", {});
    capture(c, { event: "recheck_requested", distinct_id: user.id, groups: { network: id } });
    return c.json({ ok: true, servers: installs.length });
  });

  // Players: Mojang names for UUIDs shown in the dashboard ---------------------------
  app.get("/players", async (c) => {
    const uuids = (c.req.query("uuids") ?? "").split(",").filter(Boolean).slice(0, 40);
    return c.json({ names: c.env.ENVIRONMENT === "test" ? {} : await namesFor(uuids) });
  });

  // Team ------------------------------------------------------------------------------
  app.get("/networks/:id/members", async (c) => {
    const id = c.req.param("id");
    if (!(await memberOr404(c, id, "member"))) return c.json({ error: "not_found" }, 404);
    const members = (await c.env.DB.prepare(
      "SELECT u.id, u.name, u.avatar, m.role, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.network_id = ? ORDER BY m.created_at",
    ).bind(id).all<{ id: string; name: string; avatar: string | null; role: Role; created_at: number }>()).results;
    return c.json({ members: members.map((m) => ({ ...m, you: m.id === c.get("user").id })) });
  });

  app.patch("/networks/:id/members/:userId", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    if (!(await memberOr404(c, id, "owner"))) return c.json({ error: "forbidden" }, 403);
    const parsed = z.object({ role: z.enum(["owner", "admin", "viewer"]) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const target = c.req.param("userId");
    const current = await roleIn(env, id, target);
    if (!current) return c.json({ error: "not_found" }, 404);
    if (current === "owner" && parsed.data.role !== "owner" && (await ownerCount(env, id)) < 2) return c.json({ error: "last_owner" }, 409);
    await env.DB.prepare("UPDATE memberships SET role = ? WHERE network_id = ? AND user_id = ?").bind(parsed.data.role, id, target).run();
    await audit(env, id, c.get("user").id, "member.role", { user_id: target, role: parsed.data.role });
    return c.json({ ok: true });
  });

  app.delete("/networks/:id/members/:userId", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    const me = c.get("user").id;
    const target = c.req.param("userId");
    const role = await roleIn(env, id, me);
    if (!role || (target !== me && role !== "owner")) return c.json({ error: "forbidden" }, 403);
    const current = await roleIn(env, id, target);
    if (!current) return c.json({ error: "not_found" }, 404);
    if (current === "owner" && (await ownerCount(env, id)) < 2) return c.json({ error: "last_owner" }, 409);
    await env.DB.prepare("DELETE FROM memberships WHERE network_id = ? AND user_id = ?").bind(id, target).run();
    await audit(env, id, me, target === me ? "member.left" : "member.removed", { user_id: target });
    return c.json({ ok: true });
  });

  app.get("/networks/:id/invites", async (c) => {
    const id = c.req.param("id");
    if (!(await memberOr404(c, id, "manage"))) return c.json({ error: "forbidden" }, 403);
    const invites = (await c.env.DB.prepare(
      "SELECT i.id, i.role, i.created_at, i.expires_at, u.name AS created_by_name FROM invites i LEFT JOIN users u ON u.id = i.created_by WHERE i.network_id = ? AND i.used_at IS NULL AND i.expires_at > ? ORDER BY i.created_at DESC",
    ).bind(id, Date.now()).all()).results;
    return c.json({ invites });
  });

  app.post("/networks/:id/invites", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    const user = c.get("user");
    const role = await memberOr404(c, id, "manage");
    if (!role) return c.json({ error: "forbidden" }, 403);
    const parsed = z.object({ role: z.enum(["admin", "viewer"]) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    if (parsed.data.role === "admin" && role !== "owner") return c.json({ error: "forbidden" }, 403);
    const token = `cgi_${newId("x", 32).slice(2)}`;
    const now = Date.now();
    const inviteId = newId("inv");
    await env.DB.prepare("INSERT INTO invites (id, token_hash, network_id, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(inviteId, await sha256Hex(token), id, parsed.data.role, user.id, now, now + INVITE_TTL).run();
    await audit(env, id, user.id, "invite.created", { invite_id: inviteId, role: parsed.data.role });
    capture(c, { event: "invite_created", distinct_id: user.id, groups: { network: id }, properties: { role: parsed.data.role } });
    // Shown exactly once; only the hash is stored.
    return c.json({ id: inviteId, url: `${env.APP_ORIGIN}/invite/${token}`, expires_at: now + INVITE_TTL }, 201);
  });

  app.delete("/networks/:id/invites/:inviteId", async (c) => {
    const id = c.req.param("id");
    if (!(await memberOr404(c, id, "manage"))) return c.json({ error: "forbidden" }, 403);
    await c.env.DB.prepare("DELETE FROM invites WHERE id = ? AND network_id = ? AND used_at IS NULL").bind(c.req.param("inviteId"), id).run();
    return c.json({ ok: true });
  });

  app.get("/invites/:token", async (c) => {
    const invite = await findInvite(c.env, c.req.param("token"));
    if (!invite) return c.json({ error: "unknown_invite" }, 404);
    const member = await roleIn(c.env, invite.network_id, c.get("user").id);
    return c.json({ network_name: invite.network_name, role: invite.role, invited_by: invite.created_by_name, expires_at: invite.expires_at, member: member !== null, network_id: invite.network_id });
  });

  app.post("/invites/:token/accept", async (c) => {
    const env = c.env;
    const user = c.get("user");
    const parsed = z.object({ accept_terms: z.literal(true), terms_version: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    if (parsed.data.terms_version !== env.DPA_VERSION) return c.json({ error: "dpa_outdated" }, 409);
    const invite = await findInvite(env, c.req.param("token"));
    if (!invite) return c.json({ error: "unknown_invite" }, 404);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO memberships (network_id, user_id, role, created_at) VALUES (?, ?, ?, ?)").bind(invite.network_id, user.id, invite.role, now),
      env.DB.prepare("UPDATE invites SET used_by = ?, used_at = ? WHERE id = ? AND used_at IS NULL").bind(user.id, now, invite.id),
      env.DB.prepare("INSERT INTO audit_log (network_id, user_id, action, detail_json, at) VALUES (?, ?, 'member.joined', ?, ?)")
        .bind(invite.network_id, user.id, JSON.stringify({ role: invite.role, terms_version: env.DPA_VERSION }), now),
    ]);
    capture(c, { event: "invite_accepted", distinct_id: user.id, groups: { network: invite.network_id }, properties: { role: invite.role } });
    return c.json({ network_id: invite.network_id });
  });

  // Alerts ----------------------------------------------------------------------------
  app.get("/networks/:id/alerts", async (c) => {
    const id = c.req.param("id");
    if (!(await memberOr404(c, id, "manage"))) return c.json({ error: "forbidden" }, 403);
    const row = await alertSettings(c.env, id);
    return c.json({ webhook_set: Boolean(row?.webhook_enc), webhook_hint: row?.webhook_hint ?? null, kinds: row ? JSON.parse(row.kinds_json) : [] });
  });

  app.put("/networks/:id/alerts", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    const user = c.get("user");
    if (!(await memberOr404(c, id, "manage"))) return c.json({ error: "forbidden" }, 403);
    const parsed = z.object({
      webhook_url: z.string().trim().max(200).nullable().optional(),
      kinds: z.array(z.enum(ALERT_KINDS)).max(ALERT_KINDS.length),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const { webhook_url, kinds } = parsed.data;
    if (webhook_url && !isDiscordWebhook(webhook_url)) return c.json({ error: "invalid_webhook", message: "Paste a Discord webhook URL (Server settings → Integrations → Webhooks)." }, 422);
    const row = await alertSettings(env, id);
    const enc = webhook_url === undefined ? row?.webhook_enc ?? null : webhook_url ? await sealSecrets(env, { url: webhook_url }) : null;
    const hint = webhook_url === undefined ? row?.webhook_hint ?? null : webhook_url ? webhookHint(webhook_url) : null;
    await env.DB.prepare(
      `INSERT INTO alert_settings (network_id, webhook_enc, webhook_hint, kinds_json, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(network_id) DO UPDATE SET webhook_enc = excluded.webhook_enc, webhook_hint = excluded.webhook_hint,
         kinds_json = excluded.kinds_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).bind(id, enc, hint, JSON.stringify([...new Set(kinds)]), user.id, Date.now()).run();
    await audit(env, id, user.id, "alerts.saved", { kinds, webhook: webhook_url === undefined ? "kept" : webhook_url ? "set" : "removed" });
    capture(c, { event: "alerts_saved", distinct_id: user.id, groups: { network: id }, properties: { kinds, webhook: Boolean(enc) } });
    return c.json({ webhook_set: Boolean(enc), webhook_hint: hint, kinds });
  });

  app.post("/networks/:id/alerts/test", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    if (!(await memberOr404(c, id, "manage"))) return c.json({ error: "forbidden" }, 403);
    const row = await alertSettings(env, id);
    const url = await webhookFor(env, row?.webhook_enc ?? null);
    if (!url) return c.json({ error: "no_webhook" }, 409);
    const network = await env.DB.prepare("SELECT name FROM networks WHERE id = ?").bind(id).first<{ name: string }>();
    const res = await postWebhook(url, [{ title: "Alerts are connected", description: `Connection Guard will post alerts for **${network?.name ?? "your network"}** here.`, color: COLOR.green, url: `${env.APP_ORIGIN}/n/${id}` }]);
    return res.ok ? c.json({ ok: true }) : c.json({ error: "webhook_failed", status: res.status }, 502);
  });

  // Activity --------------------------------------------------------------------------
  app.get("/networks/:id/activity", async (c) => {
    const id = c.req.param("id");
    if (!(await memberOr404(c, id, "manage"))) return c.json({ error: "forbidden" }, 403);
    const rows = (await c.env.DB.prepare(
      "SELECT a.action, a.detail_json, a.at, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.network_id = ? ORDER BY a.at DESC LIMIT 100",
    ).bind(id).all<{ action: string; detail_json: string; at: number; user_name: string | null }>()).results;
    return c.json({ activity: rows.map((r) => ({ action: r.action, at: r.at, user_name: r.user_name, detail: JSON.parse(r.detail_json) })) });
  });

  // Deletion --------------------------------------------------------------------------
  app.delete("/networks/:id", async (c) => {
    const env = c.env;
    const id = c.req.param("id");
    if (!(await memberOr404(c, id, "owner"))) return c.json({ error: "forbidden" }, 403);
    const network = await env.DB.prepare("SELECT name FROM networks WHERE id = ?").bind(id).first<{ name: string }>();
    const parsed = z.object({ confirm: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!network || !parsed.success || parsed.data.confirm.trim() !== network.name) return c.json({ error: "confirm_mismatch" }, 400);
    await env.DB.batch(await deleteNetworkStatements(env, id));
    capture(c, { event: "network_deleted", distinct_id: c.get("user").id, groups: { network: id } });
    return c.json({ ok: true });
  });

  app.delete("/me", async (c) => {
    const env = c.env;
    const user = c.get("user");
    const parsed = z.object({ confirm: z.literal("DELETE") }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "confirm_mismatch" }, 400);
    const owned = (await env.DB.prepare("SELECT network_id FROM memberships WHERE user_id = ? AND role = 'owner'").bind(user.id).all<{ network_id: string }>()).results;
    const statements: D1PreparedStatement[] = [];
    for (const { network_id } of owned) {
      const other = await env.DB.prepare("SELECT user_id FROM memberships WHERE network_id = ? AND role = 'owner' AND user_id != ? LIMIT 1")
        .bind(network_id, user.id).first<{ user_id: string }>();
      if (other) {
        // Another owner keeps the network; records that point at the leaving owner move to them.
        statements.push(
          env.DB.prepare("UPDATE networks SET created_by = ? WHERE id = ? AND created_by = ?").bind(other.user_id, network_id, user.id),
          env.DB.prepare("UPDATE network_tokens SET created_by = ? WHERE network_id = ? AND created_by = ?").bind(other.user_id, network_id, user.id),
        );
      } else {
        statements.push(...(await deleteNetworkStatements(env, network_id)));
      }
    }
    statements.push(
      // Networks this user created but no longer owns (ownership moved earlier) keep existing.
      env.DB.prepare("UPDATE networks SET created_by = (SELECT user_id FROM memberships m WHERE m.network_id = networks.id AND m.role = 'owner' AND m.user_id != ?1 LIMIT 1) WHERE created_by = ?1").bind(user.id),
      env.DB.prepare("UPDATE network_tokens SET created_by = (SELECT created_by FROM networks n WHERE n.id = network_tokens.network_id) WHERE created_by = ?").bind(user.id),
      env.DB.prepare("UPDATE audit_log SET user_id = NULL WHERE user_id = ?").bind(user.id),
      env.DB.prepare("UPDATE commands SET created_by = NULL WHERE created_by = ?").bind(user.id),
      env.DB.prepare("UPDATE install_configs SET updated_by = NULL WHERE updated_by = ?").bind(user.id),
      env.DB.prepare("DELETE FROM dpa_acceptances WHERE user_id = ?").bind(user.id),
      // Cascades: sessions, memberships. SET NULL: rules, invites, alert settings.
      env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
    );
    await env.DB.batch(statements);
    capture(c, { event: "account_deleted", distinct_id: user.id, properties: { networks_deleted: owned.length } });
    return c.json({ ok: true });
  });
}

async function ownerCount(env: Env, networkId: string) {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE network_id = ? AND role = 'owner'").bind(networkId).first<{ n: number }>())?.n ?? 0;
}

async function findInvite(env: Env, token: string) {
  if (!/^cgi_[A-Za-z0-9]{20,40}$/.test(token)) return null;
  return env.DB.prepare(
    `SELECT i.id, i.network_id, i.role, i.expires_at, n.name AS network_name, u.name AS created_by_name FROM invites i
     JOIN networks n ON n.id = i.network_id LEFT JOIN users u ON u.id = i.created_by
     WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ?`,
  ).bind(await sha256Hex(token), Date.now()).first<{ id: string; network_id: string; role: "admin" | "viewer"; expires_at: number; network_name: string; created_by_name: string | null }>();
}
