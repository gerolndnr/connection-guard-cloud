import { describe, expect, it } from "vitest";
import { decisionEvent } from "@cg/protocol/examples";
import { explain, reasonLabel, verdict } from "../format.ts";

describe("register language", () => {
  it("pencils flagged entries on observing servers", () => {
    const e = { ...decisionEvent, mode: "OBSERVE" as const, outcome: "ALLOW" as const, reason: "FLAG_ALLOWED" as const, flags: ["VPN" as const] };
    expect(verdict(e)).toBe("would-refuse");
    expect(reasonLabel(e)).toBe("Would refuse in ENFORCE");
    expect(explain(e)).toContain("In ENFORCE mode this connection would have been refused");
  });

  it("keeps flagged-but-admitted entries in ink on enforcing servers", () => {
    const e = { ...decisionEvent, mode: "ENFORCE" as const, outcome: "ALLOW" as const, reason: "FLAG_ALLOWED" as const, flags: ["VPN" as const] };
    expect(verdict(e)).toBe("admitted");
    expect(reasonLabel(e)).toBe("Flagged, let in anyway");
  });

  it("names the provider and country behind a VPN refusal", () => {
    const e = { ...decisionEvent, mode: "ENFORCE" as const, outcome: "DENY" as const, reason: "VPN_FLAG" as const };
    expect(verdict(e)).toBe("refused");
    expect(explain(e)).toBe("Refused: proxycheck reported a VPN or proxy in Netherlands.");
  });
});

import { isPrivateIp } from "../format.ts";
import { hasQuotaKey, isConfigured, lookupsPerDay } from "../setup.ts";

describe("setup assistant logic", () => {
  const defaults = {
    "operation.mode": "OBSERVE", "provider.vpn.proxycheck.enabled": true, "provider.vpn.proxycheck.api-key": { set: false, hint: null },
    "provider.vpn.iphub.enabled": false, "provider.vpn.vpnapi.enabled": false, "behavior.geo.type": "BLACKLIST", "behavior.geo.list": [],
  };

  it("offers the assistant only to servers on the shipped defaults", () => {
    expect(isConfigured(defaults)).toBe(false);
    expect(isConfigured({ ...defaults, "operation.mode": "ENFORCE" })).toBe(true);
    expect(isConfigured({ ...defaults, "behavior.geo.list": ["CN"] })).toBe(true);
    expect(isConfigured({ ...defaults, "provider.vpn.proxycheck.api-key": { set: true, hint: "abcd" } })).toBe(true);
    expect(isConfigured(defaults, ["operation.mode"])).toBe(true);
    expect(isConfigured(null)).toBe(false);
  });

  it("knows when the free lookups can run out", () => {
    expect(hasQuotaKey(defaults)).toBe(false);
    expect(hasQuotaKey({ ...defaults, "provider.vpn.proxycheck.api-key": { set: true, hint: "abcd" } })).toBe(true);
    expect(hasQuotaKey({ ...defaults, "provider.vpn.proxycheck.enabled": false })).toBe(true);
  });

  it("extrapolates lookups for young servers", () => {
    const now = Date.now();
    expect(lookupsPerDay(0, { created_at: now - 3_600_000 }, now)).toBeNull();
    expect(lookupsPerDay(10, { created_at: now - 2 * 3_600_000 }, now)).toBe(120);
    expect(lookupsPerDay(300, { created_at: now - 72 * 3_600_000 }, now)).toBe(300);
  });

  it("recognises local test connections", () => {
    for (const ip of ["127.0.0.1", "192.168.1.20", "10.0.0.5", "172.20.1.1", "::1", "fd00::1"]) expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ["203.0.113.24", "172.32.0.1", "8.8.8.8", "2001:db8::1"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
});

import { notes } from "../health.ts";

describe("attention notes", () => {
  const install = (over: Record<string, unknown>) => ({
    id: "ins_aaaaaaaaaaaaaaaaaaaaaaaa", name: "Lobby", platform: "BUKKIT", platform_version: "Paper", plugin_version: "0.5.0", java_version: "21",
    created_at: 0, claimed_at: 0, last_seen_at: 1000, online: false, status: null, ...over,
  }) as never;

  it("gives each note a stable id and a fingerprint of the situation", () => {
    const [first] = notes([install({ last_seen_at: 1000 })], 5_000_000);
    const [again] = notes([install({ last_seen_at: 1000 })], 9_000_000);
    const [later] = notes([install({ last_seen_at: 4_000_000 })], 9_000_000);
    expect(first!.id).toBe("offline:ins_aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(again!.fingerprint).toBe(first!.fingerprint); // still the same outage: stays dismissed
    expect(later!.fingerprint).not.toBe(first!.fingerprint); // dropped out again: comes back
    expect(first!.installId).toBe("ins_aaaaaaaaaaaaaaaaaaaaaaaa");
  });
});
