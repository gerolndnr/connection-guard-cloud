// Connection Guard Cloud plugin protocol, version 1.
// Wire format is JSON with snake_case keys. The Java plugin mirrors these
// shapes; contract fixtures in fixtures/ are generated from this file.
import { z } from "zod";
import { ConfigResult, ConfigSnapshot, DesiredConfig, isConfigPath } from "./config.ts";

export * from "./config.ts";

export const PROTOCOL_VERSION = 1;
export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_EVENTS_PER_SYNC = 500;
export const MAX_ERRORS_PER_SYNC = 10;

const shortText = (max: number) => z.string().min(1).max(max);
const count = z.number().int().min(0).max(1_000_000_000);

export const Platform = z.enum(["BUKKIT", "BUNGEE", "VELOCITY"]);
export const Phase = z.enum(["PRE_AUTHENTICATION", "LOGIN"]);
export const Mode = z.enum(["OBSERVE", "ENFORCE"]);
export const IdentityTrust = z.enum(["UNTRUSTED", "AUTHENTICATED", "FORWARDED", "PLATFORM_ONLINE", "FLOODGATE", "VERIFIED_FORWARDING"]);
export const Outcome = z.enum(["ALLOW", "DENY", "ERROR"]);
export const DecisionReason = z.enum(["CHECKS_COMPLETE", "FLAG_ALLOWED", "UNKNOWN_ALLOWED", "ACCESS_RULE", "LOOKUP_UNAVAILABLE",
  "OVERLOAD", "VPN_FLAG", "GEO_FLAG", "INTERNAL_ERROR", "IDENTITY_UNAVAILABLE",
  // An admission hook of another plugin (see the plugin's docs/ADMISSION_API.md) refused, or could not answer.
  "EXTERNAL_POLICY", "EXTERNAL_UNAVAILABLE"]);
export const Check = z.enum(["NOT_CHECKED", "EXEMPT", "POSITIVE", "NEGATIVE", "KNOWN", "UNKNOWN"]);
export const Flag = z.enum(["ACCESS_POLICY", "VPN", "GEO", "EXTERNAL_POLICY"]);
export const Scope = z.enum(["VPN", "GEO", "ALL"]);
export const Effect = z.enum(["DENY", "ALLOW", "EXEMPT"]);
export const Match = z.enum(["MATCH", "MISS", "UNKNOWN", "CONFLICT"]);
export const DetectionStatus = z.enum(["POSITIVE", "NEGATIVE", "UNKNOWN"]);
export const DetectionReason = z.enum(["NONE", "TIMEOUT", "RATE_LIMIT", "HTTP_ERROR", "AUTHENTICATION", "INVALID_RESPONSE",
  "NETWORK", "OVERLOADED", "CIRCUIT_OPEN", "BUDGET_EXHAUSTED", "NO_PROVIDER", "CACHE_ERROR", "CANCELLED", "NO_EVIDENCE", "STALE_DATA"]);

const SourceId = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);

/**
 * Features a plugin understands beyond protocol 1. The dashboard only uses a feature with servers that report it,
 * because older plugins ignore unknown fields: a time-limited rule would otherwise become permanent.
 */
export const CAPABILITY = {
  /** `access_rule.add` honours `expires_at` and removes the rule by itself when it expires. */
  RULE_EXPIRY: "rule_expiry",
} as const;
export const Capability = z.string().regex(/^[a-z][a-z0-9_.-]{0,31}$/);
const CountryCode = z.string().regex(/^[A-Z]{2}$/);
const Ip = z.string().min(2).max(45).regex(/^[0-9a-fA-F:.]+$/);

// ---- install ---------------------------------------------------------------

export const InstallRequest = z.object({
  protocol: z.literal(PROTOCOL_VERSION),
  platform: Platform,
  platform_version: shortText(128),
  plugin_version: shortText(32),
  java_version: shortText(32),
  network_token: z.string().regex(/^cgn_[A-Za-z0-9_-]{32,64}$/).optional(),
}).strict();
export type InstallRequest = z.infer<typeof InstallRequest>;

export const InstallResponse = z.object({
  install_id: z.string().regex(/^ins_[A-Za-z0-9]{20,32}$/),
  secret: z.string().regex(/^cgs_[A-Za-z0-9_-]{40,64}$/),
  link_code: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/).nullable(),
  link_url: z.string().url().nullable(),
  claimed: z.boolean(),
  next_sync_in: z.number().int().min(5).max(3600),
}).strict();
export type InstallResponse = z.infer<typeof InstallResponse>;

// ---- sync ------------------------------------------------------------------

export const ProviderStatus = z.object({
  id: SourceId,
  scope: Scope,
  attempts: count,
  successes: count,
  last_reason: DetectionReason.nullable(),
  paused: z.boolean(),
  daily_used: count.nullable(),
  daily_budget: count.nullable(),
}).strict();

export const Status = z.object({
  mode: Mode,
  uptime_seconds: count,
  providers: z.array(ProviderStatus).max(32),
  warnings: z.array(z.string().regex(/^[a-z0-9_.-]{1,64}$/)).max(32),
  config_version: z.number().int().min(0).nullable(),
  cache_type: z.enum(["NONE", "SQLITE", "REDIS"]),
  buffered_events: count,
  dropped_events: count,
  // Only once linked: effective values of the dashboard-configurable settings, and which come from the dashboard.
  config: ConfigSnapshot.nullable(),
  managed: z.array(z.string()).max(64),
  config_result: ConfigResult.nullable(),
  // Absent on plugins that predate capabilities; treat as none.
  capabilities: z.array(Capability).max(16).optional(),
}).strict();
export type Status = z.infer<typeof Status>;

// Aggregate counters since the previous successful sync. Contain no personal data.
export const Counters = z.object({
  window_start: z.number().int(),
  window_end: z.number().int(),
  checks: count,
  allowed: count,
  denied: count,
  errors: count,
  vpn_positive: count,
  geo_flagged: count,
  cache_hits: count,
  lookups: count,
  latency_ms_p50: z.number().int().min(0).max(600_000).nullable(),
  latency_ms_p95: z.number().int().min(0).max(600_000).nullable(),
  countries: z.record(CountryCode, count).refine((r) => Object.keys(r).length <= 64, "too many countries"),
  reasons: z.partialRecord(DecisionReason, count),
}).strict();
export type Counters = z.infer<typeof Counters>;

export const EventSource = z.object({
  id: SourceId,
  scope: Scope,
  status: DetectionStatus,
  reason: DetectionReason,
  duration_ms: z.number().int().min(0).max(600_000),
  voting: z.boolean(),
  from_cache: z.boolean(),
  country: CountryCode.nullable(),
  asn: z.number().int().min(0).max(4_294_967_295).nullable(),
  isp: z.string().max(128).nullable(),
  risk: z.number().int().min(0).max(100).nullable(),
}).strict();

export const EventRule = z.object({
  id: z.string().min(1).max(64),
  scope: Scope,
  effect: Effect,
  match: Match,
  selected: z.boolean(),
}).strict();

// One login decision. Only sent once the install is linked to a network.
export const DecisionEvent = z.object({
  id: z.string().uuid(),
  at: z.number().int(),
  platform: Platform,
  phase: Phase,
  mode: Mode,
  outcome: Outcome,
  reason: DecisionReason,
  identity_trust: IdentityTrust,
  uuid: z.string().uuid().nullable(),
  ip: Ip,
  vpn: Check,
  geo: Check,
  flags: z.array(Flag).max(4),
  duration_ms: z.number().int().min(0).max(600_000),
  sources: z.array(EventSource).max(16),
  rules: z.array(EventRule).max(16),
}).strict();
export type DecisionEvent = z.infer<typeof DecisionEvent>;

// ---- error reports -----------------------------------------------------------

/**
 * Connection Guard's own exceptions, aggregated by the plugin (see the plugin's cloud.error-reports switch). Never a
 * message text: only class names, the plugin's own stack frames and counts. Sent by unlinked servers too, so nothing
 * here may identify a player, an operator or a machine.
 */
export const ErrorContext = z.enum(["STARTUP", "RELOAD", "LOOKUP", "CACHE", "SYNC", "COMMAND", "OTHER"]);
/** Frames from the plugin's own (and shaded) classes; anything else, such as a path or another plugin, is not one. */
export const OWN_CLASS = /^com\.github\.gerolndnr\.connectionguard\.[A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+){0,30}$/;
const JavaClass = z.string().max(200).regex(/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*){0,30}$/);
export const ErrorFrame = z.object({
  class: z.string().max(200).regex(OWN_CLASS),
  method: z.string().regex(/^[A-Za-z_$<][A-Za-z0-9_$<>]{0,127}$/),
  line: z.number().int().min(0).max(1_000_000).nullable(),
}).strict();
export const ErrorReport = z.object({
  /** 16 hex characters of SHA-256 over type and the top five own frames: the same bug has the same fingerprint everywhere. */
  fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  type: JavaClass,
  cause_type: JavaClass.nullable(),
  frames: z.array(ErrorFrame).min(1).max(12),
  context: ErrorContext,
  count: z.number().int().min(1).max(1_000_000_000),
  first_at: z.number().int(),
  last_at: z.number().int(),
}).strict().refine((r) => r.first_at <= r.last_at, "first_at after last_at");
export type ErrorReport = z.infer<typeof ErrorReport>;

export const CommandResult = z.object({
  id: z.string().regex(/^cmd_[A-Za-z0-9]{12,32}$/),
  ok: z.boolean(),
  message: z.string().max(512).nullable(),
}).strict();

export const SyncRequest = z.object({
  protocol: z.literal(PROTOCOL_VERSION),
  seq: z.number().int().min(0),
  plugin_version: shortText(32),
  platform_version: shortText(128),
  status: Status,
  counters: Counters,
  events: z.array(DecisionEvent).max(MAX_EVENTS_PER_SYNC),
  command_results: z.array(CommandResult).max(64),
  // Plugins from 0.5.2; older ones never send it.
  errors: z.array(ErrorReport).max(MAX_ERRORS_PER_SYNC).optional(),
}).strict();
export type SyncRequest = z.infer<typeof SyncRequest>;

/**
 * Makes a sync from a newer plugin parse against this protocol version. A plugin that adds an enum value (a new
 * decision reason, flag or provider status) would otherwise fail the strict schema and lose the whole sync,
 * counters and command results included. Instead, events this version cannot read are dropped one by one and
 * unknown reason keys leave the counters; both are counted so the dashboard can say so. Everything else stays
 * strict.
 */
export function tolerateSync(json: unknown): { json: unknown; dropped_events: number; dropped_reasons: number; dropped_errors: number } {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { json, dropped_events: 0, dropped_reasons: 0, dropped_errors: 0 };
  const body = { ...(json as Record<string, unknown>) };
  let droppedEvents = 0;
  let droppedReasons = 0;
  let droppedErrors = 0;
  // Error reports are optional diagnostics: a frame that is not the plugin's own is removed, a report that is still
  // unreadable is dropped on its own, and more than the limit are cut. They never cost the sync.
  if (Array.isArray(body.errors)) {
    const kept = body.errors.slice(0, MAX_ERRORS_PER_SYNC).map((r) => {
      if (typeof r !== "object" || r === null || !Array.isArray((r as { frames?: unknown }).frames)) return r;
      const frames = (r as { frames: unknown[] }).frames.filter((f) => ErrorFrame.safeParse(f).success);
      return { ...r, frames };
    }).filter((r) => ErrorReport.safeParse(r).success);
    droppedErrors = body.errors.length - kept.length;
    body.errors = kept;
  } else if ("errors" in body && body.errors !== undefined) {
    droppedErrors = 1;
    delete body.errors;
  }
  if (Array.isArray(body.events) && body.events.length <= MAX_EVENTS_PER_SYNC) {
    const kept = body.events.filter((e) => DecisionEvent.safeParse(e).success);
    droppedEvents = body.events.length - kept.length;
    body.events = kept;
  }
  const status = body.status;
  if (typeof status === "object" && status !== null && !Array.isArray(status)) {
    const s = { ...(status as Record<string, unknown>) };
    // A newer plugin's settings snapshot may list paths this version does not offer yet; they are simply not shown.
    if (typeof s.config === "object" && s.config !== null && !Array.isArray(s.config)) {
      s.config = Object.fromEntries(Object.entries(s.config).filter(([path]) => isConfigPath(path)));
    }
    // A new failure reason on a provider reads as "no reason given" rather than losing the status.
    if (Array.isArray(s.providers)) {
      s.providers = s.providers.map((p) => (typeof p === "object" && p !== null && "last_reason" in p
        && !DetectionReason.safeParse((p as { last_reason: unknown }).last_reason).success && (p as { last_reason: unknown }).last_reason !== null
        ? { ...p, last_reason: null } : p));
    }
    body.status = s;
  }
  const counters = body.counters;
  if (typeof counters === "object" && counters !== null && !Array.isArray(counters)) {
    const reasons = (counters as Record<string, unknown>).reasons;
    if (typeof reasons === "object" && reasons !== null && !Array.isArray(reasons)) {
      const known = Object.entries(reasons).filter(([key]) => DecisionReason.safeParse(key).success);
      droppedReasons = Object.keys(reasons).length - known.length;
      body.counters = { ...counters, reasons: Object.fromEntries(known) };
    }
  }
  return { json: body, dropped_events: droppedEvents, dropped_reasons: droppedReasons, dropped_errors: droppedErrors };
}

// Commands the dashboard queues for one install. The plugin only executes
// the closed set below; anything else is rejected client side.
export const Command = z.discriminatedUnion("type", [
  // `target` is canonical (rules.ts): addresses as the plugin's IpNetwork stores them ("203.0.113.5/32"), UUIDs in
  // lower case, or a 0.5.0 selector (ASN:3320, isp:…, operator:…, country:DE, type:TOR). access_rule.remove sends
  // the same string, because the plugin removes on an exact, case-insensitive match.
  z.object({ id: CommandResult.shape.id, type: z.literal("access_rule.add"), effect: Effect, scope: Scope,
    target: z.string().min(1).max(64), note: z.string().max(128).nullable(),
    // Epoch milliseconds (UTC) after which the plugin removes the rule. Null or absent: permanent. Only sent to
    // servers that report CAPABILITY.RULE_EXPIRY; a plugin must ignore a rule whose expires_at is already past.
    expires_at: z.number().int().positive().nullable().optional() }).strict(),
  z.object({ id: CommandResult.shape.id, type: z.literal("access_rule.remove"), effect: Effect,
    target: z.string().min(1).max(64) }).strict(),
  z.object({ id: CommandResult.shape.id, type: z.literal("cache.clear"), ip: Ip.nullable() }).strict(),
  z.object({ id: CommandResult.shape.id, type: z.literal("unlink") }).strict(),
]);
export type Command = z.infer<typeof Command>;

export const SyncResponse = z.object({
  next_sync_in: z.number().int().min(5).max(3600),
  live: z.boolean(),
  claimed: z.boolean(),
  network_name: z.string().max(64).nullable(),
  link_code: InstallResponse.shape.link_code,
  link_url: InstallResponse.shape.link_url,
  accept_events: z.boolean(),
  commands: z.array(Command).max(32),
  config: DesiredConfig.nullable(),
}).strict();
export type SyncResponse = z.infer<typeof SyncResponse>;

export const ErrorResponse = z.object({
  error: z.enum(["bad_request", "unauthorized", "unsupported_protocol", "rate_limited", "payload_too_large", "internal"]),
  retry_in: z.number().int().min(5).max(86_400).nullable(),
}).strict();
export type ErrorResponse = z.infer<typeof ErrorResponse>;
