// Source IDs as plugins report them, mapped to the provider keys and names the dashboard uses.
// Decisions name sources after the plugin's classes ("proxycheckvpnprovider-0", "geo-ipapigeoprovider"); provider
// health uses account names ("proxycheck", "ip-api") and, since 0.5.2, "vpn-<section>" or "extension-<id>".

const NAMES: Record<string, string> = {
  proxycheck: "ProxyCheck", "ip-api": "IP-API", iphub: "IPHub", vpnapi: "VPNAPI", ipquery: "IPQuery",
  ipqualityscore: "IPQualityScore", "tor-list": "Tor exit list",
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

/** The bundled Tor list: answered on the server itself, without asking any service. */
export const isTorList = (id: string) => sourceKey(id) === "tor-list";
