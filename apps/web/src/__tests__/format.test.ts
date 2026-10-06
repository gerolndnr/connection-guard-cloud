import { describe, expect, it } from "vitest";
import { decisionEvent } from "@cg/protocol/examples";
import { configErrorHint, explain, reasonLabel, verdict, versionAtLeast } from "../format.ts";

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
    expect(explain(e)).toBe("Refused: ProxyCheck reported a VPN or proxy in Netherlands.");
  });

  it("names class-named sources and the server's own Tor list", () => {
    const src = decisionEvent.sources[0]!;
    const named = { ...decisionEvent, mode: "ENFORCE" as const, outcome: "DENY" as const, reason: "VPN_FLAG" as const,
      sources: [{ ...src, id: "proxycheckvpnprovider-0" }, { ...src, id: "ipapivpnprovider-1" }] };
    expect(explain(named)).toBe("Refused: ProxyCheck and IP-API reported a VPN or proxy in Netherlands.");
    const tor = { ...named, sources: [{ ...src, id: "torexitlist", country: null }] };
    expect(explain(tor)).toContain("Tor exit list the server keeps itself");
  });

  it("says which list Intel found an address on, and from when", () => {
    const src = decisionEvent.sources[0]!;
    const intel = { ...decisionEvent, mode: "ENFORCE" as const, outcome: "DENY" as const, reason: "VPN_FLAG" as const,
      sources: [{ ...src, id: "connectionguard-intel", country: null, types: ["VPN" as const, "HOSTING" as const], data_as_of: Date.UTC(2026, 9, 6) }] };
    expect(explain(intel)).toMatch(/^Refused: Connection Guard Intel listed the address as a VPN \(data from .*6 Oct\)\.$/);
    const relay = { ...decisionEvent, mode: "ENFORCE" as const, outcome: "ALLOW" as const, reason: "CHECKS_COMPLETE" as const, flags: [],
      sources: [{ ...src, id: "connectionguard-intel", status: "NEGATIVE" as const, types: ["RELAY" as const] }] };
    expect(explain(relay)).toContain("privacy relay");
  });

  it("explains changes a server refuses because a local policy version owns its decisions", () => {
    expect(configErrorHint("Local policy owns decision settings; release its revision before changing config/dashboard policy (values redacted).")!.command).toBe("/cg policy status");
    expect(configErrorHint("Setting cannot be set from the dashboard (path/value redacted).")!.text).toContain("Update the plugin");
    expect(configErrorHint("required-positive-flags must be 1..3")).toBeNull();
  });

  it("compares plugin versions, counting development builds as their version", () => {
    expect(versionAtLeast("0.5.2-SNAPSHOT", "0.5.2")).toBe(true);
    expect(versionAtLeast("0.5.10", "0.5.2")).toBe(true);
    expect(versionAtLeast("0.5.1", "0.5.2")).toBe(false);
    expect(versionAtLeast("1.0.0", "0.5.2")).toBe(true);
  });

  it("attributes refusals by another plugin's admission check to that plugin", () => {
    const e = { ...decisionEvent, mode: "ENFORCE" as const, outcome: "DENY" as const, reason: "EXTERNAL_POLICY" as const, flags: ["EXTERNAL_POLICY" as const] };
    expect(reasonLabel(e)).toBe("Refused by another plugin");
    expect(explain(e)).toContain("another plugin on this server");
    const observed = { ...e, mode: "OBSERVE" as const, outcome: "ALLOW" as const };
    expect(explain(observed)).toContain("found a refusal by another plugin");
    const unavailable = { ...e, reason: "EXTERNAL_UNAVAILABLE" as const, flags: [] };
    expect(explain(unavailable)).toContain("CLOSED");
    expect(explain({ ...unavailable, outcome: "ALLOW" as const })).toContain("lets such players in");
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
    // 0.6 enforces on new installs by default: enforcing alone is no choice there.
    const v06 = { ...defaults, "operation.mode": "ENFORCE", "provider.vpn.blackbox.enabled": true, "provider.vpn.zowi.enabled": true };
    expect(isConfigured(v06)).toBe(false);
    expect(hasQuotaKey(v06)).toBe(true);
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

import { notes, providers, providerProblem } from "../health.ts";

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

import { PROVIDERS, dailyCapacity, isValidKey } from "../providers.ts";

describe("provider selection", () => {
  const p = (k: string) => PROVIDERS.find((x) => x.key === k)!;
  it("is limited by the smallest daily cap, since every service checks every new IP", () => {
    expect(dailyCapacity([{ info: p("proxycheck"), hasKey: false }])).toMatchObject({ limit: 100, keyless: true });
    expect(dailyCapacity([{ info: p("proxycheck"), hasKey: true }, { info: p("iphub"), hasKey: true }])).toMatchObject({ limit: 1000 });
    expect(dailyCapacity([{ info: p("proxycheck"), hasKey: false }, { info: p("iphub"), hasKey: true }])!.by.key).toBe("proxycheck");
    expect(dailyCapacity([{ info: p("ip-api"), hasKey: false }])).toBeNull();
  });
  it("accepts only plausible keys", () => {
    expect(isValidKey("abc123-DEF_4")).toBe(true);
    expect(isValidKey("has space")).toBe(false);
    expect(isValidKey("")).toBe(false);
  });
});


describe("provider outage visibility", () => {
  const server = (provider: Record<string, unknown>) => ({ online: true, status: { providers: [{ id: "ProxyCheckVpnProvider", scope: "VPN", attempts: 100, successes: 100, paused: false, last_reason: "NONE", daily_used: 10, daily_budget: 1000, ...provider }] } }) as never;
  it("shows remote quota exhaustion even with successful historical requests and no pause", () => {
    const installs = [server({ last_reason: "BUDGET_EXHAUSTED" })];
    expect(providerProblem(providers(installs)[0]!)).toBe("Quota exhausted");
    expect(notes(installs, 0)[0]).toMatchObject({ id: "quota:ProxyCheckVpnProvider", tone: "action" });
    expect(notes(installs, 0)[0]!.detail).toContain("not the provider account's remaining balance");
  });
  it("retains the worst state regardless of server order", () => {
    const bad = server({ last_reason: "BUDGET_EXHAUSTED" }), good = server({});
    for (const order of [[bad, good], [good, bad]]) expect(providerProblem(providers(order)[0]!)).toBe("Quota exhausted");
  });
  it("does not hide one exhausted local budget inside a healthy network sum", () => {
    const row = providers([server({ daily_budget: 100, daily_used: 100 }), server({})])[0]!;
    expect(row.daily_used! / row.daily_budget!).toBeLessThan(0.8);
    expect(providerProblem(row)).toBe("Quota exhausted");
  });
  it("redisplays a dismissed low-budget note when the quota becomes exhausted", () => {
    const low = notes([server({ daily_used: 900 })], 0)[0]!;
    const exhausted = notes([server({ daily_used: 1000 })], 0)[0]!;
    expect(exhausted.id).toBe(low.id);
    expect(exhausted.fingerprint).not.toBe(low.fingerprint);
  });
  it("labels open circuits and authentication failures without claiming quotas are empty", () => {
    expect(providerProblem(providers([server({ last_reason: "CIRCUIT_OPEN" })])[0]!)).toBe("Circuit open");
    expect(providerProblem(providers([server({ last_reason: "AUTHENTICATION" })])[0]!)).toBe("Credentials rejected");
    expect(providerProblem(providers([server({})])[0]!)).toBeNull();
  });
});

describe("plugin error notes", () => {
  const now = 1_791_300_000_000;
  const err = { fingerprint: "3f9c0a1b2d4e5f60", type: "java.lang.IllegalStateException", cause_type: "java.net.SocketTimeoutException",
    context: "LOOKUP" as const, top_frame: "IpQueryVpnProvider.parse:88", plugin_version: "0.5.2", count: 37, first_at: now - 7_200_000, last_at: now - 600_000 };
  const install = { id: "ins_x", name: "Lobby", platform: "BUKKIT" as const, platform_version: "Paper 1.21.11-132", plugin_version: "0.5.2",
    java_version: "21", created_at: 0, claimed_at: 0, last_seen_at: now, online: true, status: null };

  it("raises recent errors, red while they still happen, and prefills a report without player data", () => {
    const [n] = notes([{ ...install, errors: [err] }], now).filter((x) => x.id.startsWith("error:"));
    expect(n).toMatchObject({ tone: "action", title: "Lobby: IllegalStateException during lookups", command: "/cg doctor" });
    expect(n!.detail).toContain("37 times");
    const url = decodeURIComponent(n!.link!.href);
    expect(url).toContain("IpQueryVpnProvider.parse:88");
    expect(url).toContain("3f9c0a1b2d4e5f60");
    expect(notes([{ ...install, errors: [{ ...err, last_at: now - 2 * 3_600_000 }] }], now).find((x) => x.id.startsWith("error:"))!.tone).toBe("pencil");
    expect(notes([{ ...install, errors: [{ ...err, last_at: now - 2 * 86_400_000 }] }], now).some((x) => x.id.startsWith("error:"))).toBe(false);
  });
});
