import { describe, expect, it } from "vitest";
import { IdentityTrust as SyncIdentityTrust } from "../src/index.ts";
import {
  Contribution, IdentityTrust, IntelContributionRequest, IntelContributionResponse, IntelLookupRequest, IntelLookupResponse,
  PlayerReport, parseContributions,
} from "../src/intel.ts";
import { PLAYER, contributionRequest, contributionResponse, fullReport, lookupRequest, lookupResponse } from "../src/intel-examples.ts";

describe("intel protocol v1", () => {
  it("accepts the canonical examples", () => {
    expect(IntelLookupRequest.parse(lookupRequest)).toEqual(lookupRequest);
    expect(IntelLookupResponse.parse(lookupResponse)).toEqual(lookupResponse);
    expect(PlayerReport.parse(fullReport)).toEqual(fullReport);
    expect(IntelContributionRequest.parse(contributionRequest)).toEqual(contributionRequest);
    expect(IntelContributionResponse.parse(contributionResponse)).toEqual(contributionResponse);
    expect(parseContributions(contributionRequest.items)).toEqual({ valid: contributionRequest.items, rejected: 0 });
  });

  it("keeps the identity values of the sync protocol", () => {
    expect(IdentityTrust.options).toEqual(SyncIdentityTrust.options);
  });

  it("defaults to summaries and bounds full reports", () => {
    expect(IntelLookupRequest.parse({ protocol: 1, uuids: [PLAYER] }).detail).toBe("summary");
    const six = Array.from({ length: 6 }, () => PLAYER);
    expect(IntelLookupRequest.safeParse({ protocol: 1, uuids: six, detail: "full" }).success).toBe(false);
    expect(IntelLookupRequest.safeParse({ protocol: 1, uuids: six, detail: "summary" }).success).toBe(true);
    expect(IntelLookupRequest.safeParse({ protocol: 1, uuids: [] }).success).toBe(false);
    expect(IntelLookupRequest.safeParse({ protocol: 2, uuids: [PLAYER] }).success).toBe(false);
  });

  it("drops single unreadable contributions instead of the batch", () => {
    const items = [...contributionRequest.items, { kind: "teleport", uuid: PLAYER }, { kind: "bot", source: "sonar", uuid: "nope", at: 1 }];
    const parsed = parseContributions(items);
    expect(parsed.valid).toHaveLength(contributionRequest.items.length);
    expect(parsed.rejected).toBe(2);
  });

  it("never carries reason texts, staff names or untagged addresses", () => {
    const ban = contributionRequest.items.find((i) => (i as Contribution).kind === "punishment") as Record<string, unknown>;
    expect(Contribution.safeParse({ ...ban, reason: "killaura" }).success).toBe(false);
    expect(Contribution.safeParse({ ...ban, staff: "Moderator" }).success).toBe(false);
    const login = contributionRequest.items[0] as Record<string, unknown>;
    expect(Contribution.safeParse({ ...login, address_class: undefined }).success).toBe(false);
    expect(Contribution.safeParse({ ...login, address: "not an address" }).success).toBe(false);
  });

  it("refuses unknown report fields so clients can rely on the schema", () => {
    expect(PlayerReport.safeParse({ ...fullReport, score: 87 }).success).toBe(false);
    expect(PlayerReport.safeParse({ ...fullReport, sections: { ...fullReport.sections, payments: {} } }).success).toBe(false);
  });
});
