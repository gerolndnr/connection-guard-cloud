import { describe, expect, it } from "vitest";
import { decisionEvent } from "../src/examples.ts";
import { canonicalNetwork, displayNetwork, ruleKind, ruleMatchesEvent, ruleTarget } from "../src/rules.ts";

describe("rule targets in the plugin's stored form", () => {
  // Expected strings are what Java's IpNetwork.parse(x).toString() returns in plugin 0.5.0 (checked against the
  // compiled class); each is also a fixed point, so a stored target survives a round trip.
  it.each([
    ["203.0.113.5", "203.0.113.5/32"],
    ["203.0.113.77/24", "203.0.113.0/24"],
    ["10.0.0.0/8", "10.0.0.0/8"],
    ["2001:db8::1", "2001:db8:0:0:0:0:0:1/128"],
    ["2001:DB8::/32", "2001:db8:0:0:0:0:0:0/32"],
    ["::1", "0:0:0:0:0:0:0:1/128"],
    ["::ffff:198.51.100.7", "198.51.100.7/32"],
    ["::ffff:198.51.100.0/120", "198.51.100.0/24"],
    ["fe80::abcd:12/64", "fe80:0:0:0:0:0:0:0/64"],
  ])("%s → %s", (input, expected) => {
    expect(canonicalNetwork(input)).toBe(expected);
    expect(ruleTarget(input)).toBe(expected);
  });

  it("rejects what the plugin rejects", () => {
    for (const bad of ["010.0.0.1", "256.1.1.1", "1.2.3", "1.2.3.4/33", "2001:db8::1/129", "::ffff:1.2.3.4/90", "1::2::3", "example.com", "asn:0", "AS4294967296",
      "country:de1", "country:Germany", "type:CLOUD", "isp:", `isp:${"x".repeat(70)}`, "isp:bad§name", "operator:\u0007"]) {
      expect(ruleTarget(bad), bad).toBeNull();
    }
  });

  it("normalises selectors the way the plugin accepts them", () => {
    expect(ruleTarget("AS3320")).toBe("ASN:3320");
    expect(ruleTarget("asn:as24940")).toBe("ASN:24940");
    expect(ruleTarget("country:de")).toBe("country:DE");
    expect(ruleTarget("TYPE:tor")).toBe("type:TOR");
    expect(ruleTarget("isp:  Hetzner Online GmbH ")).toBe("isp:Hetzner Online GmbH");
    expect(ruleTarget("operator:Fixture VPN Company")).toBe("operator:Fixture VPN Company");
    expect(ruleTarget("069A79F4-44E9-4726-A5BE-FCA90E38AAF5")).toBe("069a79f4-44e9-4726-a5be-fca90e38aaf5");
  });

  it("knows each kind and shows addresses compactly", () => {
    expect(["203.0.113.5/32", "203.0.113.0/24", "ASN:1", "isp:x", "operator:x", "country:DE", "type:TOR", "069a79f4-44e9-4726-a5be-fca90e38aaf5", "203.0.113.5"].map(ruleKind))
      .toEqual(["ip", "range", "asn", "isp", "operator", "country", "type", "player", "ip"]);
    expect(displayNetwork("203.0.113.5/32")).toBe("203.0.113.5");
    expect(displayNetwork("2001:db8:0:0:0:0:0:1/128")).toBe("2001:db8::1");
    expect(displayNetwork("2001:db8:0:0:0:0:0:0/32")).toBe("2001:db8::/32");
  });

  it("previews a rule against recorded decisions where the evidence exists", () => {
    const e = { ...decisionEvent, ip: "198.51.100.23" };
    const asn = e.sources.find((s) => s.asn !== null)!.asn!;
    expect(ruleMatchesEvent("198.51.100.0/24", e)).toBe(true);
    expect(ruleMatchesEvent("198.51.101.0/24", e)).toBe(false);
    expect(ruleMatchesEvent(`ASN:${asn}`, e)).toBe(true);
    expect(ruleMatchesEvent("type:TOR", e)).toBeNull();
    expect(ruleMatchesEvent("operator:Anything", e)).toBeNull();
  });
});
