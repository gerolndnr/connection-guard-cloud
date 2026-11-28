// Public Minecraft profile names for UUIDs, looked up at Mojang on demand.
// Names are public profile data. They are cached for a day in Cloudflare's edge cache, never stored in D1.
// Only definite answers are cached: a found profile, or Mojang saying there is none. A rate limit, block or
// timeout is retried on the next request instead of hiding the name for a day.
const CACHE_HOST = "https://players.cache.connectionguard.internal";
const DAY_SECONDS = 86_400;

const compact = (uuid: string) => uuid.replace(/-/g, "").toLowerCase();
const dashed = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
export const isUuid = (s: string) => /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(s);

/** A found value, NONE when Mojang has no such profile, FAILED when it could not tell (never cached). */
const NONE = "";
const FAILED = null;
type Lookup = string | typeof FAILED;

async function cached(key: string, load: () => Promise<Lookup>): Promise<Lookup> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const req = new Request(`${CACHE_HOST}/${key}`);
  const hit = cache ? await cache.match(req) : undefined;
  if (hit) return await hit.text();
  const value = await load();
  if (cache && value !== FAILED) await cache.put(req, new Response(value, { headers: { "cache-control": `max-age=${DAY_SECONDS}` } }));
  return value;
}

/** One profile request. 204/404 mean "no such profile"; anything else that is not a 200 with the field is a failure. */
async function profile(url: string): Promise<Lookup> {
  const host = new URL(url).host;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    if (res.status === 204 || res.status === 404) return NONE;
    if (res.status === 200) {
      const value = ((await res.json()) as Record<string, unknown>).name;
      if (typeof value === "string" && value) return value;
    }
    // Host and status only: never the UUID or name that was asked for.
    console.warn(`player lookup failed: ${host} ${res.status}`);
    return FAILED;
  } catch (err) {
    console.warn(`player lookup failed: ${host} ${err instanceof Error ? err.name : "error"}`);
    return FAILED;
  }
}

/** Ask each Mojang endpoint in turn until one gives a definite answer. */
async function firstDefinite(urls: string[]): Promise<Lookup> {
  for (const url of urls) {
    const value = await profile(url);
    if (value !== FAILED) return value;
  }
  return FAILED;
}

/** Only Mojang (online-mode) UUIDs are version 4; offline-mode UUIDs (version 3) have no profile. */
const isOnlineUuid = (uuid: string) => compact(uuid)[12] === "4";

/**
 * Names by dashed UUID: a name, or null when the player has no Mojang profile.
 * A UUID whose lookup failed is left out, so the dashboard asks again later instead of showing it as nameless.
 */
export async function namesFor(uuids: string[]): Promise<Record<string, string | null>> {
  const unique = [...new Set(uuids.filter(isUuid).map((u) => dashed(compact(u))))].slice(0, 40);
  const entries = await Promise.all(unique.map(async (u): Promise<[string, Lookup]> => {
    if (!isOnlineUuid(u)) return [u, NONE];
    const id = compact(u);
    return [u, await cached(`n/${id}`, () => firstDefinite([
      `https://sessionserver.mojang.com/session/minecraft/profile/${id}`,
      `https://api.minecraftservices.com/minecraft/profile/lookup/${id}`,
    ]))];
  }));
  return Object.fromEntries(entries.filter(([, v]) => v !== FAILED).map(([u, v]) => [u, v || null]));
}
