import type { Env } from "./env.ts";

/** Optional bot check on linking. Without a configured secret it is skipped (link codes alone are unguessable in practice). */
export async function verifyTurnstile(env: Env, token: string, ip: string | undefined): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const json = await res.json<{ success: boolean }>();
    return json.success === true;
  } catch {
    return false;
  }
}
