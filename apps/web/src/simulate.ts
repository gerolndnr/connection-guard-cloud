// "What if": replays recorded decisions against proposed settings, using what each provider answered at the time.
// It is an estimate. Providers that were not asked then cannot be replayed, access rules and other plugins are
// left as they were, and the cache may have answered for some logins.
import type { RegisterEvent } from "./api.ts";

type Values = Record<string, unknown>;
const VPN_PROVIDERS = ["proxycheck", "ip-api", "iphub", "vpnapi"] as const;

export interface SimulationResult {
  total: number;
  refusedBefore: number;
  refusedAfter: number;
  /** Logins whose outcome would change, newest first. */
  changed: { event: RegisterEvent; after: "refused" | "admitted"; why: string }[];
  /** Logins where a newly enabled service had not been asked, so its vote is unknown. */
  unknown: number;
}

const refusedNow = (e: RegisterEvent) => e.outcome === "DENY" || (e.mode === "OBSERVE" && e.outcome === "ALLOW" && e.flags.length > 0);

export function simulate(events: RegisterEvent[], v: Values): SimulationResult {
  const enforce = v["operation.mode"] === "ENFORCE";
  const enabled = VPN_PROVIDERS.filter((p) => v[`provider.vpn.${p}.enabled`] === true);
  const votes = Math.max(1, Number(v["required-positive-flags"] ?? 1));
  const vpnKick = v["behavior.vpn.kick-player"] !== false;
  const geoKick = v["behavior.geo.kick-player"] !== false;
  const geoType = v["behavior.geo.type"] === "WHITELIST" ? "WHITELIST" : "BLACKLIST";
  const geoList = new Set((v["behavior.geo.list"] as string[] | undefined) ?? []);
  const geoOn = v["provider.geo.service"] !== "Disabled";
  const exempt = (list: unknown, e: RegisterEvent) => Array.isArray(list)
    && list.some((x) => typeof x === "string" && (x.toLowerCase() === e.ip.toLowerCase() || (e.uuid !== null && e.identity_trust !== "UNTRUSTED" && x.toLowerCase() === e.uuid)));

  const out: SimulationResult = { total: 0, refusedBefore: 0, refusedAfter: 0, changed: [], unknown: 0 };
  for (const e of events) {
    if (e.outcome === "ERROR") continue;
    out.total++;
    const before = refusedNow(e);
    if (before) out.refusedBefore++;
    // Access rules and other plugins' admission checks decide independently of these settings.
    if (e.reason === "ACCESS_RULE" || e.reason === "EXTERNAL_POLICY" || e.reason === "EXTERNAL_UNAVAILABLE") { if (before) out.refusedAfter++; continue; }

    let vpn = false;
    if (enabled.length > 0 && !exempt(v["behavior.vpn.exemptions"], e)) {
      const asked = new Set(e.sources.filter((s) => s.scope !== "GEO").map((s) => s.id));
      if (enabled.some((p) => !asked.has(p))) out.unknown++;
      const positives = e.sources.filter((s) => s.scope !== "GEO" && s.status === "POSITIVE" && (enabled as readonly string[]).includes(s.id)).length;
      vpn = positives >= Math.min(votes, enabled.length);
    }
    let geo = false;
    const country = e.sources.find((s) => s.scope === "GEO" && s.country)?.country ?? e.sources.find((s) => s.country)?.country ?? null;
    if (geoOn && country && !exempt(v["behavior.geo.exemptions"], e)) {
      geo = geoType === "BLACKLIST" ? geoList.has(country) : !geoList.has(country);
    }
    const after = enforce && ((vpn && vpnKick) || (geo && geoKick));
    if (after) out.refusedAfter++;
    if (after !== before) {
      out.changed.push({ event: e, after: after ? "refused" : "admitted",
        why: after ? (vpn && vpnKick ? "VPN or proxy" : `Country ${country}`) : !enforce ? "Observe mode" : "No rule matches" });
    }
  }
  out.changed.sort((a, b) => b.event.at - a.event.at);
  return out;
}

/** Settings that change who gets in; only these trigger a simulation. */
export const SIMULATED_PATHS = ["operation.mode", "required-positive-flags", "behavior.vpn.kick-player", "behavior.geo.kick-player",
  "behavior.geo.type", "behavior.geo.list", "provider.geo.service", "behavior.vpn.exemptions", "behavior.geo.exemptions",
  ...VPN_PROVIDERS.map((p) => `provider.vpn.${p}.enabled`)];
