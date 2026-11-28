// Intel Cloud protocol, version 1: Player Intelligence for linked servers.
//
// The plugin talks only to its configured cloud endpoint (POST /v1/intel/lookup and /v1/intel/contributions on
// apps/api), which checks the install, the link and the accepted agreement and hands the call to Intel Cloud.
// Developers use the same report through intel-cloud.connectionguard.net with a network key (cgk_...).
//
// Player Intelligence informs, it never decides: nothing in a report may deny a login by itself (privacy §8),
// and the plugin never feeds it into admission rules.
import { z } from "zod";

export const INTEL_PROTOCOL_VERSION = 1;
/** Request body limit after decompression; a full contribution batch of 500 items stays well below it. */
export const INTEL_MAX_BODY_BYTES = 512 * 1024;
export const INTEL_MAX_LOOKUP = 100;
/** Full reports (lists of names, punishments, servers) are for one player at a time, e.g. /cg player <name>. */
export const INTEL_MAX_FULL_LOOKUP = 5;
export const INTEL_MAX_CONTRIBUTIONS = 500;

const JavaUuid = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
const Ip = z.string().min(2).max(45).regex(/^[0-9a-fA-F:.]+$/);
const Ms = z.number().int().min(0).max(9_999_999_999_999);
const count = z.number().int().min(0).max(1_000_000_000);
const PlayerName = z.string().regex(/^[A-Za-z0-9_]{1,16}$/);
const SourceId = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
const Code = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/);
const Base64 = (max: number) => z.string().min(4).max(max).regex(/^[A-Za-z0-9+/]+={0,2}$/);

/** Same values as IdentityTrust in index.ts (test/intel.test.ts checks it); repeated so this file stands alone. */
export const IdentityTrust = z.enum(["UNTRUSTED", "AUTHENTICATED", "FORWARDED", "PLATFORM_ONLINE", "FLOODGATE", "VERIFIED_FORWARDING"]);
/** Identities whose UUID the server itself verified with Mojang, or got from a proxy it verified. */
export const TRUSTED_IDENTITIES: ReadonlySet<z.infer<typeof IdentityTrust>> = new Set(["AUTHENTICATED", "PLATFORM_ONLINE", "VERIFIED_FORWARDING"]);

// ---- report -------------------------------------------------------------------

export const IntelSection = z.enum(["punishments", "account", "gameplay", "alts", "servers"]);
export type IntelSection = z.infer<typeof IntelSection>;
export const INTEL_SECTIONS = IntelSection.options;

/** ok: answered; partial: some sources missing; pending: still being fetched (ask again after retry_in); unavailable: no source could answer. */
export const SectionStatus = z.enum(["ok", "partial", "pending", "unavailable"]);
export type SectionStatus = z.infer<typeof SectionStatus>;

export const SourceKind = z.enum(["api", "crowd", "crawl", "list"]);
export const SourceRef = z.object({
  id: SourceId,
  name: z.string().min(1).max(64),
  kind: SourceKind,
  /** When this source last answered for this player. */
  observed_at: Ms.nullable(),
  /** The source's own public page for this player, if it has one (https only). */
  url: z.string().regex(/^https:\/\/[^\s"<>]{1,200}$/).nullable(),
}).strict();
export type SourceRef = z.infer<typeof SourceRef>;

/** info: context; notice: worth a look; warning: staff should check before trusting the account. Never a verdict. */
export const FlagSeverity = z.enum(["info", "notice", "warning"]);
export const PlayerFlag = z.object({
  /** Stable machine code, e.g. ban_in_force. New codes appear without a protocol change; clients show `text`. */
  code: Code,
  severity: FlagSeverity,
  section: IntelSection,
  /** One English sentence for staff, e.g. "Banned for cheating on 2 other networks in the last 30 days". */
  text: z.string().min(1).max(240),
}).strict();
export type PlayerFlag = z.infer<typeof PlayerFlag>;

const SectionBase = {
  status: SectionStatus,
  sources: z.array(SourceRef).max(16),
};

export const PunishmentType = z.enum(["ban", "mute", "warn", "kick"]);
export const PunishmentCategory = z.enum(["cheating", "evasion", "chat", "griefing", "exploit", "bot", "scam", "harassment", "other", "unknown"]);
export const PunishmentSeverity = z.enum(["none", "low", "medium", "high"]);
export const PunishmentOrigin = z.enum(["crowd", "public"]);
export type PunishmentType = z.infer<typeof PunishmentType>;
export type PunishmentCategory = z.infer<typeof PunishmentCategory>;

export const PunishmentEntry = z.object({
  origin: PunishmentOrigin,
  /** For public entries the list or site (mizan, a crawled LiteBans page); crowd entries never name the network. */
  source: SourceId,
  /** The public ban list that published it (as the source names it); always null for crowd entries. */
  list_name: z.string().min(1).max(64).nullable(),
  type: PunishmentType,
  category: PunishmentCategory,
  issued_at: Ms,
  expires_at: Ms.nullable(),
  /** Lifted before it ran out. Not called an appeal: sources do not say why. */
  revoked_at: Ms.nullable(),
  active: z.boolean(),
}).strict();

export const PunishmentsSection = z.object({
  ...SectionBase,
  in_force: z.object({ bans: count, mutes: count }).strict(),
  totals: z.object({ bans: count, mutes: count, warns: count, kicks: count }).strict(),
  last_30d: count,
  last_365d: count,
  revoked_early: count,
  /** Other networks (never the asking one) that punished this player, weighted by how far they are trusted. Counts only. */
  networks: count,
  categories: z.array(z.object({ category: PunishmentCategory, count }).strict()).max(10),
  /** Other networks whose anti-cheat or chat moderation confirmed something about this player in the last 90 days. Counts only. */
  detections: z.object({ anticheat_networks: count, chat_networks: count }).strict(),
  severity: PunishmentSeverity,
  entries: z.array(PunishmentEntry).max(50).optional(),
}).strict();
export type PunishmentsSection = z.infer<typeof PunishmentsSection>;

const Seen = { first_seen: Ms, last_seen: Ms };
const TextureHash = z.string().regex(/^[0-9a-f]{1,64}$/);

export const AccountSection = z.object({
  ...SectionBase,
  /** Earliest sighting by any source. */
  first_seen: Ms.nullable(),
  /** A lower bound only: the account existed at least since then. */
  estimated_age: z.object({
    at_least_since: Ms.nullable(),
    evidence: z.array(z.object({ source: SourceId, at: Ms }).strict()).max(8),
  }).strict(),
  name_changes: count.nullable(),
  /** Back after at least a year without any sighting. */
  reactivated: z.object({ at: Ms, gap_days: z.number().int().min(365).max(20_000) }).strict().nullable(),
  names: z.array(z.object({ name: PlayerName, ...Seen }).strict()).max(50).optional(),
  /** Texture hashes as in textures.minecraft.net/texture/<hash>. */
  skins: z.array(z.object({ hash: TextureHash, ...Seen }).strict()).max(50).optional(),
  /** `name` for capes Intel Cloud knows (e.g. "Migrator"), else null. */
  capes: z.array(z.object({ hash: TextureHash, name: z.string().min(1).max(48).nullable(), ...Seen }).strict()).max(20).optional(),
}).strict();
export type AccountSection = z.infer<typeof AccountSection>;

const ratio = z.number().min(0).max(1_000_000);
export const GameplaySection = z.object({
  ...SectionBase,
  hypixel: z.object({
    first_login: Ms.nullable(),
    level: z.number().min(0).max(10_000).nullable(),
    achievement_points: count.nullable(),
    bedwars: z.object({ games: count, fkdr: ratio.nullable(), wlr: ratio.nullable() }).strict().nullable(),
    skywars: z.object({ games: count, kdr: ratio.nullable(), wlr: ratio.nullable() }).strict().nullable(),
  }).strict().nullable(),
  wynncraft: z.object({
    first_join: Ms.nullable(),
    playtime_hours: z.number().min(0).max(1_000_000).nullable(),
    total_level: count.nullable(),
  }).strict().nullable(),
  /** Minutes on linked networks in the last 30 days (Plan Player Analytics), summed over networks. */
  crowd_playtime_30d: count.nullable(),
  /** Statistics outside documented ranges, e.g. a BedWars FKDR above 20 over 100+ games. */
  anomalies: z.array(z.object({ code: Code, text: z.string().min(1).max(240) }).strict()).max(10),
}).strict();
export type GameplaySection = z.infer<typeof GameplaySection>;

export const AltsSection = z.object({
  ...SectionBase,
  /** Public alt, bot or account-pool lists that name this UUID. */
  listed: z.array(z.object({ list: SourceId, category: z.enum(["alt", "bot", "pool", "evasion"]) }).strict()).max(16),
  /** Other networks that confirmed ban evasion or a bot with this account. Counts only. */
  evasion_networks: count,
  bot_networks: count,
  pool_suspected: z.boolean(),
  /**
   * Other accounts seen from the same residential address in the last 30 days. Counts only; VPN, mobile, shared
   * and hosting addresses never count, nor addresses with more than 8 accounts. Null when there is no other account.
   */
  shared_address: z.object({ accounts: count, window_days: z.literal(30) }).strict().nullable(),
}).strict();
export type AltsSection = z.infer<typeof AltsSection>;

export const ServersSection = z.object({
  ...SectionBase,
  first_observed: Ms.nullable(),
  known_days: count,
  active_days_30d: count,
  active_days_365d: count,
  /** Linked networks the player was seen on, including the asking one. Counts only. */
  networks: count,
  /** Public server pings whose player sample listed this account. */
  public_servers: count,
  public_samples: z.array(z.object({ server: z.string().min(1).max(253), ...Seen }).strict()).max(20).optional(),
}).strict();
export type ServersSection = z.infer<typeof ServersSection>;

export const PlayerReport = z.object({
  uuid: JavaUuid,
  generated_at: Ms,
  flags: z.array(PlayerFlag).max(32),
  sections: z.object({
    punishments: PunishmentsSection.optional(),
    account: AccountSection.optional(),
    gameplay: GameplaySection.optional(),
    alts: AltsSection.optional(),
    servers: ServersSection.optional(),
  }).strict(),
}).strict();
export type PlayerReport = z.infer<typeof PlayerReport>;

// ---- lookup ---------------------------------------------------------------------

/** summary: flags and headline counts (join warnings); full: also the lists (names, entries, servers), for at most INTEL_MAX_FULL_LOOKUP players. */
export const LookupDetail = z.enum(["summary", "full"]);

export const IntelLookupRequest = z.object({
  protocol: z.literal(INTEL_PROTOCOL_VERSION),
  uuids: z.array(JavaUuid).min(1).max(INTEL_MAX_LOOKUP),
  sections: z.array(IntelSection).min(1).max(5).optional(),
  detail: LookupDetail.default("summary"),
}).strict().refine((r) => r.detail === "summary" || r.uuids.length <= INTEL_MAX_FULL_LOOKUP, { message: "full_lookup_too_large", path: ["uuids"] });
export type IntelLookupRequest = z.infer<typeof IntelLookupRequest>;

export const IntelLookupResponse = z.object({
  players: z.array(PlayerReport).max(INTEL_MAX_LOOKUP),
  /** Seconds until the pending sections are worth asking for again; null when nothing is pending. */
  retry_in: z.number().int().min(1).max(3600).nullable(),
}).strict();
export type IntelLookupResponse = z.infer<typeof IntelLookupResponse>;

// ---- contributions --------------------------------------------------------------

export const ContributionKind = z.enum(["login_observation", "punishment", "punishment_revoked", "anticheat", "bot", "chat_violation", "playtime"]);
export type ContributionKind = z.infer<typeof ContributionKind>;

/** Where the plugin read a contribution from. */
export const ContributionSource = z.enum([
  "connectionguard", "litebans", "advancedban", "libertybans", "banmanager", "grimac", "vulcan", "polar", "matrix",
  "sonar", "epicguard", "plan", "chatsentry", "other",
]);
/** The address class Connection Guard decided for the login; addresses of every class but RESIDENTIAL never link accounts. */
export const AddressClass = z.enum(["UNKNOWN", "RESIDENTIAL", "VPN", "MOBILE", "SHARED", "HOSTING", "RELAY"]);
export const AnticheatCategory = z.enum(["combat", "movement", "world", "packet", "other"]);
export const ChatCategory = z.enum(["spam", "toxicity", "advertising", "slur", "other"]);
/** A plugin's own id for an entry, hashed by Intel Cloud with the network id before it is stored. */
const Ref = z.string().regex(/^[A-Za-z0-9:_.-]{1,96}$/);

export const LoginObservation = z.object({
  kind: z.literal("login_observation"),
  uuid: JavaUuid,
  name: PlayerName,
  at: Ms,
  trust: IdentityTrust,
  /** Only for trusted identities (TRUSTED_IDENTITIES); hashed at once and never stored as such. */
  address: Ip.optional(),
  address_class: AddressClass,
  /** The `textures` property as the server received it, Mojang-signed; proves name and skin, not presence. */
  textures: z.object({ value: Base64(8192), signature: Base64(1024) }).strict().optional(),
}).strict();

export const PunishmentContribution = z.object({
  kind: z.literal("punishment"),
  ref: Ref,
  source: ContributionSource,
  uuid: JavaUuid,
  type: PunishmentType,
  /** The plugin classifies the reason; the reason text itself never leaves the Minecraft server. */
  category: PunishmentCategory,
  issued_at: Ms,
  expires_at: Ms.nullable(),
  ip_ban: z.boolean(),
}).strict();

export const PunishmentRevoked = z.object({
  kind: z.literal("punishment_revoked"),
  ref: Ref,
  source: ContributionSource,
  revoked_at: Ms,
}).strict();

export const AnticheatContribution = z.object({
  kind: z.literal("anticheat"),
  source: ContributionSource,
  uuid: JavaUuid,
  /** Start of the UTC day the violations were counted in. */
  day: Ms,
  category: AnticheatCategory,
  violations: z.number().int().min(1).max(100_000),
  /** The anti-cheat punished (kicked or banned) for it. */
  punished: z.boolean(),
}).strict();

export const BotContribution = z.object({
  kind: z.literal("bot"),
  source: ContributionSource,
  uuid: JavaUuid,
  at: Ms,
}).strict();

export const ChatViolationContribution = z.object({
  kind: z.literal("chat_violation"),
  source: ContributionSource,
  uuid: JavaUuid,
  at: Ms,
  category: ChatCategory,
}).strict();

export const PlaytimeContribution = z.object({
  kind: z.literal("playtime"),
  source: ContributionSource,
  uuid: JavaUuid,
  day: Ms,
  minutes: z.number().int().min(1).max(1440),
}).strict();

export const Contribution = z.discriminatedUnion("kind", [
  LoginObservation, PunishmentContribution, PunishmentRevoked, AnticheatContribution, BotContribution,
  ChatViolationContribution, PlaytimeContribution,
]);
export type Contribution = z.infer<typeof Contribution>;

export const IntelContributionRequest = z.object({
  protocol: z.literal(INTEL_PROTOCOL_VERSION),
  /** The plugin's id for this batch; a retried batch with the same id is accepted once. */
  batch_id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  items: z.array(z.unknown()).min(1).max(INTEL_MAX_CONTRIBUTIONS),
}).strict();
export type IntelContributionRequest = z.infer<typeof IntelContributionRequest>;

export const IntelContributionResponse = z.object({
  accepted: count,
  /** Items that did not parse or are of a kind not accepted right now; the plugin drops them, it does not retry. */
  rejected: count,
  /** False when the network opted out or contributions are paused: the plugin stops collecting until this turns true. */
  enabled: z.boolean(),
  /** Kinds Intel Cloud takes right now. Kinds missing here are not collected, so features turn on and off without a plugin release. */
  accept_kinds: z.array(ContributionKind).max(16),
  retry_in: z.number().int().min(5).max(86_400).nullable(),
}).strict();
export type IntelContributionResponse = z.infer<typeof IntelContributionResponse>;

/** Items are parsed one by one, so one item a newer plugin sends cannot lose the batch. */
export function parseContributions(items: unknown[]): { valid: Contribution[]; rejected: number } {
  const valid: Contribution[] = [];
  let rejected = 0;
  for (const item of items) {
    const parsed = Contribution.safeParse(item);
    if (parsed.success) valid.push(parsed.data); else rejected++;
  }
  return { valid, rejected };
}

// ---- errors ----------------------------------------------------------------------

export const IntelError = z.enum([
  "bad_request", "unauthorized", "forbidden", "not_found", "unsupported_protocol", "payload_too_large", "rate_limited",
  /** The server is not linked to a network; Player Intelligence is for linked servers only. */
  "not_linked",
  /** No owner or admin of the network accepted the agreement version that covers Player Intelligence yet. */
  "agreement_required",
  /** This cloud endpoint has no Intel Cloud (self-hosted), or it is switched off. */
  "intel_unavailable",
  "internal",
]);
export const IntelErrorResponse = z.object({
  error: IntelError,
  retry_in: z.number().int().min(5).max(86_400).nullable(),
}).strict();
export type IntelErrorResponse = z.infer<typeof IntelErrorResponse>;
