// VPN detection services the dashboard can configure. Limits are the providers' published free tiers.
export interface ProviderInfo {
  key: "proxycheck" | "ip-api" | "iphub" | "vpnapi";
  name: string;
  body: string;
  keyPath: string | null;
  keyRequired: boolean;
  signup: string | null;
  /** Free lookups per day without / with a free key; null = no daily cap. */
  daily: { withoutKey: number | null; withKey: number | null };
}

export const PROVIDERS: readonly ProviderInfo[] = [
  { key: "proxycheck", name: "ProxyCheck", body: "Free: 100 checks a day, 1,000 with a free API key.", keyPath: "provider.vpn.proxycheck.api-key", keyRequired: false,
    signup: "https://proxycheck.io/dashboard/", daily: { withoutKey: 100, withKey: 1000 } },
  { key: "ip-api", name: "IP-API", body: "Free, no key, 45 checks a minute. Non-commercial use only.", keyPath: null, keyRequired: false,
    signup: null, daily: { withoutKey: null, withKey: null } },
  { key: "iphub", name: "IPHub", body: "Free key with 1,000 checks a day.", keyPath: "provider.vpn.iphub.api-key", keyRequired: true,
    signup: "https://iphub.info/", daily: { withoutKey: 0, withKey: 1000 } },
  { key: "vpnapi", name: "VPNAPI", body: "Free key with 1,000 checks a day.", keyPath: "provider.vpn.vpnapi.api-key", keyRequired: true,
    signup: "https://vpnapi.io/", daily: { withoutKey: 0, withKey: 1000 } },
];

/** API keys contain letters, digits and a few separators (mirrors the plugin's check). */
export const isValidKey = (k: string) => /^[A-Za-z0-9._:-]{1,256}$/.test(k);

/**
 * Every lookup asks all enabled services, so the selection is limited by its smallest daily cap.
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
