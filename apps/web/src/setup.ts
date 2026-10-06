// First-run logic shared by the setup assistant and the overview checklist.
import type { ConfigSnapshot } from "@cg/protocol";
import { api, type Install } from "./api.ts";

type Secret = { set: boolean; hint: string | null };
const secret = (s: ConfigSnapshot | null | undefined, path: string) => (s?.[path] as Secret | undefined)?.set ?? false;

/**
 * A server counts as configured when it no longer runs the shipped defaults: enforcing, a key or
 * keyed provider, country rules, or any dashboard-managed value. The assistant never pushes itself
 * onto such a server; it offers the settings page instead.
 */
export function isConfigured(snapshot: ConfigSnapshot | null | undefined, managed: string[] = []): boolean {
  if (!snapshot) return false;
  return managed.length > 0
    || snapshot["operation.mode"] === "ENFORCE"
    || secret(snapshot, "provider.vpn.proxycheck.api-key")
    || snapshot["provider.vpn.iphub.enabled"] === true
    || snapshot["provider.vpn.vpnapi.enabled"] === true
    || snapshot["provider.vpn.ipqualityscore.enabled"] === true
    || (Array.isArray(snapshot["behavior.geo.list"]) && (snapshot["behavior.geo.list"] as string[]).length > 0)
    || snapshot["behavior.geo.type"] === "WHITELIST";
}

/**
 * True when VPN detection cannot run out of free lookups quickly: a ProxyCheck key, a keyed provider, or a failover
 * chain with a keyless service without a daily cap (IPQuery) behind ProxyCheck.
 */
export function hasQuotaKey(snapshot: ConfigSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  if (snapshot["provider.vpn.proxycheck.enabled"] === false) return true;
  if (snapshot["provider.vpn-failover.enabled"] === true && snapshot["provider.vpn.ipquery.enabled"] === true) return true;
  return secret(snapshot, "provider.vpn.proxycheck.api-key")
    || (snapshot["provider.vpn.iphub.enabled"] === true && secret(snapshot, "provider.vpn.iphub.api-key"))
    || (snapshot["provider.vpn.vpnapi.enabled"] === true && secret(snapshot, "provider.vpn.vpnapi.api-key"))
    || (snapshot["provider.vpn.ipqualityscore.enabled"] === true && secret(snapshot, "provider.vpn.ipqualityscore.api-key"));
}

/** Lookups per day, extrapolated from the last 24 hours (or the server's age, if younger). */
export function lookupsPerDay(lookups24h: number, install: Pick<Install, "created_at">, now = Date.now()): number | null {
  const ageHours = Math.max(1, (now - install.created_at) / 3_600_000);
  if (lookups24h === 0) return null;
  return Math.round(ageHours >= 24 ? lookups24h : (lookups24h / ageHours) * 24);
}

/**
 * Switches one server to ENFORCE without dropping anything else the dashboard manages:
 * the desired config replaces the overlay, so the current managed values are sent along.
 */
export async function switchToEnforce(installId: string) {
  const cfg = await api.serverConfig(installId);
  const keep = Object.fromEntries(Object.entries(cfg.desired?.reset ? {} : cfg.desired?.values ?? {})
    .filter(([k]) => cfg.managed.includes(k)));
  return api.saveConfig(installId, { values: { ...keep, "operation.mode": "ENFORCE" }, secrets: {}, apply_to: "server" });
}
