import type { DecisionEvent } from "@cg/protocol";
import type { Install } from "./api.ts";

const nf = new Intl.NumberFormat("en-US");
export const num = (n: number) => nf.format(n);
export const pct = (n: number | null, digits = 1) => (n === null || !Number.isFinite(n) ? "–" : `${(n * 100).toFixed(digits)}%`);
export const ms = (n: number | null) => (n === null ? "–" : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);

export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
}

export const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
export const dayKey = (t: number) => new Date(t).toDateString();

export const platformName = { BUKKIT: "Paper / Spigot", BUNGEE: "BungeeCord", VELOCITY: "Velocity" } as const;
export const serverName = (i: Pick<Install, "name" | "platform" | "id">) => i.name ?? `${platformName[i.platform]} ${i.id.slice(4, 8)}`;

const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export const countryName = (cc: string) => { try { return regionNames?.of(cc) ?? cc; } catch { return cc; } };

/** Loopback and private ranges cannot be looked up by any provider (a test from the same machine or LAN). */
export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:")) return true;
  const m = /^(\d+)\.(\d+)\./.exec(v);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

/** "Would refuse": logged in OBSERVE mode with a flag that ENFORCE would act on. */
export const wouldRefuse = (e: DecisionEvent) => e.mode === "OBSERVE" && e.outcome === "ALLOW" && e.flags.length > 0;

export type Verdict = "admitted" | "refused" | "would-refuse" | "error";
export function verdict(e: DecisionEvent): Verdict {
  if (e.outcome === "DENY") return "refused";
  if (e.outcome === "ERROR") return "error";
  return wouldRefuse(e) ? "would-refuse" : "admitted";
}

export const reasonText: Record<DecisionEvent["reason"], string> = {
  CHECKS_COMPLETE: "All checks passed",
  FLAG_ALLOWED: "Flagged, let in anyway",
  UNKNOWN_ALLOWED: "Inconclusive, let in by failure policy",
  ACCESS_RULE: "Manual access rule",
  LOOKUP_UNAVAILABLE: "Lookups unavailable, failure policy applied",
  OVERLOAD: "Overload protection",
  VPN_FLAG: "VPN or proxy",
  GEO_FLAG: "Country not allowed",
  INTERNAL_ERROR: "Internal error",
  IDENTITY_UNAVAILABLE: "Identity could not be verified",
};

const flagText = { VPN: "a VPN or proxy", GEO: "a blocked country", ACCESS_POLICY: "an access rule" } as const;

/** Reason label for one entry: flagged-but-admitted reads differently in pencil (OBSERVE) and ink (ENFORCE). */
export const reasonLabel = (e: DecisionEvent) => (wouldRefuse(e) ? "Would refuse in ENFORCE" : reasonText[e.reason]);

/** One plain-English sentence for the "why" panel. */
export function explain(e: DecisionEvent): string {
  const positives = e.sources.filter((s) => s.status === "POSITIVE" && s.voting).map((s) => s.id);
  const country = e.sources.find((s) => s.country)?.country;
  const flags = e.flags.map((f) => flagText[f]).join(" and ");
  switch (verdict(e)) {
    case "refused":
      if (e.reason === "ACCESS_RULE") return "A manual deny rule matched this connection, so it was refused before any lookup.";
      if (e.reason === "VPN_FLAG") return `Refused: ${positives.length ? positives.join(" and ") : "the providers"} reported a VPN or proxy${country ? ` in ${countryName(country)}` : ""}.`;
      if (e.reason === "GEO_FLAG") return `Refused: your country rules do not allow connections from ${country ? countryName(country) : "this country"}.`;
      if (e.reason === "LOOKUP_UNAVAILABLE") return "Refused because no provider answered in time and the failure policy is CLOSED.";
      if (e.reason === "OVERLOAD") return "Refused by overload protection: too many logins arrived at once.";
      return `Refused: ${reasonText[e.reason].toLowerCase()}.`;
    case "would-refuse":
      return `Connection Guard found ${flags} but let the player in, because this server only observes. In ENFORCE mode this connection would have been refused.`;
    case "error":
      return "The check failed with an internal error; the connection was handled by your failure policy.";
    default:
      if (e.reason === "ACCESS_RULE") return "A manual allow or exempt rule matched, so no lookup was needed.";
      if (e.reason === "UNKNOWN_ALLOWED") return "The providers could not give an answer in time; your failure policy lets such players in.";
      if (e.reason === "FLAG_ALLOWED") return `Connection Guard found ${flags}, and your settings let such players in.`;
      return "Every check came back clean.";
  }
}
