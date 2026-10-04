// Fills a local `wrangler dev` with SYNTHETIC demo data for visual checks and e2e tests.
// Usage: node scripts/seed-demo.mjs [http://localhost:8788]
// Everything it creates is labeled synthetic. Never point this at production.
const base = process.argv[2] ?? "http://localhost:8788";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error("seed-demo only runs against a local dev server");

const H = 3_600_000;
const now = Date.now();
let rnd = 42;
const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rand() * a.length)];

async function post(path, body, headers = {}) {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", origin: base, ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return { json: await res.json(), res };
}

const countries = [["DE", 30], ["US", 18], ["GB", 9], ["PL", 8], ["NL", 7], ["FR", 6], ["BR", 5], ["SE", 4], ["CZ", 3], ["RU", 2]];
const isps = { DE: "Deutsche Telekom AG", US: "Comcast Cable", GB: "BT Group", PL: "Orange Polska", NL: "KPN B.V.", FR: "Orange S.A.", BR: "Claro S.A.", SE: "Telia Company", CZ: "O2 Czech Republic", RU: "Rostelecom" };
const vpnHosts = [["NL", "M247 Europe SRL (synthetic)", 9009], ["US", "DigitalOcean, LLC (synthetic)", 14061], ["DE", "Hetzner Online GmbH (synthetic)", 24940]];
const weighted = () => { let r = rand() * 92; for (const [cc, w] of countries) { if ((r -= w) <= 0) return cc; } return "DE"; };
const ip = () => `${pick([84, 91, 176, 185, 31, 77, 93, 109])}.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}.${Math.floor(rand() * 254) + 1}`;

function event(at, platform, mode, vpnRate) {
  const vpn = rand() < vpnRate;
  const geo = !vpn && rand() < 0.02;
  const cc = vpn ? pick(vpnHosts)[0] : geo ? "RU" : weighted();
  const host = vpn ? pick(vpnHosts) : null;
  const enforce = mode === "ENFORCE";
  const flags = vpn ? ["VPN"] : geo ? ["GEO"] : [];
  const deny = enforce && flags.length > 0;
  const cached = rand() < 0.35;
  return {
    id: crypto.randomUUID(), at, platform, phase: "LOGIN", mode,
    outcome: deny ? "DENY" : "ALLOW",
    reason: deny ? (vpn ? "VPN_FLAG" : "GEO_FLAG") : flags.length ? "FLAG_ALLOWED" : "CHECKS_COMPLETE",
    identity_trust: platform === "BUKKIT" ? "PLATFORM_ONLINE" : "AUTHENTICATED",
    uuid: crypto.randomUUID(), ip: ip(),
    vpn: vpn ? "POSITIVE" : "NEGATIVE", geo: "KNOWN", flags,
    duration_ms: cached ? Math.floor(rand() * 8) + 2 : Math.floor(rand() * 260) + 60,
    sources: [
      { id: "proxycheck", scope: "VPN", status: vpn ? "POSITIVE" : "NEGATIVE", reason: "NONE", duration_ms: Math.floor(rand() * 200) + 40, voting: true, from_cache: cached,
        country: cc, asn: host ? host[2] : 3320, isp: host ? host[1] : isps[cc], risk: vpn ? 70 + Math.floor(rand() * 30) : Math.floor(rand() * 20) },
      { id: "ip-api", scope: "GEO", status: geo ? "POSITIVE" : "NEGATIVE", reason: "NONE", duration_ms: Math.floor(rand() * 120) + 30, voting: false, from_cache: cached,
        country: cc, asn: null, isp: null, risk: null },
    ],
    rules: [],
  };
}

// What a freshly installed plugin reports: config.yml defaults (secrets only as "set" flags).
const snapshot = (mode) => ({
  "operation.mode": mode, "failure-policy.vpn": "OPEN", "failure-policy.geo": "OPEN", "required-positive-flags": 1,
  "provider.vpn.proxycheck.enabled": true, "provider.vpn.proxycheck.api-key": { set: true, hint: "9f2c" },
  "provider.vpn.ip-api.enabled": false, "provider.vpn.iphub.enabled": false, "provider.vpn.iphub.api-key": { set: false, hint: null },
  "provider.vpn.vpnapi.enabled": false, "provider.vpn.vpnapi.api-key": { set: false, hint: null }, "provider.geo.service": "IP-API",
  "provider.cache.expiration.vpn": 1440, "provider.cache.expiration.geo": 4320,
  "behavior.vpn.kick-player": true, "behavior.vpn.notify-staff": true, "behavior.vpn.send-webhook.enabled": false,
  "behavior.vpn.send-webhook.url": { set: false, hint: null }, "behavior.vpn.exemptions": [],
  "behavior.geo.kick-player": true, "behavior.geo.notify-staff": true, "behavior.geo.send-webhook.enabled": false,
  "behavior.geo.send-webhook.url": { set: false, hint: null }, "behavior.geo.type": "BLACKLIST", "behavior.geo.list": ["RU"], "behavior.geo.exemptions": [],
});

const servers = [
  { platform: "VELOCITY", platform_version: "Velocity 3.4.0-SNAPSHOT (git-a1b2c3)", name: "Proxy", mode: "ENFORCE", rate: 26, vpnRate: 0.07 },
  { platform: "BUKKIT", platform_version: "Paper 1.21.11-132", name: "Survival", mode: "OBSERVE", rate: 9, vpnRate: 0.2 },
];

const login = await post("/api/auth/dev-login", { name: "Demo Operator" });
const cookie = login.res.headers.get("set-cookie").split(";")[0];
let networkId = null;
for (const s of servers) {
  const { json: ins } = await post("/v1/installs", { protocol: 1, platform: s.platform, platform_version: s.platform_version, plugin_version: "0.5.0", java_version: "21.0.4" });
  const auth = { authorization: `Bearer ${ins.install_id}.${ins.secret}` };
  const claim = await post(`/api/link/${ins.link_code}`, {
    ...(networkId ? { network_id: networkId } : { network_name: "Blockhaven (synthetic demo)" }),
    server_name: s.name, accept_dpa: true, dpa_version: "2026-10-04", turnstile_token: "dev",
  }, { cookie });
  networkId = claim.json.network_id;
  let seq = 0;
  for (let h = 47; h >= 0; h--) {
    const end = now - h * H;
    const evening = new Date(end).getHours();
    const load = Math.max(1, Math.round(s.rate * (0.35 + 0.9 * Math.exp(-((evening - 20) ** 2) / 18)) * (0.7 + rand() * 0.6)));
    const events = Array.from({ length: load }, () => event(end - Math.floor(rand() * H), s.platform, s.mode, s.vpnRate)).sort((a, b) => a.at - b.at);
    const c = { checks: 0, allowed: 0, denied: 0, errors: 0, vpn_positive: 0, geo_flagged: 0, cache_hits: 0, lookups: 0, countries: {}, reasons: {} };
    for (const e of events) {
      c.checks++; c[e.outcome === "DENY" ? "denied" : "allowed"]++;
      if (e.vpn === "POSITIVE") c.vpn_positive++;
      if (e.flags.includes("GEO")) c.geo_flagged++;
      if (e.sources[0].from_cache) c.cache_hits++; else c.lookups++;
      const cc = e.sources[0].country; c.countries[cc] = (c.countries[cc] ?? 0) + 1;
      c.reasons[e.reason] = (c.reasons[e.reason] ?? 0) + 1;
    }
    const durations = events.map((e) => e.duration_ms).sort((a, b) => a - b);
    await post("/v1/sync", {
      protocol: 1, seq: ++seq, plugin_version: "0.5.0", platform_version: s.platform_version,
      status: {
        mode: s.mode, uptime_seconds: 172_800 - h * 3600,
        providers: [
          { id: "proxycheck", scope: "VPN", attempts: 412, successes: 405, last_reason: "TIMEOUT", paused: false, daily_used: s.platform === "VELOCITY" ? 846 : 212, daily_budget: 1000 },
          { id: "ip-api", scope: "GEO", attempts: 398, successes: 398, last_reason: null, paused: false, daily_used: null, daily_budget: null },
        ],
        warnings: s.mode === "OBSERVE" ? ["mode.observe"] : [], config_version: null, cache_type: "SQLITE", buffered_events: 0, dropped_events: 0,
        config: snapshot(s.mode), managed: [], config_result: null,
      },
      counters: { window_start: end - H, window_end: end, ...c,
        latency_ms_p50: durations[Math.floor(durations.length / 2)] ?? null, latency_ms_p95: durations[Math.floor(durations.length * 0.95)] ?? null },
      events, command_results: [],
    }, auth);
  }
}
console.log(`Seeded synthetic network ${networkId}. Sign in locally as "Demo Operator".`);
