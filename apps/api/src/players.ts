// Minecraft player names for UUIDs (and UUIDs for names), looked up at Mojang on demand.
// Names are public profile data. They are cached for a day in Cloudflare's edge cache, never stored in D1.
const CACHE_HOST = "https://players.cache.connectionguard.internal";
const DAY_SECONDS = 86_400;

const compact = (uuid: string) => uuid.replace(/-/g, "").toLowerCase();
const dashed = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
export const isUuid = (s: string) => /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(s);
export const isPlayerName = (s: string) => /^[A-Za-z0-9_]{3,16}$/.test(s);

async function cached(key: string, load: () => Promise<string | null>): Promise<string | null> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const req = new Request(`${CACHE_HOST}/${key}`);
  const hit = cache ? await cache.match(req) : undefined;
  if (hit) { const v = await hit.text(); return v || null; }
  const value = await load();
  if (cache) await cache.put(req, new Response(value ?? "", { headers: { "cache-control": `max-age=${DAY_SECONDS}` } }));
  return value;
}

async function mojang(url: string): Promise<{ id?: string; name?: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    if (res.status !== 200) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Only Mojang (online-mode) UUIDs are version 4; offline-mode UUIDs (version 3) have no profile. */
const isOnlineUuid = (uuid: string) => compact(uuid)[12] === "4";

export async function namesFor(uuids: string[]): Promise<Record<string, string | null>> {
  const unique = [...new Set(uuids.filter(isUuid).map((u) => dashed(compact(u))))].slice(0, 40);
  const entries = await Promise.all(unique.map(async (u) => [u, isOnlineUuid(u)
    ? await cached(`n/${compact(u)}`, async () => (await mojang(`https://sessionserver.mojang.com/session/minecraft/profile/${compact(u)}`))?.name ?? null)
    : null] as const));
  return Object.fromEntries(entries);
}

export async function uuidForName(name: string): Promise<string | null> {
  if (!isPlayerName(name)) return null;
  const id = await cached(`u/${name.toLowerCase()}`, async () => (await mojang(`https://api.mojang.com/users/profiles/minecraft/${name}`))?.id ?? null);
  return id ? dashed(compact(id)) : null;
}
