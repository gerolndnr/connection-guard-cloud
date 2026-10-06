// Source IDs as plugins report them, mapped to the provider keys and names the dashboard uses.
// Decisions name sources after the plugin's classes ("proxycheckvpnprovider-0", "geo-ipapigeoprovider"); provider
// health uses account names ("proxycheck", "ip-api") and, since 0.5.2, "vpn-<section>" or "extension-<id>".

const NAMES: Record<string, string> = {
  proxycheck: "ProxyCheck", "ip-api": "IP-API", iphub: "IPHub", vpnapi: "VPNAPI", ipquery: "IPQuery",
  ipqualityscore: "IPQualityScore", "tor-list": "Tor exit list", "connectionguard-intel": "Connection Guard Intel",
  blackbox: "Blackbox", ipcheck: "ip-check.net", zowi: "zowi",
};

/** The provider key behind a reported source ID ("proxycheckvpnprovider-0" → "proxycheck"), or the cleaned ID. */
export function sourceKey(id: string): string {
  let k = id.toLowerCase().replace(/-\d+$/, "").replace(/^(geo|vpn)-/, "");
  if (k.startsWith("extension-")) return k;
  k = k.replace(/(vpn|geo)?provider$/, "");
  if (k === "ipapi" || k === "ip-api") return "ip-api";
  if (k === "torexitlist") return "tor-list";
  return k;
}

/** A name for people: "ProxyCheck", "Tor exit list", "Extension owned". */
export function sourceLabel(id: string): string {
  const k = sourceKey(id);
  if (k.startsWith("extension-")) return `Extension ${k.slice("extension-".length)}`;
  return NAMES[k] ?? id;
}

export type SourceType = "VPN" | "PROXY" | "TOR" | "RELAY" | "HOSTING";
const TYPE_TEXT: Record<SourceType, string> = { VPN: "VPN", PROXY: "proxy", TOR: "Tor exit", RELAY: "privacy relay", HOSTING: "data centre" };

/** "VPN", "privacy relay", "VPN and data centre": what a source said the address is, when it reported it. */
export const typesText = (types: readonly SourceType[] | undefined) =>
  types && types.length ? types.map((t) => TYPE_TEXT[t]).join(" and ") : null;

/** A source's verdict for the decision panel, using its categories when the plugin reports them (0.5.2+). */
export function sourceVerdict(s: { status: string; scope: string; types?: readonly SourceType[] }): { text: string; tone: "refused" | "admitted" | "neutral" } {
  const types = s.types ?? [];
  if (s.status === "POSITIVE") {
    if (s.scope === "GEO") return { text: "Country not allowed", tone: "refused" };
    if (types.includes("TOR")) return { text: "Tor exit", tone: "refused" };
    if (types.includes("RELAY")) return { text: "Privacy relay", tone: "refused" };
    if (types.includes("PROXY") && !types.includes("VPN")) return { text: "Proxy", tone: "refused" };
    return { text: types.includes("VPN") ? "VPN" : "VPN / proxy", tone: "refused" };
  }
  if (types.includes("RELAY")) return { text: "Privacy relay, allowed", tone: "neutral" };
  if (types.includes("HOSTING")) return { text: "Data centre, not blocked", tone: "neutral" };
  if (s.status === "NEGATIVE") return { text: "Clean", tone: "admitted" };
  return { text: "No answer", tone: "neutral" };
}

/** The bundled Tor list: answered on the server itself, without asking any service. */
export const isTorList = (id: string) => sourceKey(id) === "tor-list";
/** Lists the server keeps itself (Tor list, Connection Guard Intel): no cache to forget, so "check again" does nothing. */
export const isLocalList = (id: string) => isTorList(id) || sourceKey(id) === "connectionguard-intel";
