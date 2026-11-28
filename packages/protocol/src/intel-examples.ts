// Canonical Intel Cloud payloads, used by the backend tests and written to fixtures/ for the Java contract tests.
// Addresses come from the documentation ranges (RFC 5737); the UUIDs and names are made up.
import type { Contribution, IntelContributionRequest, IntelContributionResponse, IntelLookupRequest, IntelLookupResponse, PlayerReport } from "./intel.ts";

export const PLAYER = "4b1c7d6e-2f3a-4c5b-9d8e-7f6a5b4c3d2e";
export const OTHER_PLAYER = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

export const lookupRequest: IntelLookupRequest = { protocol: 1, uuids: [PLAYER, OTHER_PLAYER], detail: "summary" };
export const fullLookupRequest: IntelLookupRequest = { protocol: 1, uuids: [PLAYER], detail: "full" };

const sources = {
  crowd: { id: "crowd", name: "Linked networks", kind: "crowd", observed_at: 1_793_000_000_000, url: null },
  mizan: { id: "mizan", name: "Mizan", kind: "api", observed_at: 1_793_000_000_000, url: "https://mizan.ac/p/4b1c7d6e2f3a4c5b9d8e7f6a5b4c3d2e" },
  hypixel: { id: "hypixel", name: "Hypixel", kind: "api", observed_at: null, url: null },
} as const;

export const summaryReport: PlayerReport = {
  uuid: PLAYER,
  generated_at: 1_793_000_100_000,
  flags: [
    { code: "ban_in_force", severity: "warning", section: "punishments", text: "Banned for cheating on 1 other network, ban still in force" },
    { code: "shared_address", severity: "notice", section: "alts", text: "3 other accounts joined from the same home address in the last 30 days" },
  ],
  sections: {
    punishments: {
      status: "ok", sources: [sources.crowd, sources.mizan],
      in_force: { bans: 1, mutes: 0 }, totals: { bans: 1, mutes: 1, warns: 2, kicks: 0 },
      last_30d: 1, last_365d: 4, revoked_early: 0, networks: 1,
      categories: [{ category: "cheating", count: 2 }, { category: "chat", count: 2 }],
      detections: { anticheat_networks: 1, chat_networks: 0 }, severity: "high",
    },
    account: {
      status: "partial", sources: [sources.crowd],
      first_seen: 1_780_000_000_000, estimated_age: { at_least_since: 1_780_000_000_000, evidence: [{ source: "crowd", at: 1_780_000_000_000 }] },
      name_changes: 1, reactivated: null,
    },
    gameplay: {
      status: "pending", sources: [sources.hypixel], hypixel: null, wynncraft: null, crowd_playtime_30d: 340, anomalies: [],
    },
    alts: {
      status: "ok", sources: [sources.crowd], listed: [], evasion_networks: 0, bot_networks: 0, pool_suspected: false,
      shared_address: { accounts: 3, window_days: 30 },
    },
    servers: {
      status: "ok", sources: [sources.crowd], first_observed: 1_780_000_000_000, known_days: 41, active_days_30d: 9,
      active_days_365d: 41, networks: 2, public_servers: 0,
    },
  },
};

export const lookupResponse: IntelLookupResponse = {
  players: [summaryReport, {
    uuid: OTHER_PLAYER, generated_at: 1_793_000_100_000, flags: [],
    sections: {
      punishments: {
        status: "ok", sources: [sources.crowd, sources.mizan], in_force: { bans: 0, mutes: 0 },
        totals: { bans: 0, mutes: 0, warns: 0, kicks: 0 }, last_30d: 0, last_365d: 0, revoked_early: 0, networks: 0,
        categories: [], detections: { anticheat_networks: 0, chat_networks: 0 }, severity: "none",
      },
    },
  }],
  retry_in: 20,
};

export const fullReport: PlayerReport = {
  ...summaryReport,
  sections: {
    ...summaryReport.sections,
    punishments: {
      ...summaryReport.sections.punishments!,
      entries: [
        { origin: "crowd", source: "crowd", list_name: null, type: "ban", category: "cheating", issued_at: 1_792_900_000_000, expires_at: null, revoked_at: null, active: true },
        { origin: "public", source: "mizan", list_name: "Example Network", type: "mute", category: "chat", issued_at: 1_785_000_000_000, expires_at: 1_785_600_000_000, revoked_at: null, active: false },
      ],
    },
    account: {
      ...summaryReport.sections.account!,
      names: [{ name: "Example_Player", first_seen: 1_788_000_000_000, last_seen: 1_793_000_000_000 },
        { name: "OldExampleName", first_seen: 1_780_000_000_000, last_seen: 1_787_000_000_000 }],
      skins: [{ hash: "a".repeat(64), first_seen: 1_780_000_000_000, last_seen: 1_793_000_000_000 }],
      capes: [],
    },
    servers: { ...summaryReport.sections.servers!, public_samples: [] },
  },
};

const items: Contribution[] = [
  {
    kind: "login_observation", uuid: PLAYER, name: "Example_Player", at: 1_793_000_000_000, trust: "AUTHENTICATED",
    address: "198.51.100.23", address_class: "RESIDENTIAL",
    textures: { value: "eyJ0aW1lc3RhbXAiOjE3OTMwMDAwMDAwMDB9", signature: "c2lnbmF0dXJl" },
  },
  {
    kind: "punishment", ref: "litebans:bans:1042", source: "litebans", uuid: PLAYER, type: "ban", category: "cheating",
    issued_at: 1_793_000_050_000, expires_at: null, ip_ban: false,
  },
  { kind: "punishment_revoked", ref: "litebans:mutes:77", source: "litebans", revoked_at: 1_793_000_060_000 },
  { kind: "anticheat", source: "grimac", uuid: PLAYER, day: 1_792_972_800_000, category: "combat", violations: 37, punished: true },
  { kind: "bot", source: "sonar", uuid: OTHER_PLAYER, at: 1_793_000_070_000 },
  { kind: "chat_violation", source: "chatsentry", uuid: OTHER_PLAYER, at: 1_793_000_080_000, category: "advertising" },
  { kind: "playtime", source: "plan", uuid: PLAYER, day: 1_792_972_800_000, minutes: 95 },
];

export const contributionRequest: IntelContributionRequest = { protocol: 1, batch_id: "b_7f3a9c2e41d8", items };

export const contributionResponse: IntelContributionResponse = {
  accepted: 7, rejected: 0, enabled: true,
  accept_kinds: ["login_observation", "punishment", "punishment_revoked"],
  retry_in: null,
};
