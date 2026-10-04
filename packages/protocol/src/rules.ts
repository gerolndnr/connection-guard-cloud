// Access rule targets as the plugin (0.5.0 and later) stores and matches them.
// The plugin keeps address targets in Java's IpNetwork form ("203.0.113.5/32", IPv6 without "::" compression)
// and removes a rule only on an exact, case-insensitive match. The dashboard therefore stores the same canonical
// form; otherwise a removal would silently leave the rule in place on the server.
import type { DecisionEvent } from "./index.ts";

export const CONNECTION_TYPES = ["VPN", "PROXY", "TOR", "RELAY", "HOSTING"] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export type RuleKind = "ip" | "range" | "player" | "asn" | "isp" | "operator" | "country" | "type";

/** Longest target the protocol carries (access_rule.add/remove `target`). */
export const MAX_TARGET = 64;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ipv4Bytes(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    // Like the plugin: no leading zeros (010 could mean octal elsewhere).
    if (!/^(0|[1-9]\d{0,2})$/.test(p) || Number(p) > 255) return null;
    out.push(Number(p));
  }
  return out;
}

function ipv6Bytes(s: string): number[] | null {
  if (!/^[0-9a-fA-F:.]+$/.test(s) || s.split("::").length > 2) return null;
  let tail: number[] = [];
  let text = s;
  const lastColon = s.lastIndexOf(":");
  if (s.slice(lastColon + 1).includes(".")) {
    const v4 = ipv4Bytes(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    text = s.slice(0, lastColon + 1) + "0:0"; // placeholder groups, replaced below
  }
  const [head, rest] = text.split("::") as [string, string | undefined];
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const left = groups(head);
  const right = rest === undefined ? [] : groups(rest);
  if ([...left, ...right].some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  const missing = 8 - left.length - right.length;
  if (rest === undefined ? missing !== 0 : missing < 1) return null;
  const all = [...left, ...Array<string>(rest === undefined ? 0 : missing).fill("0"), ...right];
  const bytes = all.flatMap((g) => { const n = parseInt(g, 16); return [n >> 8, n & 0xff]; });
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function mask(bytes: number[], prefix: number) {
  return bytes.map((b, i) => { const bits = Math.min(8, Math.max(0, prefix - i * 8)); return bits === 0 ? 0 : b & ((0xff << (8 - bits)) & 0xff); });
}

/**
 * An IPv4/IPv6 address or CIDR range in the exact form the plugin's IpNetwork.toString() produces, or null.
 * IPv4-mapped IPv6 (::ffff:a.b.c.d) becomes IPv4, as in Java.
 */
export function canonicalNetwork(text: string): string | null {
  const parts = text.trim().split("/");
  if (parts.length > 2 || parts[0] === "") return null;
  const address = parts[0]!.replace(/^\[|\]$/g, "");
  let bytes = address.includes(":") ? ipv6Bytes(address) : ipv4Bytes(address);
  if (!bytes) return null;
  if (parts.length === 2 && !/^\d{1,3}$/.test(parts[1]!)) return null;
  let prefix = parts.length === 1 ? bytes.length * 8 : Number(parts[1]);
  if (bytes.length === 16 && bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    bytes = bytes.slice(12);
    if (parts.length === 2) { if (prefix < 96 || prefix > 128) return null; prefix -= 96; } else prefix = 32;
  }
  if (prefix < 0 || prefix > bytes.length * 8) return null;
  const net = mask(bytes, prefix);
  if (net.length === 4) return `${net.join(".")}/${prefix}`;
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((net[i]! << 8) | net[i + 1]!).toString(16));
  return `${groups.join(":")}/${prefix}`;
}

const selectorValue = (raw: string, prefix: string) => {
  const v = raw.slice(prefix.length + 1).trim();
  // Plugin: 1..200 characters, no control characters, no section sign; the protocol caps the whole target at 64.
  if (!v || prefix.length + 1 + v.length > MAX_TARGET || /[\u0000-\u001f\u007f§]/.test(v)) return null;
  return v;
};

/** The canonical target for a rule the operator typed, or null when the plugin would reject it. */
export function ruleTarget(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 80) return null;
  const colon = t.indexOf(":");
  const head = colon > 0 ? t.slice(0, colon).toLowerCase() : "";
  if (head === "asn" || /^as\d/i.test(t)) {
    const n = (head === "asn" ? t.slice(4) : t).trim().toUpperCase().replace(/^AS/, "");
    return /^[1-9]\d{0,9}$/.test(n) && Number(n) <= 4_294_967_295 ? `ASN:${n}` : null;
  }
  if (head === "country") {
    const cc = t.slice(8).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(cc) ? `country:${cc}` : null;
  }
  if (head === "type") {
    const type = t.slice(5).trim().toUpperCase();
    return (CONNECTION_TYPES as readonly string[]).includes(type) ? `type:${type}` : null;
  }
  if (head === "isp" || head === "operator") {
    const v = selectorValue(t, head);
    return v ? `${head}:${v}` : null;
  }
  if (UUID.test(t)) return t.toLowerCase();
  return canonicalNetwork(t);
}

export function ruleKind(target: string): RuleKind {
  const head = target.includes(":") ? target.slice(0, target.indexOf(":")).toLowerCase() : "";
  if (head === "asn") return "asn";
  if (head === "isp" || head === "operator" || head === "country" || head === "type") return head;
  if (UUID.test(target)) return "player";
  return /\/(32|128)$/.test(target) || !target.includes("/") ? "ip" : "range";
}

/** The selector's value without its prefix ("ASN:3320" → "3320", "isp:Foo" → "Foo"). */
export const ruleValue = (target: string) => (target.includes(":") && ruleKind(target) !== "ip" && ruleKind(target) !== "range" ? target.slice(target.indexOf(":") + 1) : target);

/** An address target for display: "/32" and "/128" dropped, IPv6 compressed. */
export function displayNetwork(target: string): string {
  const [addr, prefix] = target.split("/") as [string, string | undefined];
  let shown = addr;
  if (addr.includes(":")) {
    const groups = addr.split(":");
    let best = -1, len = 0;
    for (let i = 0; i < groups.length; i++) {
      let j = i; while (j < groups.length && groups[j] === "0") j++;
      if (j - i > len && j - i > 1) { best = i; len = j - i; }
    }
    shown = best < 0 ? addr : `${groups.slice(0, best).join(":")}::${groups.slice(best + len).join(":")}`;
  }
  return prefix === undefined || prefix === "32" && !addr.includes(":") || prefix === "128" ? shown : `${shown}/${prefix}`;
}

function inNetwork(ip: string, target: string): boolean {
  const ipNet = canonicalNetwork(ip);
  if (!ipNet) return false;
  const [net, prefix] = target.split("/");
  const masked = canonicalNetwork(`${ipNet.split("/")[0]}/${prefix}`);
  return masked === `${net}/${prefix}`;
}

/**
 * Whether a recorded decision would match the rule, for a preview over past logins.
 * Null when the decision log does not carry the evidence (connection types, operators): the plugin decides
 * those live from the classification each service reports, which protocol 1 does not record.
 */
export function ruleMatchesEvent(target: string, e: Pick<DecisionEvent, "ip" | "uuid" | "identity_trust" | "sources">): boolean | null {
  const kind = ruleKind(target);
  const v = ruleValue(target);
  switch (kind) {
    case "ip": case "range": return inNetwork(e.ip, target);
    case "player": return e.uuid !== null && e.identity_trust !== "UNTRUSTED" && e.uuid.toLowerCase() === target;
    case "asn": return e.sources.some((s) => s.asn !== null && String(s.asn) === v);
    case "isp": return e.sources.some((s) => s.isp !== null && s.isp.toLowerCase() === v.toLowerCase());
    case "country": return e.sources.some((s) => s.country === v);
    case "type": case "operator": return null;
  }
}
