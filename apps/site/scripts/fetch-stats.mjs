// Fetches real download counts and the latest version at build time.
// Every number on the site comes from here, with the date it was read. If a platform is
// unreachable, its last known value is kept and marked as such; nothing is ever estimated.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const out = new URL("../src/data/stats.json", import.meta.url);
const previous = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : { sources: {} };
const get = async (url, headers = {}) => {
  const res = await fetch(url, { headers: { "user-agent": "connectionguard.net build (github.com/gerolndnr/connection-guard-cloud)", ...headers } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};
const sources = {
  modrinth: { name: "Modrinth", url: "https://modrinth.com/plugin/connectionguard", read: async () => (await get("https://api.modrinth.com/v2/project/connectionguard")).downloads },
  spigot: { name: "SpigotMC", url: "https://www.spigotmc.org/resources/121509/", read: async () => (await get("https://api.spiget.org/v2/resources/121509")).downloads },
  github: { name: "GitHub", url: "https://github.com/gerolndnr/connection-guard/releases", read: async () => {
    let total = 0;
    for (let page = 1; page < 10; page++) {
      const releases = await get(`https://api.github.com/repos/gerolndnr/connection-guard/releases?per_page=100&page=${page}`);
      for (const r of releases) for (const a of r.assets) total += a.download_count;
      if (releases.length < 100) break;
    }
    return total;
  } },
  hangar: { name: "Hangar", url: "https://hangar.papermc.io/gerolndnr/connection-guard", read: async () => (await get("https://hangar.papermc.io/api/v1/projects/gerolndnr/connection-guard")).stats.downloads },
};
const result = { fetchedAt: new Date().toISOString(), sources: {}, latest: previous.latest ?? null };
for (const [id, s] of Object.entries(sources)) {
  try { result.sources[id] = { name: s.name, url: s.url, downloads: await s.read(), stale: false }; }
  catch (e) {
    console.warn(`stats: ${id} unavailable (${e.message}); keeping last known value`);
    const last = previous.sources?.[id];
    if (last) result.sources[id] = { ...last, stale: true };
  }
}
// The newest release wins, wherever it is published first (GitHub releases can precede the plugin stores).
const newer = (a, b) => { const p = (x) => (x.match(/\d+/g) ?? []).slice(0, 3).map(Number); const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); return false; };
let modrinth = null, github = null;
try {
  const [v] = await get("https://api.modrinth.com/v2/project/connectionguard/version");
  // The primary file, for the direct download button: Modrinth's CDN URL, so the download still counts there.
  const f = v.files.find((x) => x.primary) ?? v.files[0];
  modrinth = { version: v.version_number, published: v.date_published, loaders: v.loaders, source: "modrinth",
    file: f ? { name: f.filename, size: f.size, url: f.url } : null };
} catch (e) { console.warn("stats: Modrinth version unavailable"); }
try {
  const r = await get("https://api.github.com/repos/gerolndnr/connection-guard/releases/latest");
  const f = r.assets.find((a) => /^connection-guard-[\d.]+-all\.jar$/.test(a.name));
  github = { version: r.tag_name.replace(/^v/, ""), published: r.published_at, loaders: modrinth?.loaders ?? [], source: "github",
    url: r.html_url, file: f ? { name: f.name, size: f.size, url: f.browser_download_url } : null };
} catch (e) { console.warn("stats: GitHub release unavailable"); }
const best = github?.file && (!modrinth || newer(github.version, modrinth.version)) ? github : modrinth;
if (best) result.latest = best;
else console.warn("stats: latest version unavailable; keeping last known");
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log("stats:", Object.entries(result.sources).map(([k, v]) => `${k}=${v.downloads}${v.stale ? " (stale)" : ""}`).join(" "), "latest", result.latest?.version);
