import { describe, expect, it } from "vitest";
import type { Install } from "../api.ts";
import { notes } from "../health.ts";
import { syncRequest } from "@cg/protocol/examples";

const install = (coverage?: NonNullable<Install["status"]>["vpn_unchecked_allowed"]): Install => ({
  id: "ins_coverage", name: "Lobby", platform: "VELOCITY", platform_version: "fixture", plugin_version: "0.5.2-SNAPSHOT",
  java_version: "25", created_at: 1, claimed_at: 1, last_seen_at: 1, online: true,
  status: { ...syncRequest.status, mode: "ENFORCE", vpn_unchecked_allowed: coverage },
});
const coverageNotes = (i: Install) => notes([i], 1000).filter((n) => n.id.startsWith("vpn-unchecked:"));

describe("unchecked VPN admissions", () => {
  it("shows the lifetime count, the current window and the reason without overstating unchecked connections as attacks", () => {
    const note = coverageNotes(install({ total: 52, since_summary: 52, window_seconds: 300, reasons: { BUDGET_EXHAUSTED: 52 } }))[0]!;
    expect(note.tone).toBe("action"); expect(note.title).toContain("52 logins passed without a VPN result on Lobby");
    expect(note.detail).toContain("52 since the last console summary"); expect(note.detail).toContain("budget exhausted: 52");
    expect(note.detail).toContain("intentional exceptions and refused connections are excluded");
    expect(note.detail).toContain("/cg doctor"); expect(note.fingerprint).toBe("52:true");
  });
  it("keeps the historical counter after the next zero window and only raises a new fingerprint when coverage changes", () => {
    const original = { total: 52, since_summary: 0, window_seconds: 20, reasons: { BUDGET_EXHAUSTED: 52 } };
    const note = coverageNotes(install(original))[0]!; expect(note.tone).toBe("pencil");
    expect(coverageNotes(install({ ...original, window_seconds: 100 }))[0]!.fingerprint).toBe(note.fingerprint);
    expect(coverageNotes(install({ ...original, total: 53, since_summary: 1 }))[0]!.fingerprint).not.toBe(note.fingerprint);
  });
  it("does not invent coverage for older plugins or warn for an explicitly zero counter", () => {
    expect(coverageNotes(install())).toEqual([]);
    expect(coverageNotes(install({ total: 0, since_summary: 0, window_seconds: 300, reasons: {} }))).toEqual([]);
  });
});
