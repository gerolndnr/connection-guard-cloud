// Connection Guard Cloud plugin protocol, version 1.
// Wire format is JSON with snake_case keys. The Java plugin mirrors these
// shapes; contract fixtures in fixtures/ are generated from this file.
import { z } from "zod";
import { ConfigResult, ConfigSnapshot, DesiredConfig } from "./config.ts";

export * from "./config.ts";

export const PROTOCOL_VERSION = 1;
export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_EVENTS_PER_SYNC = 500;

const shortText = (max: number) => z.string().min(1).max(max);
const count = z.number().int().min(0).max(1_000_000_000);

export const Platform = z.enum(["BUKKIT", "BUNGEE", "VELOCITY"]);
export const Phase = z.enum(["PRE_AUTHENTICATION", "LOGIN"]);
export const Mode = z.enum(["OBSERVE", "ENFORCE"]);
export const IdentityTrust = z.enum(["UNTRUSTED", "AUTHENTICATED", "FORWARDED", "PLATFORM_ONLINE", "FLOODGATE", "VERIFIED_FORWARDING"]);
export const Outcome = z.enum(["ALLOW", "DENY", "ERROR"]);
export const DecisionReason = z.enum(["CHECKS_COMPLETE", "FLAG_ALLOWED", "UNKNOWN_ALLOWED", "ACCESS_RULE", "LOOKUP_UNAVAILABLE",
  "OVERLOAD", "VPN_FLAG", "GEO_FLAG", "INTERNAL_ERROR", "IDENTITY_UNAVAILABLE"]);
export const Check = z.enum(["NOT_CHECKED", "EXEMPT", "POSITIVE", "NEGATIVE", "KNOWN", "UNKNOWN"]);
export const Flag = z.enum(["ACCESS_POLICY", "VPN", "GEO"]);
export const Scope = z.enum(["VPN", "GEO", "ALL"]);
export const Effect = z.enum(["DENY", "ALLOW", "EXEMPT"]);
export const Match = z.enum(["MATCH", "MISS", "UNKNOWN", "CONFLICT"]);
export const DetectionStatus = z.enum(["POSITIVE", "NEGATIVE", "UNKNOWN"]);
export const DetectionReason = z.enum(["NONE", "TIMEOUT", "RATE_LIMIT", "HTTP_ERROR", "AUTHENTICATION", "INVALID_RESPONSE",
  "NETWORK", "OVERLOADED", "CIRCUIT_OPEN", "BUDGET_EXHAUSTED", "NO_PROVIDER", "CACHE_ERROR", "CANCELLED", "NO_EVIDENCE", "STALE_DATA"]);

const SourceId = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
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
  flags: z.array(Flag).max(3),
  duration_ms: z.number().int().min(0).max(600_000),
  sources: z.array(EventSource).max(16),
  rules: z.array(EventRule).max(16),
}).strict();
export type DecisionEvent = z.infer<typeof DecisionEvent>;

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
}).strict();
export type SyncRequest = z.infer<typeof SyncRequest>;

// Commands the dashboard queues for one install. The plugin only executes
// the closed set below; anything else is rejected client side.
export const Command = z.discriminatedUnion("type", [
  z.object({ id: CommandResult.shape.id, type: z.literal("access_rule.add"), effect: Effect, scope: Scope,
    target: z.string().min(1).max(64), note: z.string().max(128).nullable() }).strict(),
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
