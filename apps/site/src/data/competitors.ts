// One comparison page per plugin in the benchmark (/compare/<slug>). Facts about the other plugin come from its own
// listing, its shipped configuration (recorded by mc-antivpn-bench's clean-install test) or the benchmark; each
// carries its source. Numbers are never typed here: the page reads them from src/data/benchmark.json, and every
// benchmark-based point states the condition under which it holds, so a newer run cannot leave a stale claim behind.
import { bench, blocked, catchCohorts, failure, perf, spareTotal, spareN } from "../lib/benchmark";

export const CHECKED = "13 October 2026";
const BENCH_REPO = "https://github.com/gerolndnr/mc-antivpn-bench";
export const US = "connection-guard-061";

/** The measured numbers of one plugin, from the published benchmark run. */
export interface Metrics {
  caught: number; bad: number; refused: number; good: number; ipv6: number; ipv6N: number; proxies: number; proxiesN: number;
  waveP95: number | null; waveChecked: number | null; coldP95: number | null; warmP50: number | null; start: number | null;
  /** Failure cases (of four) in which a VPN and a Tor exit were still refused while every service failed that way. */
  keptBlocking: number; outages: number;
}

export function metrics(id: string): Metrics {
  const cohort = (cid: string) => catchCohorts.find((c) => c.id === cid);
  const outages = Object.keys(failure[id] ?? {}).filter((f) => f !== "control");
  return {
    caught: catchCohorts.reduce((s, c) => s + blocked(c.id, id), 0), bad: catchCohorts.reduce((s, c) => s + c.n, 0),
    refused: spareTotal(id), good: spareN,
    ipv6: blocked("vpn_v6", id), ipv6N: cohort("vpn_v6")?.n ?? 0, proxies: blocked("proxy", id), proxiesN: cohort("proxy")?.n ?? 0,
    waveP95: perf(id, "burst")?.decision_p95 ?? null, waveChecked: perf(id, "burst")?.checked ?? null,
    coldP95: perf(id, "cold")?.decision_p95 ?? null, warmP50: perf(id, "warm")?.decision_p50 ?? null,
    start: (bench.performance as Record<string, { start_s?: number }>)[id]?.start_s ?? null,
    keptBlocking: outages.filter((f) => failure[id]![f]!.vpn?.blocked && failure[id]![f]!.tor?.blocked).length, outages: outages.length,
  };
}

/** A difference the page leads with. `when` keeps it off the page once the data no longer supports it. */
export interface Point { title: string; body: (them: Metrics, us: Metrics) => string; when?: (them: Metrics, us: Metrics) => boolean; source: "benchmark" | "config" | "listing" }

export interface Competitor {
  slug: string; id: string; name: string; author: string; listing: string; listingName: string;
  price: string; source: string; license: string; platforms: string; storage: string;
  /** What happens right after installing it, as shipped. */
  afterInstall: string;
  /** How it decides, in one sentence. */
  detection: string;
  telemetry: string;
  /** `/cg migrate preview <id>` in Connection Guard 0.6.1. */
  migrate: string;
  title: string; description: string; lede: string;
  points: Point[];
  /** Where it is good: a comparison that only lists weaknesses helps nobody choose. Measured ones carry a condition. */
  strengths: (string | { text: (them: Metrics, us: Metrics) => string; when: (them: Metrics, us: Metrics) => boolean })[];
  faq: { q: string; a: string }[];
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "–");
const sec = (ms: number | null) => (ms === null ? "–" : ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${Math.round(ms)} ms`);
export const fmt = { pct, sec };

export const COMPETITORS: Competitor[] = [
  {
    slug: "foxgate", id: "foxgate", name: "FoxGate", author: "IDCTeam (ImZowi)", listing: "https://modrinth.com/plugin/foxgate", listingName: "Modrinth",
    price: "Free edition; country, ASN and residential filters need the paid Plus edition", source: "Closed (all rights reserved)", license: "All rights reserved",
    platforms: "Paper, Spigot, Folia, BungeeCord, Velocity, Sponge, Nukkit, WaterdogPE, Hytale", storage: "SQL databases; no Redis",
    afterInstall: "Blocks right away with 12 keyless services; a player is flagged when 5 of them agree (maxFlags 5).",
    detection: "Asks up to 12 keyless services per new player and counts flags; zowi, one of them, is run by FoxGate's own developer.",
    telemetry: "Own metrics and Sentry error reporting on by default, plus a self-updater that replaces the JAR.",
    migrate: "foxgate",
    title: "FoxGate Alternative: Connection Guard vs FoxGate (2026 Benchmark)",
    description: "FoxGate vs Connection Guard, measured on the same server: join waves, first joins, false positives and outages, with free country rules and open source.",
    lede: "Both plugins block VPNs out of the box and catch most of them. The difference shows when many players join at once, and in what you get for free.",
    points: [
      { title: "Keeps up when many players join", source: "benchmark",
        when: (t, u) => t.waveP95 !== null && u.waveP95 !== null && t.waveP95 > 4 * u.waveP95,
        body: (t, u) => `With 1,000 players joining in 20 seconds, FoxGate needed ${sec(t.waveP95)} at the 95th percentile and looked up ${t.waveChecked} of them; Connection Guard decided within ${sec(u.waveP95)} and looked up ${u.waveChecked}. FoxGate asks up to 12 services for every new address, and their free limits run out in a wave.` },
      { title: "Returning players get in at once", source: "benchmark",
        when: (t, u) => t.warmP50 !== null && u.warmP50 !== null && t.warmP50 > 20 * u.warmP50,
        body: (t, u) => `A player joining again took FoxGate ${sec(t.warmP50)} (median), Connection Guard ${sec(u.warmP50)}: Connection Guard answers returning players from memory.` },
      { title: "Country rules are free here", source: "config",
        body: () => "In FoxGate, country and ASN filtering and the residential-range list are Plus (paid) features, as its own configuration marks them. Connection Guard's country block and allow lists, ASN and CIDR rules are free and open source." },
      { title: "Fewer home players refused", source: "benchmark",
        when: (t, u) => u.refused < t.refused,
        body: (t, u) => `Of ${t.good} home and mobile players, FoxGate refused ${t.refused}, Connection Guard ${u.refused}.` },
      { title: "Open source, and every data flow documented", source: "config",
        body: () => "FoxGate is closed source, sends its own metrics and Sentry error reports by default and replaces its own JAR through a self-updater. Connection Guard is MIT licensed and never replaces its JAR; what it sends by default (bStats, anonymous totals and error reports without player data) is documented, and each can be switched off." },
    ],
    strengths: [
      { when: (t) => t.caught >= 0.9 * t.bad, text: (t) => `Caught ${t.caught} of ${t.bad} VPN, Tor and proxy addresses in the benchmark.` },
      { when: (t) => t.outages > 0 && t.keptBlocking === t.outages, text: () => "Kept refusing VPNs and Tor exits in every outage the benchmark simulated." },
      "Runs on more platforms, including Sponge, Bedrock (Nukkit, WaterdogPE) and Hytale, and ships many service definitions you can switch on.",
    ],
    faq: [
      { q: "Is FoxGate free?", a: "There is a free edition. Country and ASN filtering, the residential-range list and some update features belong to the paid Plus edition, according to FoxGate's own configuration (checked on 13 October 2026)." },
      { q: "Who runs zowi?", a: "zowi is run by FoxGate's developer. FoxGate asks it as one of its services, and Connection Guard 0.6.1 uses it as its first network service as well, as one source among several." },
      { q: "Can I move my FoxGate settings to Connection Guard?", a: "Yes. Connection Guard 0.6.1 reads FoxGate's configuration: run /cg migrate preview foxgate, review the result, then apply it. Your admin rules come along; FoxGate's caches do not." },
    ],
  },
  {
    slug: "proxyshield", id: "proxyshield", name: "ProxyShield", author: "LucasTHCR", listing: "https://modrinth.com/plugin/proxyshield", listingName: "Modrinth",
    price: "Free", source: "Open (GPL-3.0)", license: "GPL-3.0", platforms: "Paper, Spigot, Folia, BungeeCord, Velocity, Sponge", storage: "Disk cache or Redis",
    afterInstall: "Blocks right away: 7 keyless services vote with weights (score 1.5 refuses), plus lists, reverse DNS and heuristics; data-centre addresses are blocked too.",
    detection: "Adds up a score from 7 keyless services, IP lists, reverse DNS and join heuristics, and blocks hosting ranges by default.",
    telemetry: "bStats.",
    migrate: "proxyshield",
    title: "ProxyShield Alternative: Connection Guard vs ProxyShield (2026 Benchmark)",
    description: "ProxyShield vs Connection Guard on the same server: false positives on home connections, join waves and outages. Both open source; measured side by side.",
    lede: "Two open-source plugins with different defaults. ProxyShield counts data-centre ranges as a reason to refuse; Connection Guard only refuses evidence of a VPN, proxy or Tor exit.",
    points: [
      { title: "Fewer real players refused", source: "benchmark",
        when: (t, u) => u.refused < t.refused,
        body: (t, u) => `Of ${t.good} home and mobile players, ProxyShield refused ${t.refused} and Connection Guard ${u.refused}. ProxyShield blocks data-centre ranges by default, and several home connections sit in ranges some services list as hosting.` },
      { title: "Every player checked in a join wave", source: "benchmark",
        when: (t, u) => t.waveChecked !== null && u.waveChecked !== null && t.waveChecked < 0.8 * u.waveChecked,
        body: (t, u) => `With 1,000 players joining in 20 seconds, ProxyShield looked up ${t.waveChecked} and needed ${sec(t.waveP95)} at the 95th percentile; Connection Guard looked up ${u.waveChecked} within ${sec(u.waveP95)}.` },
      { title: "More VPNs over IPv6", source: "benchmark",
        when: (t, u) => u.ipv6 > t.ipv6,
        body: (t, u) => `ProxyShield blocked ${t.ipv6} of ${t.ipv6N} VPN servers reached over IPv6, Connection Guard ${u.ipv6}.` },
      { title: "One question at a time", source: "config",
        body: () => "ProxyShield asks its services in parallel for every new address. Connection Guard checks its own lists on the server first and then asks one service at a time, so most players cost one lookup or none, and fewer services see their address." },
    ],
    strengths: [
      "Open source (GPL-3.0), with dry-run and silent modes and Discord alerts.",
      "Combines several signals (lists, reverse DNS, join heuristics) instead of trusting one service, and can share its cache through Redis.",
      { when: (t) => t.outages > 0 && t.keptBlocking === t.outages, text: () => "Kept refusing VPNs and Tor exits in every outage the benchmark simulated." },
    ],
    faq: [
      { q: "Why does ProxyShield refuse some home players?", a: "It blocks hosting and data-centre ranges by default (detection.block-hosting). Some services list consumer ranges as hosting, so a home player can be refused. You can switch it off in its config." },
      { q: "Can I move my ProxyShield settings to Connection Guard?", a: "Yes. Run /cg migrate preview proxyshield in Connection Guard 0.6.1, review what it maps, then apply it on the next restart." },
    ],
  },
  {
    slug: "vpnguard", id: "vpnguard", name: "VPNGuard", author: "depton", listing: "https://modrinth.com/plugin/vpnguard", listingName: "Modrinth",
    price: "Free", source: "Closed (all rights reserved)", license: "All rights reserved", platforms: "Paper, Spigot, Folia, BungeeCord, Velocity", storage: "SQLite; no Redis",
    afterInstall: "Does not block anyone: join enforcement is off until you run /vpnkick on, and only IP-API is enabled.",
    detection: "Asks IP-API by default; ProxyCheck and VPNAPI can be added with keys. One flag refuses (min-providers-flagged 1).",
    telemetry: "None found.",
    migrate: "vpnguard",
    title: "VPNGuard Alternative: Connection Guard vs VPNGuard (2026 Benchmark)",
    description: "VPNGuard vs Connection Guard on the same server: protection out of the box, IPv6 VPNs, public proxies, join waves and outages, measured side by side.",
    lede: "VPNGuard installs quietly: it checks only when asked until you switch on enforcement, and then relies on one free service. Here is what that means in numbers.",
    points: [
      { title: "Protects from the first start", source: "config",
        body: () => "After installing VPNGuard nobody is blocked: join enforcement is off and only IP-API, whose free use is non-commercial, is enabled. Connection Guard 0.6 enforces on new installs, with its own lists and three keyless services." },
      { title: "More proxies and IPv6 VPNs caught", source: "benchmark",
        when: (t, u) => u.proxies > t.proxies && u.ipv6 >= t.ipv6,
        body: (t, u) => `With enforcement on, VPNGuard blocked ${t.proxies} of ${t.proxiesN} public proxies and ${t.ipv6} of ${t.ipv6N} IPv6 VPN servers; Connection Guard ${u.proxies} and ${u.ipv6}.` },
      { title: "Keeps blocking when services fail", source: "benchmark",
        when: (t, u) => u.keptBlocking > t.keptBlocking,
        body: (t, u) => `When the detection services timed out, rate-limited or broke, VPNGuard let the VPN or Tor exit in in ${t.outages - t.keptBlocking} of ${t.outages} cases; Connection Guard kept refusing in ${u.keptBlocking} of ${u.outages}, from its own lists on the server.` },
      { title: "Every player checked in a join wave", source: "benchmark",
        when: (t, u) => t.waveChecked !== null && u.waveChecked !== null && t.waveChecked < 0.5 * u.waveChecked,
        body: (t, u) => `With 1,000 players joining in 20 seconds, VPNGuard looked up ${t.waveChecked} (one lookup a second, queued) and took ${sec(t.waveP95)} at the 95th percentile; Connection Guard looked up ${u.waveChecked} within ${sec(u.waveP95)}.` },
    ],
    strengths: [
      "Simple: three providers, a few commands, no telemetry found.",
      { when: (t, u) => t.coldP95 !== null && u.coldP95 !== null && t.coldP95 <= 1.1 * u.coldP95, text: (t) => `Fast first joins once enforcement is on: ${sec(t.coldP95)} at the 95th percentile.` },
    ],
    faq: [
      { q: "Why does VPNGuard not block VPNs after installing?", a: "Its join enforcement is off by default; it only checks when you run a command. Turn it on with /vpnkick on (join-enforcement.enabled: true)." },
      { q: "Can I move my VPNGuard settings to Connection Guard?", a: "Yes. Run /cg migrate preview vpnguard in Connection Guard 0.6.1. API keys and your rules come along after you review them." },
    ],
  },
  {
    slug: "kaurivpn", id: "kaurivpn", name: "KauriVPN", author: "funkemunky (Brighten Development)", listing: "https://modrinth.com/plugin/kauri-antivpn", listingName: "Modrinth",
    price: "Free, with a paid licence for more lookups", source: "Open (Apache-2.0)", license: "Apache-2.0", platforms: "Paper, Spigot, Folia, BungeeCord, Velocity, Sponge", storage: "H2, MySQL or MongoDB; no Redis",
    afterInstall: "Kicks VPN users out of the box, but only after they have joined: the check runs once the player is on the server.",
    detection: "Asks only funkemunky.cc, its author's own service (20,000 free lookups, then a paid licence).",
    telemetry: "bStats.",
    migrate: "kaurivpn",
    title: "KauriVPN Alternative: Connection Guard vs Kauri AntiVPN (2026 Benchmark)",
    description: "Kauri AntiVPN vs Connection Guard on the same server: refused before or kicked after joining, IPv6 VPNs, false positives and outages, measured side by side.",
    lede: "KauriVPN lets every player in and kicks VPN users a moment later. Connection Guard decides during login. That changes what a VPN user can do on your server, and more.",
    points: [
      { title: "Refused at the door, not kicked afterwards", source: "benchmark",
        body: () => "KauriVPN lets every player join and checks afterwards, so a VPN user is on the server, if only for a moment, before the kick. Connection Guard decides during the login, before the player joins the world." },
      { title: "VPNs over IPv6 caught", source: "benchmark",
        when: (t, u) => u.ipv6 > t.ipv6,
        body: (t, u) => `KauriVPN blocked ${t.ipv6} of ${t.ipv6N} VPN servers reached over IPv6; Connection Guard ${u.ipv6}.` },
      { title: "Fewer real players kicked", source: "benchmark",
        when: (t, u) => u.refused < t.refused,
        body: (t, u) => `Of ${t.good} home and mobile players, KauriVPN kicked ${t.refused}, Connection Guard refused ${u.refused}.` },
      { title: "Not tied to one service", source: "config",
        body: () => "KauriVPN asks only its author's own service, and needs a paid licence once the free lookups are used. Connection Guard combines its own signed lists with several independent services, and you choose which." },
      { title: "Keeps blocking when its service fails", source: "benchmark",
        when: (t, u) => u.keptBlocking > t.keptBlocking,
        body: (t, u) => `When the detection service timed out, rate-limited or broke, KauriVPN let the VPN or Tor exit stay in ${t.outages - t.keptBlocking} of ${t.outages} cases; Connection Guard kept refusing in ${u.keptBlocking} of ${u.outages}.` },
    ],
    strengths: [
      "Open source (Apache-2.0) and light: logins are never held up, because the check runs after joining.",
      { when: (t) => t.caught >= 0.75 * t.bad, text: (t) => `Caught ${t.caught} of ${t.bad} VPN, Tor and proxy addresses in the benchmark, most of them over IPv4.` },
    ],
    faq: [
      { q: "Does KauriVPN block before or after joining?", a: "After. Players join first; KauriVPN checks them and kicks VPN users a moment later. In the benchmark its join times measure the login, not a decision." },
      { q: "Can I move my KauriVPN settings to Connection Guard?", a: "Yes. Connection Guard 0.6.1 reads KauriVPN's configuration and its local H2 admin lists: run /cg migrate preview kaurivpn (the H2 reader needs Java 11 or newer)." },
    ],
  },
  {
    slug: "advancedantivpn", id: "advancedantivpn", name: "AdvancedAntiVPN", author: "HexedHero", listing: "https://www.spigotmc.org/resources/101081/", listingName: "SpigotMC",
    price: "Paid (£7.99 on SpigotMC)", source: "Closed", license: "Commercial licence", platforms: "Spigot, Paper, BungeeCord, Velocity", storage: "SQLite or MySQL; no Redis",
    afterInstall: "Blocks nobody until you configure it: every detection service is off by default and it warns that none is enabled.",
    detection: "Up to 7 services vote; by default two must agree (Flagged Threshold 2). Most give only 100 lookups a day without a key.",
    telemetry: "bStats, a SpigotMC licence check and an update check.",
    migrate: "advancedantivpn",
    title: "AdvancedAntiVPN Alternative: Connection Guard vs AdvancedAntiVPN (2026 Benchmark)",
    description: "AdvancedAntiVPN vs Connection Guard on the same server: what a paid plugin catches without keys, join waves, outages and false positives. Connection Guard is free.",
    lede: "AdvancedAntiVPN costs money and needs setup and API keys before it blocks much. Connection Guard is free, open source and protects from the first start.",
    points: [
      { title: "Free, and protecting from the first start", source: "config",
        body: () => "AdvancedAntiVPN costs £7.99 and blocks nobody after installing: every service is off until you switch services on and add keys. Connection Guard is free and enforces on new installs." },
      { title: "Catches far more without API keys", source: "benchmark",
        when: (t, u) => u.caught > 1.5 * t.caught,
        body: (t, u) => `With the services it offers without a key switched on, AdvancedAntiVPN blocked ${t.caught} of ${t.bad} VPN, Tor and proxy addresses (${pct(t.caught, t.bad)}): two of its three keyless services stop after 100 lookups a day, and it needs two to agree. Connection Guard blocked ${u.caught}.` },
      { title: "Keeps blocking when services fail", source: "benchmark",
        when: (t, u) => u.keptBlocking > t.keptBlocking,
        body: (t, u) => `When the services timed out, rate-limited or broke, AdvancedAntiVPN let the VPN or Tor exit in in ${t.outages - t.keptBlocking} of ${t.outages} cases; Connection Guard kept refusing in ${u.keptBlocking} of ${u.outages}.` },
      { title: "Every player checked in a join wave", source: "benchmark",
        when: (t, u) => t.waveP95 !== null && u.waveP95 !== null && t.waveP95 > 4 * u.waveP95,
        body: (t, u) => `With 1,000 players joining in 20 seconds, AdvancedAntiVPN needed ${sec(t.waveP95)} at the 95th percentile and looked up ${t.waveChecked}; Connection Guard decided within ${sec(u.waveP95)} for ${u.waveChecked}.` },
    ],
    strengths: [
      "Highly rated on SpigotMC (4.9 from 43 ratings, checked 13 October 2026) and supports seven services, including IPQualityScore and GetIPIntel.",
      { when: (t, u) => t.refused <= u.refused, text: (t) => `Refused only ${t.refused} home or mobile players in the benchmark (it also blocked few VPNs without keys).` },
      "Extras like a join-attack mode (Aegis), GeoLite2 country rules and per-IP connection limits.",
    ],
    faq: [
      { q: "Is AdvancedAntiVPN free?", a: "No. It is a paid SpigotMC resource (£7.99 on 13 October 2026). Connection Guard is free and open source (MIT)." },
      { q: "Do I need API keys for AdvancedAntiVPN?", a: "To block reliably, yes. Without keys, ProxyCheck and VPNAPI answer 100 lookups a day each, and by default two services must agree, so after about 100 players most decisions rest on one service and fail the vote." },
      { q: "Can I move my AdvancedAntiVPN settings to Connection Guard?", a: "Yes. Run /cg migrate preview advancedantivpn in Connection Guard 0.6.1; it maps the mode, countries, keys and your admin rules after you review them." },
    ],
  },
];

export const benchmarkRepo = BENCH_REPO;
