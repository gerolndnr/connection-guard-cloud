// AES-GCM for API keys and webhook URLs between "saved in the dashboard" and "applied by the plugin".
import type { Env } from "./env.ts";

// Fixed key for local development and tests only; production refuses to run without CONFIG_SECRET_KEY.
const DEV_KEY = "Y29ubmVjdGlvbi1ndWFyZC1sb2NhbC1kZXYta2V5ISE=";

async function key(env: Env): Promise<CryptoKey> {
  const raw = env.CONFIG_SECRET_KEY ?? (env.ENVIRONMENT === "production" ? null : DEV_KEY);
  if (!raw) throw new Error("CONFIG_SECRET_KEY is not configured");
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("CONFIG_SECRET_KEY must be 32 bytes, base64");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealSecrets(env: Env, secrets: Record<string, string>): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(secrets));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env), data));
  const out = new Uint8Array(12 + sealed.length);
  out.set(iv); out.set(sealed, 12);
  return out;
}

export async function openSecrets(env: Env, blob: ArrayBuffer | Uint8Array | number[]): Promise<Record<string, string>> {
  const bytes = Array.isArray(blob) ? new Uint8Array(blob) : new Uint8Array(blob);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await key(env), bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>;
}
