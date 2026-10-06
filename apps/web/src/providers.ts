// VPN detection services the dashboard can configure. Limits are the providers' published free tiers.
import { supportsPath } from "@cg/protocol";
import { versionAtLeast } from "./format.ts";

export interface ProviderInfo {
  key: "proxycheck" | "blackbox" | "ipcheck" | "zowi" | "ipquery" | "ip-api" | "iphub" | "vpnapi" | "ipqualityscore";
  name: string;
  body: string;
  keyPath: string | null;
  keyRequired: boolean;
  signup: string | null;
  /** Free lookups per day without / with a free key; null = no daily cap. */
  daily: { withoutKey: number | null; withKey: number | null };
  /** No key: allowed for non-commercial servers only. */
  nonCommercial?: boolean;
  /** On in the recommended 0.6 setup (the plugin's new-install defaults). */
  recommended?: boolean;
  /** Something an operator should know before turning it on. */
  caution?: string;
}

/**
 * In the order the plugin asks them by default (0.6.0: ProxyCheck → Blackbox → ip-check.net → zowi → IPQuery, keyed
 * services after that, IP-API always last). `site` links the service's own page.
 */
export const PROVIDERS: readonly ProviderInfo[] = [
  { key: "proxycheck", name: "ProxyCheck", body: "Free: 100 checks a day, 1,000 with a free API key.", keyPath: "provider.vpn.proxycheck.api-key", keyRequired: false,
    signup: "https://proxycheck.io/dashboard/", daily: { withoutKey: 100, withKey: 1000 }, recommended: true },
  { key: "blackbox", name: "Blackbox", body: "Free, no key, by ipinfo.app. Also flags hosting and cloud networks.", keyPath: null, keyRequired: false,
    signup: "https://ipinfo.app/privacy/", daily: { withoutKey: null, withKey: null }, recommended: true },
  { key: "ipcheck", name: "ip-check.net", body: "Free, no key.", keyPath: null, keyRequired: false,
    signup: null, daily: { withoutKey: null, withKey: null },
    caution: "ip-check.net publishes no operator, terms or privacy policy, so it is off by default. Only turn it on if you can name it in your server's privacy information." },
  { key: "zowi", name: "zowi", body: "Free, no key. Run by Zowi, the developer of FoxGate. Hosting alone is not treated as a VPN.", keyPath: null, keyRequired: false,
    signup: null, daily: { withoutKey: null, withKey: null }, recommended: true },
  { key: "ipquery", name: "IPQuery", body: "Free, no key, over HTTPS. Its terms allow commercial use.", keyPath: null, keyRequired: false,
    signup: null, daily: { withoutKey: null, withKey: null }, recommended: true },
  { key: "iphub", name: "IPHub", body: "Free key with 1,000 checks a day.", keyPath: "provider.vpn.iphub.api-key", keyRequired: true,
    signup: "https://iphub.info/", daily: { withoutKey: 0, withKey: 1000 } },
  { key: "vpnapi", name: "VPNAPI", body: "Free key with 1,000 checks a day.", keyPath: "provider.vpn.vpnapi.api-key", keyRequired: true,
    signup: "https://vpnapi.io/", daily: { withoutKey: 0, withKey: 1000 } },
  { key: "ipqualityscore", name: "IPQualityScore", body: "Needs your own key. Check the credits and terms of your account.", keyPath: "provider.vpn.ipqualityscore.api-key", keyRequired: true,
    signup: "https://www.ipqualityscore.com/", daily: { withoutKey: 0, withKey: null } },
  { key: "ip-api", name: "IP-API", body: "Free, no key, 45 checks a minute. Non-commercial use only. Always asked last.", keyPath: null, keyRequired: false,
    signup: null, daily: { withoutKey: null, withKey: null }, nonCommercial: true, recommended: true },
];

/** Services this server can switch from the dashboard: each plugin version offers its own set (0.6.0 has no IPQuery switch). */
export const providersFor = (snapshot: Record<string, unknown> | null | undefined) =>
  PROVIDERS.filter((p) => supportsPath(snapshot, `provider.vpn.${p.key}.enabled`) && (!p.keyPath || supportsPath(snapshot, p.keyPath)));

/**
 * Services the server runs that the dashboard cannot switch, as its provider health shows them (0.6.0 keeps IPQuery in
 * config.yml). They still belong in the order a player's address travels.
 */
export function fixedProviders(snapshot: Record<string, unknown> | null | undefined, healthKeys: readonly string[]): ProviderInfo[] {
  const switchable = new Set(providersFor(snapshot).map((p) => p.key));
  return PROVIDERS.filter((p) => !switchable.has(p.key) && healthKeys.includes(p.key));
}

/** API keys contain letters, digits and a few separators (mirrors the plugin's check). */
export const isValidKey = (k: string) => /^[A-Za-z0-9._:-]{1,256}$/.test(k);

/**
 * Failover (the default from plugin 0.5.2) asks one service at a time and moves on when it fails or its limit is used
 * up. Voting asks every enabled service for every new address. Older plugins only vote and do not report the switch.
 */
export type Strategy = "failover" | "voting";
export const strategyOf = (values: Record<string, unknown> | null | undefined): Strategy =>
  values?.["provider.vpn-failover.enabled"] === true ? "failover" : "voting";

/**
 * What the server actually does. Plugins from 0.5.2 ask one service after another by default; those that do not report
 * the switch (0.6.0 keeps it in config.yml) are treated as failover, as their default is.
 */
export const usesFailover = (values: Record<string, unknown> | null | undefined, snapshot: Record<string, unknown> | null | undefined, pluginVersion: string) =>
  supportsPath(snapshot, "provider.vpn-failover.enabled") ? strategyOf(values) === "failover" : versionAtLeast(pluginVersion, "0.5.2");

/**
 * Voting: every lookup asks all enabled services, so the selection is limited by its smallest daily cap.
 * Returns null when no selected service has a daily cap.
 */
export function dailyCapacity(selected: { info: ProviderInfo; hasKey: boolean }[]): { limit: number; by: ProviderInfo; keyless: boolean } | null {
  let best: { limit: number; by: ProviderInfo; keyless: boolean } | null = null;
  for (const { info, hasKey } of selected) {
    const limit = hasKey ? info.daily.withKey : info.daily.withoutKey;
    if (limit === null) continue;
    if (!best || limit < best.limit) best = { limit, by: info, keyless: !hasKey };
  }
  return best;
}

/**
 * Failover: the first service answers until its limit is used up, then the next one takes over. Budgets are not
 * added up: a service's real account balance is unknown, and country lookups may share it. What matters is whether
 * a service without a daily cap stands behind the capped ones.
 */
export function failoverCoverage(ordered: { info: ProviderInfo; hasKey: boolean }[]): { first: ProviderInfo; firstLimit: number | null; uncappedFallback: ProviderInfo | null } | null {
  const [head, ...rest] = ordered;
  if (!head) return null;
  const limit = (s: { info: ProviderInfo; hasKey: boolean }) => (s.hasKey ? s.info.daily.withKey : s.info.daily.withoutKey);
  // Keyless services only: a keyed service without a daily cap still spends account credits.
  return { first: head.info, firstLimit: limit(head), uncappedFallback: rest.find((s) => !s.info.keyPath && limit(s) === null)?.info ?? null };
}

/**
 * The order a failover chain asks the enabled services in, as the plugin builds it: the configured `order` first,
 * then the remaining enabled services in their default order, IP-API always last.
 */
export function failoverOrder(enabled: readonly ProviderInfo[], order: readonly string[]): ProviderInfo[] {
  const rank = (p: ProviderInfo) => (p.key === "ip-api" ? 1000 : order.includes(p.key) ? order.indexOf(p.key) : 100 + PROVIDERS.indexOf(p));
  return [...enabled].sort((a, b) => rank(a) - rank(b));
}
