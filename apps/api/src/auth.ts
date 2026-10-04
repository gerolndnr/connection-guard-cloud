// Discord OAuth login and cookie sessions for the dashboard.
import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv, Env, SessionUser } from "./env.ts";
import { DAY, newId, sha256Hex } from "./util.ts";

export const SESSION_COOKIE = "cg_session";
const STATE_COOKIE = "cg_oauth_state";
const SESSION_TTL = 30 * DAY;

const secure = (env: Env) => env.APP_ORIGIN.startsWith("https://");

/** Only same-site relative paths are allowed as post-login targets. */
export function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next.slice(0, 256);
}

export async function createSession(env: Env, userId: string, now = Date.now()): Promise<string> {
  const token = newId("ses", 40);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL).run();
  return token;
}

export async function sessionUser(env: Env, token: string | undefined): Promise<SessionUser | null> {
  if (!token || !/^ses_[A-Za-z0-9]{40}$/.test(token)) return null;
  return env.DB.prepare(
    "SELECT u.id, u.name, u.avatar FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
  ).bind(await sha256Hex(token), Date.now()).first<SessionUser>();
}

export async function upsertUser(env: Env, discordId: string, name: string, avatar: string | null): Promise<string> {
  const existing = await env.DB.prepare("SELECT id FROM users WHERE discord_id = ?").bind(discordId).first<{ id: string }>();
  if (existing) {
    await env.DB.prepare("UPDATE users SET name = ?, avatar = ? WHERE id = ?").bind(name, avatar, existing.id).run();
    return existing.id;
  }
  const id = newId("usr");
  await env.DB.prepare("INSERT INTO users (id, discord_id, name, avatar, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, discordId, name, avatar, Date.now()).run();
  return id;
}

function startSession(c: Parameters<MiddlewareHandler<AppEnv>>[0], token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, secure: secure(c.env), sameSite: "Lax", path: "/", maxAge: SESSION_TTL / 1000,
  });
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await sessionUser(c.env, getCookie(c, SESSION_COOKIE));
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
};

/** State-changing dashboard requests must come from our own origin as JSON. */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("origin");
    if (origin !== c.env.APP_ORIGIN) return c.json({ error: "forbidden" }, 403);
    if (!(c.req.header("content-type") ?? "").startsWith("application/json")) return c.json({ error: "bad_request" }, 400);
  }
  await next();
};

export const auth = new Hono<AppEnv>();

auth.get("/discord/start", (c) => {
  const env = c.env;
  if (!env.DISCORD_CLIENT_ID) return c.json({ error: "discord_not_configured" }, 503);
  const state = newId("st", 32);
  const next = safeNext(c.req.query("next"));
  setCookie(c, STATE_COOKIE, `${state}|${next}`, {
    httpOnly: true, secure: secure(env), sameSite: "Lax", path: "/api/auth", maxAge: 600,
  });
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("redirect_uri", `${env.APP_ORIGIN}/api/auth/discord/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "none");
  return c.redirect(url.toString(), 302);
});

auth.get("/discord/callback", async (c) => {
  const env = c.env;
  const [expected, next] = (getCookie(c, STATE_COOKIE) ?? "").split("|");
  deleteCookie(c, STATE_COOKIE, { path: "/api/auth" });
  const code = c.req.query("code");
  if (!expected || c.req.query("state") !== expected || !code || !env.DISCORD_CLIENT_SECRET) {
    return c.redirect("/?login=failed", 302);
  }
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code",
      code, redirect_uri: `${env.APP_ORIGIN}/api/auth/discord/callback`,
    }),
  });
  if (!tokenRes.ok) return c.redirect("/?login=failed", 302);
  const { access_token } = await tokenRes.json<{ access_token: string }>();
  const meRes = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${access_token}` } });
  if (!meRes.ok) return c.redirect("/?login=failed", 302);
  const me = await meRes.json<{ id: string; username: string; global_name?: string | null; avatar?: string | null }>();
  // We keep only what the dashboard shows. The Discord access token is discarded.
  const avatar = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null;
  const userId = await upsertUser(env, me.id, (me.global_name || me.username).slice(0, 64), avatar);
  startSession(c, await createSession(env, userId));
  return c.redirect(safeNext(next), 302);
});

// Local development and end-to-end tests only. Refuses to run anywhere else.
auth.post("/dev-login", async (c) => {
  if (c.env.ENVIRONMENT === "production" || !c.env.APP_ORIGIN.startsWith("http://localhost")) {
    return c.json({ error: "not_found" }, 404);
  }
  const body = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
  const name = (body.name ?? "Dev Operator").slice(0, 64);
  const userId = await upsertUser(c.env, `dev-${name}`, name, null);
  startSession(c, await createSession(c.env, userId));
  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
