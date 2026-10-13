import { describe, expect, it } from "vitest";
import type { Install } from "../api.ts";
import { shouldAskForReview } from "../review.ts";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 20);
const install = (over: Partial<Install> = {}): Install => ({
  id: "ins_1", name: "Lobby", platform: "BUKKIT", platform_version: "Paper", plugin_version: "0.6.1", java_version: "21",
  created_at: now - 10 * DAY, claimed_at: now - 9 * DAY, last_seen_at: now - 60_000, online: true,
  status: { mode: "ENFORCE" } as Install["status"], ...over,
});
const base = { role: "owner" as const, installs: [install()], issues: 0, week: { checks: 500, vpn_positive: 12 }, state: null, now };

describe("review request", () => {
  it("asks once Connection Guard has done its job on a healthy setup", () => {
    expect(shouldAskForReview(base)).toBe(true);
  });
  it("waits during the first week, while observing, with open issues or before it found anything", () => {
    expect(shouldAskForReview({ ...base, installs: [install({ claimed_at: now - 3 * DAY })] })).toBe(false);
    expect(shouldAskForReview({ ...base, installs: [install({ status: { mode: "OBSERVE" } as Install["status"] })] })).toBe(false);
    expect(shouldAskForReview({ ...base, issues: 1 })).toBe(false);
    expect(shouldAskForReview({ ...base, week: { checks: 500, vpn_positive: 0 } })).toBe(false);
    expect(shouldAskForReview({ ...base, week: { checks: 40, vpn_positive: 3 } })).toBe(false);
    expect(shouldAskForReview({ ...base, installs: [install({ last_seen_at: now - 3 * DAY })] })).toBe(false);
    expect(shouldAskForReview({ ...base, role: "viewer" })).toBe(false);
  });
  it("respects the answer: later waits 30 days, a review or a no ends it", () => {
    expect(shouldAskForReview({ ...base, state: { state: "later", until: now + DAY } })).toBe(false);
    expect(shouldAskForReview({ ...base, state: { state: "later", until: now - DAY } })).toBe(true);
    expect(shouldAskForReview({ ...base, state: { state: "done" } })).toBe(false);
    expect(shouldAskForReview({ ...base, state: { state: "never" } })).toBe(false);
  });
});
