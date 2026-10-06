import { describe, expect, it } from "vitest";
import type { RegisterEvent } from "../api.ts";
import { simulate } from "../simulate.ts";

const ev = (over: Partial<RegisterEvent> & { country?: string; hits?: boolean[] }): RegisterEvent => {
  const { country = "DE", hits = [false], ...rest } = over;
  return {
    id: crypto.randomUUID(), install_id: "ins_x", at: 0, platform: "BUKKIT", phase: "LOGIN", mode: "ENFORCE", outcome: "ALLOW",
    reason: "CHECKS_COMPLETE", identity_trust: "AUTHENTICATED", uuid: null, ip: "203.0.113.1", vpn: "NEGATIVE", geo: "KNOWN", flags: [], duration_ms: 1,
    sources: [
      ...hits.map((pos, i) => ({ id: ["proxycheck", "iphub"][i]!, scope: "VPN" as const, status: pos ? "POSITIVE" as const : "NEGATIVE" as const, reason: "NONE" as const, duration_ms: 1, voting: true, from_cache: false, country: null, asn: null, isp: null, risk: null })),
      { id: "ip-api", scope: "GEO" as const, status: "NEGATIVE" as const, reason: "NONE" as const, duration_ms: 1, voting: false, from_cache: false, country, asn: null, isp: null, risk: null },
    ],
    rules: [], ...rest,
  } as RegisterEvent;
};
const base = { "operation.mode": "ENFORCE", "provider.vpn.proxycheck.enabled": true, "required-positive-flags": 1, "behavior.vpn.kick-player": true,
  "behavior.geo.kick-player": true, "behavior.geo.type": "BLACKLIST", "behavior.geo.list": [] as string[], "provider.geo.service": "IP-API" };

describe("simulate", () => {
  it("counts who a new country rule would refuse", () => {
    const r = simulate([ev({ country: "RU" }), ev({ country: "DE" }), ev({ country: "RU" })], { ...base, "behavior.geo.list": ["RU"] });
    expect(r).toMatchObject({ total: 3, refusedBefore: 0, refusedAfter: 2 });
    expect(r.changed.map((c) => c.why)).toEqual(["Country RU", "Country RU"]);
  });

  it("leaves other plugins' admission decisions as they were", () => {
    const refused = ev({ country: "RU", outcome: "DENY", reason: "EXTERNAL_POLICY", flags: ["EXTERNAL_POLICY"] });
    const r = simulate([refused, ev({ country: "RU", reason: "EXTERNAL_UNAVAILABLE" })], { ...base, "operation.mode": "OBSERVE" });
    expect(r).toMatchObject({ total: 2, refusedBefore: 1, refusedAfter: 1, changed: [] });
  });

  it("an empty allowlist refuses everyone", () => {
    expect(simulate([ev({}), ev({ country: "US" })], { ...base, "behavior.geo.type": "WHITELIST" }).refusedAfter).toBe(2);
  });

  it("raising the vote threshold lets single-provider hits in, and flags unknown votes", () => {
    const flagged = ev({ hits: [true], outcome: "DENY", reason: "VPN_FLAG", flags: ["VPN"] });
    const r = simulate([flagged], { ...base, "provider.vpn.iphub.enabled": true, "required-positive-flags": 2 });
    expect(r).toMatchObject({ refusedBefore: 1, refusedAfter: 0, unknown: 1 });
  });

  it("observe mode refuses nothing, and access rules are kept", () => {
    const ruled = ev({ outcome: "DENY", reason: "ACCESS_RULE" });
    const r = simulate([ruled, ev({ hits: [true] })], { ...base, "operation.mode": "OBSERVE" });
    expect(r).toMatchObject({ refusedBefore: 1, refusedAfter: 1 });
  });

  it("exemptions by IP or verified UUID win", () => {
    const uuid = "069a79f4-44e9-4726-a5be-fca90e38aaf5";
    const r = simulate([ev({ hits: [true], uuid }), ev({ hits: [true], ip: "198.51.100.9" })], { ...base, "behavior.vpn.exemptions": [uuid, "198.51.100.9"] });
    expect(r.refusedAfter).toBe(0);
  });
});

describe("simulate with real plugin source IDs", () => {
  const real = (ids: [string, boolean][]): RegisterEvent => ({
    ...ev({ outcome: "DENY", reason: "VPN_FLAG", flags: ["VPN"] }),
    sources: ids.map(([id, pos]) => ({ id, scope: "VPN" as const, status: pos ? "POSITIVE" as const : "NEGATIVE" as const, reason: "NONE" as const,
      duration_ms: 1, voting: true, from_cache: false, country: null, asn: null, isp: null, risk: null })),
  });

  it("matches class-named sources to the provider switches", () => {
    const e = real([["proxycheckvpnprovider-0", true], ["ipapivpnprovider-1", false]]);
    const both = { ...base, "provider.vpn.ip-api.enabled": true, "required-positive-flags": 2 };
    expect(simulate([e], { ...base, "provider.vpn.ip-api.enabled": true })).toMatchObject({ refusedAfter: 1, unknown: 0 });
    expect(simulate([e], both)).toMatchObject({ refusedAfter: 0, unknown: 0 });
  });

  it("a failover chain needs one positive answer, whatever the stored vote count", () => {
    const e = real([["proxycheckvpnprovider-0", true]]);
    const v = { ...base, "provider.vpn.ipquery.enabled": true, "required-positive-flags": 2, "provider.vpn-failover.enabled": true };
    expect(simulate([e], v)).toMatchObject({ refusedAfter: 1, unknown: 0 });
  });
});
