// Patterns in recent decisions, computed in the browser from the decision log (see history.ts).
// Everything here is descriptive: it shows what the recorded decisions contain, not who is "bad".
import type { RegisterEvent } from "./api.ts";
import { verdict } from "./format.ts";

const flagged = (e: RegisterEvent) => e.flags.includes("VPN");
const vpnSources = (e: RegisterEvent) => e.sources.filter((s) => s.scope !== "GEO");

export interface NetworkRow {
  asn: number;
  isp: string | null;
  /** Logins from this network that a detection service flagged as VPN or proxy. */
  flagged: number;
  /** Of those, refused (or would be in ENFORCE). */
  refused: number;
  /** Logins from the same network that nothing flagged: a mixed network may be a home or school provider. */
  clean: number;
  countries: string[];
}

/** Provider networks behind VPN and proxy flags, most flagged first. */
export function networksBehindFlags(events: RegisterEvent[], limit = 8): NetworkRow[] {
  const rows = new Map<number, NetworkRow & { cc: Set<string> }>();
  for (const e of events) {
    const src = vpnSources(e).find((s) => s.asn !== null) ?? e.sources.find((s) => s.asn !== null);
    if (!src?.asn) continue;
    const row = rows.get(src.asn) ?? { asn: src.asn, isp: null, flagged: 0, refused: 0, clean: 0, countries: [], cc: new Set<string>() };
    row.isp ??= src.isp ?? e.sources.find((s) => s.isp)?.isp ?? null;
    if (flagged(e)) {
      row.flagged++;
      if (verdict(e) !== "admitted") row.refused++;
      const cc = e.sources.find((s) => s.country)?.country;
      if (cc) row.cc.add(cc);
    } else if (e.outcome !== "ERROR") row.clean++;
    rows.set(src.asn, row);
  }
  return [...rows.values()].filter((r) => r.flagged > 0)
    .sort((a, b) => b.flagged - a.flagged || a.clean - b.clean)
    .slice(0, limit)
    .map(({ cc, ...r }) => ({ ...r, countries: [...cc].sort() }));
}

export interface PlayerRow { uuid: string; addresses: number; countries: string[]; refused: number; logins: number; last: number }

/** Verified players who connected from several addresses: VPN hopping, travel or a mobile network. */
export function playersOnManyAddresses(events: RegisterEvent[], min = 3, limit = 10): PlayerRow[] {
  const rows = new Map<string, { ips: Set<string>; cc: Set<string>; refused: number; logins: number; last: number }>();
  for (const e of events) {
    if (!e.uuid || e.identity_trust === "UNTRUSTED") continue;
    const row = rows.get(e.uuid) ?? { ips: new Set<string>(), cc: new Set<string>(), refused: 0, logins: 0, last: 0 };
    row.ips.add(e.ip);
    const cc = e.sources.find((s) => s.country)?.country;
    if (cc) row.cc.add(cc);
    row.logins++;
    if (verdict(e) !== "admitted") row.refused++;
    row.last = Math.max(row.last, e.at);
    rows.set(e.uuid, row);
  }
  return [...rows.entries()].filter(([, r]) => r.ips.size >= min)
    .map(([uuid, r]) => ({ uuid, addresses: r.ips.size, countries: [...r.cc].sort(), refused: r.refused, logins: r.logins, last: r.last }))
    .sort((a, b) => b.addresses - a.addresses || b.last - a.last)
    .slice(0, limit);
}

export interface ServiceRow {
  id: string;
  asked: number;
  answered: number;
  positive: number;
  /** Median answer time of fresh (not cached) answers, or null when there were none. */
  medianMs: number | null;
  cached: number;
  /** Logins where another service also answered. */
  comparable: number;
  /** Of those, logins where this service's verdict differed from another's. */
  disagreed: number;
}

/** How the VPN detection services answered, and how often they disagreed with each other. */
export function compareServices(events: RegisterEvent[]): ServiceRow[] {
  const rows = new Map<string, ServiceRow & { times: number[] }>();
  for (const e of events) {
    const sources = vpnSources(e);
    const answered = sources.filter((s) => s.status !== "UNKNOWN");
    for (const s of sources) {
      const row = rows.get(s.id) ?? { id: s.id, asked: 0, answered: 0, positive: 0, medianMs: null, cached: 0, comparable: 0, disagreed: 0, times: [] };
      row.asked++;
      if (s.from_cache) row.cached++;
      if (s.status !== "UNKNOWN") {
        row.answered++;
        if (s.status === "POSITIVE") row.positive++;
        if (!s.from_cache) row.times.push(s.duration_ms);
        if (answered.length >= 2) {
          row.comparable++;
          if (answered.some((o) => o !== s && o.status !== s.status)) row.disagreed++;
        }
      }
      rows.set(s.id, row);
    }
  }
  return [...rows.values()].map(({ times, ...r }) => {
    const sorted = times.sort((a, b) => a - b);
    return { ...r, medianMs: sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)]! : null };
  }).sort((a, b) => b.asked - a.asked);
}
