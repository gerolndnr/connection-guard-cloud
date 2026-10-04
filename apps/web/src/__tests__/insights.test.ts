import { describe, expect, it } from "vitest";
import type { RegisterEvent } from "../api.ts";
import { compareServices, networksBehindFlags, playersOnManyAddresses } from "../insights.ts";

type Src = RegisterEvent["sources"][number];
const src = (over: Partial<Src>): Src => ({ id: "proxycheck", scope: "VPN", status: "NEGATIVE", reason: "NONE", duration_ms: 100, voting: true, from_cache: false, country: "DE", asn: 3320, isp: "Deutsche Telekom AG", risk: null, ...over });
const ev = (over: Partial<RegisterEvent>): RegisterEvent => ({
  id: crypto.randomUUID(), install_id: "ins_x", at: 1, platform: "BUKKIT", phase: "LOGIN", mode: "ENFORCE", outcome: "ALLOW", reason: "CHECKS_COMPLETE",
  identity_trust: "AUTHENTICATED", uuid: null, ip: "203.0.113.1", vpn: "NEGATIVE", geo: "KNOWN", flags: [], duration_ms: 1, sources: [src({})], rules: [], ...over,
}) as RegisterEvent;

describe("insights", () => {
  it("groups VPN flags by network and counts clean logins from the same network", () => {
    const hetzner = { asn: 24940, isp: "Hetzner Online GmbH", country: "DE" };
    const rows = networksBehindFlags([
      ev({ outcome: "DENY", reason: "VPN_FLAG", flags: ["VPN"], sources: [src({ ...hetzner, status: "POSITIVE" })] }),
      ev({ mode: "OBSERVE", flags: ["VPN"], sources: [src({ ...hetzner, status: "POSITIVE" })] }),
      ev({ sources: [src(hetzner)] }),
      ev({}),
    ]);
    expect(rows).toEqual([{ asn: 24940, isp: "Hetzner Online GmbH", flagged: 2, refused: 2, clean: 1, countries: ["DE"] }]);
  });

  it("lists verified players on three or more addresses, never unverified names", () => {
    const uuid = "069a79f4-44e9-4726-a5be-fca90e38aaf5";
    const events = ["203.0.113.1", "203.0.113.2", "198.51.100.3", "198.51.100.3"].map((ip, i) => ev({ uuid, ip, at: i }));
    events.push(...["192.0.2.1", "192.0.2.2", "192.0.2.3"].map((ip) => ev({ uuid: "11111111-1111-1111-1111-111111111111", ip, identity_trust: "UNTRUSTED" })));
    expect(playersOnManyAddresses(events)).toEqual([{ uuid, addresses: 3, countries: ["DE"], refused: 0, logins: 4, last: 3 }]);
  });

  it("compares services and counts disagreement only where both answered", () => {
    const rows = compareServices([
      ev({ sources: [src({ id: "proxycheck", status: "POSITIVE", duration_ms: 300 }), src({ id: "iphub", status: "NEGATIVE", duration_ms: 100 })] }),
      ev({ sources: [src({ id: "proxycheck", status: "NEGATIVE", duration_ms: 100 }), src({ id: "iphub", status: "UNKNOWN" })] }),
      ev({ sources: [src({ id: "proxycheck", status: "NEGATIVE", from_cache: true }), src({ id: "ip-api", scope: "GEO" })] }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["proxycheck", "iphub"]);
    expect(rows[0]).toMatchObject({ asked: 3, answered: 3, positive: 1, cached: 1, comparable: 1, disagreed: 1, medianMs: 100 });
    expect(rows[1]).toMatchObject({ asked: 2, answered: 1, comparable: 1, disagreed: 1, medianMs: 100 });
  });
});
