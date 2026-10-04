// Strips data that must never reach product analytics: player IP addresses, UUIDs and one-time link codes.
// Shared by the dashboard, the website and the API as a last line of defence behind masking and ph-no-capture.

const IPV4 = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
// IPv6: five or more groups, or any form with "::". Clock times like 12:04:51 stay intact.
const H = "[0-9a-f]{1,4}";
const IPV6 = new RegExp(
  `\\b(?:${H}:){4,7}${H}(?![0-9a-z])|(?:\\b${H}(?::${H}){0,6})?::(?:${H}(?::${H}){0,6})?(?![0-9a-z:])`,
  "gi",
);
const UUID = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi;
const LINK = /\/link\/[A-Z0-9-]{4,}/gi;

export function scrubString(s: string): string {
  return s.replace(LINK, "/link/:code").replace(UUID, "[uuid]").replace(IPV6, "[ip]").replace(IPV4, "[ip]");
}

export function scrubValue(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return scrubString(v);
  if (depth > 6 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => scrubValue(x, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, scrubValue(x, depth + 1)]));
}

/** Dashboard URLs carry network and server IDs; analytics only needs the page, the IDs go into groups. */
export function normalizePath(path: string): string {
  return scrubString(path)
    .replace(/\/n\/net_[A-Za-z0-9]+/g, "/n/:network")
    .replace(/([?&])server=ins_[A-Za-z0-9]+/g, "$1server=:server");
}

// PostHog's own identifiers (distinct, session, window, device, event IDs) are random and must stay intact.
const ANALYTICS_ID_KEY = /^(?:distinct_id|uuid|token|\$[a-z_]*(?:_id|uuid))$/;

/** Scrubs every event property except the analytics SDK's own random identifiers. */
export function scrubEventProperties<T extends Record<string, unknown>>(props: T): T {
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, ANALYTICS_ID_KEY.test(k) ? v : scrubValue(v)])) as T;
}
