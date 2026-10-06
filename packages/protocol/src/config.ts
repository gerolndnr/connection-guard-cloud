// The settings the dashboard may change on a server. The plugin enforces the same list
// (CloudManagedConfig.java); anything not listed here can only be set in config.yml.
// Deliberately absent: console commands (execute-command), cache/Redis connection, identity,
// lookup tuning, overload, integrations, local data and custom providers.
// Paths in GATED_PATHS below are known here before every plugin release accepts them.
import { z } from "zod";

const COUNTRY = /^[A-Z]{2}$/;

export type FieldKind =
  | { kind: "bool" }
  | { kind: "enum"; options: readonly string[] }
  | { kind: "int"; min: number; max: number }
  | { kind: "countries" }
  | { kind: "list"; maxItems: number; maxLength: number }
  | { kind: "secret"; https?: boolean };

export const CONFIG_FIELDS = {
  "operation.mode": { kind: "enum", options: ["OBSERVE", "ENFORCE"] },
  "failure-policy.vpn": { kind: "enum", options: ["OPEN", "CLOSED", "OBSERVE"] },
  "failure-policy.geo": { kind: "enum", options: ["OPEN", "CLOSED", "OBSERVE"] },
  "required-positive-flags": { kind: "int", min: 1, max: 16 },
  "provider.vpn.proxycheck.enabled": { kind: "bool" },
  "provider.vpn.proxycheck.api-key": { kind: "secret" },
  "provider.vpn.ip-api.enabled": { kind: "bool" },
  "provider.vpn.iphub.enabled": { kind: "bool" },
  "provider.vpn.iphub.api-key": { kind: "secret" },
  "provider.vpn.vpnapi.enabled": { kind: "bool" },
  "provider.vpn.vpnapi.api-key": { kind: "secret" },
  "provider.geo.service": { kind: "enum", options: ["IP-API", "ProxyCheck", "Local", "Disabled"] },
  "provider.cache.expiration.vpn": { kind: "int", min: 1, max: 525_600 },
  "provider.cache.expiration.geo": { kind: "int", min: 1, max: 525_600 },
  "behavior.vpn.kick-player": { kind: "bool" },
  "behavior.vpn.notify-staff": { kind: "bool" },
  "behavior.vpn.send-webhook.enabled": { kind: "bool" },
  "behavior.vpn.send-webhook.url": { kind: "secret", https: true },
  "behavior.vpn.exemptions": { kind: "list", maxItems: 200, maxLength: 64 },
  "behavior.geo.kick-player": { kind: "bool" },
  "behavior.geo.notify-staff": { kind: "bool" },
  "behavior.geo.send-webhook.enabled": { kind: "bool" },
  "behavior.geo.send-webhook.url": { kind: "secret", https: true },
  "behavior.geo.type": { kind: "enum", options: ["BLACKLIST", "WHITELIST"] },
  "behavior.geo.list": { kind: "countries" },
  "behavior.geo.exemptions": { kind: "list", maxItems: 200, maxLength: 64 },
  // Newer plugins only (see GATED_PATHS).
  "provider.vpn-failover.enabled": { kind: "bool" },
  "provider.vpn-failover.order": { kind: "list", maxItems: 16, maxLength: 64 },
  "provider.max-external-attempts": { kind: "int", min: 1, max: 16 },
  "provider.vpn.ipquery.enabled": { kind: "bool" },
  // Keyless services of plugin 0.6.0 (ip-check.net is off by default there).
  "provider.vpn.blackbox.enabled": { kind: "bool" },
  "provider.vpn.ipcheck.enabled": { kind: "bool" },
  "provider.vpn.zowi.enabled": { kind: "bool" },
  "provider.vpn.ipqualityscore.enabled": { kind: "bool" },
  "provider.vpn.ipqualityscore.api-key": { kind: "secret" },
  // Connection Guard Intel lists (connection-guard-intel): on/off, and whether a privacy relay counts as VPN.
  "provider.local.connectionguard-intel.enabled": { kind: "bool" },
  "provider.local.connectionguard-intel.relay": { kind: "enum", options: ["ALLOW", "VPN"] },
} as const satisfies Record<string, FieldKind>;

export type ConfigPath = keyof typeof CONFIG_FIELDS;
export const CONFIG_PATHS = Object.keys(CONFIG_FIELDS) as ConfigPath[];
export const SECRET_PATHS = CONFIG_PATHS.filter((p) => CONFIG_FIELDS[p].kind === "secret");
export const isConfigPath = (p: string): p is ConfigPath => Object.hasOwn(CONFIG_FIELDS, p);

/**
 * Settings a plugin only accepts from the dashboard once its own list (CloudManagedConfig.java) includes them. A plugin
 * refuses a whole change that contains a path it does not know, so these are offered and sent only to servers whose
 * reported snapshot lists the path; that snapshot is built from the same list.
 */
export const GATED_PATHS: readonly ConfigPath[] = [
  "provider.vpn-failover.enabled", "provider.vpn-failover.order", "provider.max-external-attempts",
  "provider.vpn.ipquery.enabled", "provider.vpn.ipqualityscore.enabled", "provider.vpn.ipqualityscore.api-key",
  "provider.local.connectionguard-intel.enabled", "provider.local.connectionguard-intel.relay",
  "provider.vpn.blackbox.enabled", "provider.vpn.ipcheck.enabled", "provider.vpn.zowi.enabled",
];
/**
 * Gated paths every plugin from a given release accepts. Used only until a server has reported its snapshot (right after
 * linking), so the dashboard can offer that release's settings at once; afterwards the snapshot decides.
 */
export const PATHS_SINCE: readonly { version: string; paths: readonly ConfigPath[] }[] = [
  { version: "0.6.0", paths: ["provider.vpn.blackbox.enabled", "provider.vpn.ipcheck.enabled", "provider.vpn.zowi.enabled",
    "provider.local.connectionguard-intel.enabled", "provider.local.connectionguard-intel.relay"] },
];

/** "0.6.0-SNAPSHOT" ≥ "0.6.0": development builds already carry the features of their version. */
export function versionAtLeast(version: string | null | undefined, min: string): boolean {
  const parts = (x: string | null | undefined) => ((x ?? "").match(/\d+/g) ?? []).slice(0, 3).map(Number);
  const a = parts(version), b = parts(min);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}

/**
 * Whether a server accepts `path` from the dashboard: its reported snapshot decides; before it has reported one, its
 * plugin version (PATHS_SINCE).
 */
export const supportsPath = (snapshot: Record<string, unknown> | null | undefined, path: string, pluginVersion?: string | null) => {
  if (!(GATED_PATHS as readonly string[]).includes(path)) return true;
  if (snapshot) return Object.hasOwn(snapshot, path);
  return Boolean(pluginVersion) && PATHS_SINCE.some((r) => versionAtLeast(pluginVersion, r.version) && (r.paths as readonly string[]).includes(path));
};

export type ConfigValue = boolean | number | string | string[];

/** Schema for one field's value. Secrets may be "" (cleared). */
export function fieldSchema(path: ConfigPath): z.ZodType<ConfigValue> {
  const f: FieldKind = CONFIG_FIELDS[path];
  switch (f.kind) {
    case "bool": return z.boolean();
    case "enum": return z.enum(f.options as [string, ...string[]]);
    case "int": return z.number().int().min(f.min).max(f.max);
    case "countries": return z.array(z.string().regex(COUNTRY)).max(250).refine((a) => new Set(a).size === a.length, "duplicate country");
    case "list": return z.array(z.string().trim().min(1).max(f.maxLength).regex(/^[^\r\n]+$/)).max(f.maxItems);
    case "secret":
      return f.https
        ? z.union([z.literal(""), z.string().max(512).regex(/^https:\/\/[^\s]+$/)])
        : z.string().max(256).regex(/^[A-Za-z0-9._:-]*$/);
  }
}

/** Validates a partial map of values; unknown paths are rejected, not ignored. */
export const ConfigValues = z.record(z.string(), z.unknown()).superRefine((rec, ctx) => {
  for (const [path, value] of Object.entries(rec)) {
    if (!isConfigPath(path)) { ctx.addIssue({ code: "custom", path: [path], message: "not configurable from the dashboard" }); continue; }
    const r = fieldSchema(path).safeParse(value);
    if (!r.success) ctx.addIssue({ code: "custom", path: [path], message: r.error.issues[0]?.message ?? "invalid" });
  }
}).transform((rec) => rec as Partial<Record<ConfigPath, ConfigValue>>);

/** What the plugin reports back: effective values; secrets only as presence plus a short hint. */
export const SecretState = z.object({ set: z.boolean(), hint: z.string().max(8).nullable() }).strict();
export const ConfigSnapshot = z.record(z.string(), z.union([z.boolean(), z.number(), z.string(), z.array(z.string()), SecretState]))
  .refine((r) => Object.keys(r).every(isConfigPath), "unknown config path");
export type ConfigSnapshot = z.infer<typeof ConfigSnapshot>;

/** Desired config sent to the plugin. values replace the managed overlay; keep_secrets carry over managed secrets. */
export const DesiredConfig = z.object({
  version: z.number().int().min(1),
  reset: z.boolean(),
  values: ConfigValues,
  keep_secrets: z.array(z.string()).max(SECRET_PATHS.length).refine((a) => a.every((p) => (SECRET_PATHS as string[]).includes(p)), "not a secret path"),
}).strict();
export type DesiredConfig = z.infer<typeof DesiredConfig>;

export const ConfigResult = z.object({
  version: z.number().int().min(1),
  ok: z.boolean(),
  message: z.string().max(500).nullable(),
}).strict();
