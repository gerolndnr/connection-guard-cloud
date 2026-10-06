import { describe, expect, it } from "vitest";
import { sourceKey, sourceLabel } from "../sources.ts";
import { failoverCoverage, failoverOrder, fixedProviders, PROVIDERS, providersFor, usesFailover } from "../providers.ts";

describe("source names", () => {
  it("maps decision, health and extension IDs to providers", () => {
    expect(sourceKey("proxycheckvpnprovider-0")).toBe("proxycheck");
    expect(sourceKey("ipapivpnprovider-1")).toBe("ip-api");
    expect(sourceKey("geo-ipapigeoprovider")).toBe("ip-api");
    expect(sourceKey("geo-proxycheckgeoprovider")).toBe("proxycheck");
    expect(sourceKey("vpn-ipquery")).toBe("ipquery");
    expect(sourceKey("ipqualityscorevpnprovider-3")).toBe("ipqualityscore");
    expect(sourceKey("vpnapivpnprovider-2")).toBe("vpnapi");
    expect(sourceKey("torexitlist")).toBe("tor-list");
    expect(sourceLabel("torexitlist")).toBe("Tor exit list");
    expect(sourceLabel("extension-owned")).toBe("Extension owned");
    expect(sourceLabel("corporate-list")).toBe("corporate-list");
  });
});

describe("providers", () => {
  const p = (k: string) => PROVIDERS.find((x) => x.key === k)!;
  it("offers newer services only where the plugin reports their switch", () => {
    const old = { "provider.vpn.proxycheck.enabled": true };
    expect(providersFor(old).map((x) => x.key)).toEqual(["proxycheck", "iphub", "vpnapi", "ip-api"]);
    expect(providersFor({ ...old, "provider.vpn.ipquery.enabled": true }).map((x) => x.key)).toContain("ipquery");
    // IPQualityScore needs its key path as well.
    expect(providersFor({ ...old, "provider.vpn.ipqualityscore.enabled": false }).map((x) => x.key)).not.toContain("ipqualityscore");
  });

  it("knows the keyless services of 0.6 and keeps ip-check.net out of the recommended set", () => {
    const v06 = { "provider.vpn.proxycheck.enabled": true, "provider.vpn.blackbox.enabled": true, "provider.vpn.ipcheck.enabled": false, "provider.vpn.zowi.enabled": true };
    const keys = providersFor(v06).map((x) => x.key);
    expect(keys).toEqual(["proxycheck", "blackbox", "ipcheck", "zowi", "iphub", "vpnapi", "ip-api"]);
    expect(providersFor(v06).filter((x) => x.recommended).map((x) => x.key)).toEqual(["proxycheck", "blackbox", "zowi", "ip-api"]);
    expect(providersFor(v06).find((x) => x.key === "ipcheck")?.caution).toBeTruthy();
    // 0.6 runs IPQuery without a dashboard switch: it shows up from provider health as a fixed member.
    expect(fixedProviders(v06, ["proxycheck", "blackbox", "ipquery"]).map((x) => x.key)).toEqual(["ipquery"]);
    expect(failoverOrder([...providersFor(v06).filter((x) => v06[`provider.vpn.${x.key}.enabled` as keyof typeof v06]), ...fixedProviders(v06, ["ipquery"])], []).map((x) => x.key))
      .toEqual(["proxycheck", "blackbox", "zowi", "ipquery"]);
    expect(sourceLabel("blackboxvpnprovider-0")).toBe("Blackbox");
    expect(sourceLabel("vpn-ipcheck")).toBe("ip-check.net");
    expect(sourceLabel("zowivpnprovider-1")).toBe("zowi");
  });

  it("shows 0.6's services before the server's first report", () => {
    expect(providersFor(null, "0.6.0").map((x) => x.key)).toEqual(["proxycheck", "blackbox", "ipcheck", "zowi", "iphub", "vpnapi", "ip-api"]);
    expect(providersFor(null, "0.5.1").map((x) => x.key)).toEqual(["proxycheck", "iphub", "vpnapi", "ip-api"]);
  });

  it("treats a server that does not report the strategy switch by its version's default", () => {
    expect(usesFailover({}, {}, "0.6.0")).toBe(true);
    expect(usesFailover({}, {}, "0.5.1")).toBe(false);
    expect(usesFailover({ "provider.vpn-failover.enabled": false }, { "provider.vpn-failover.enabled": false }, "0.6.0")).toBe(false);
  });

  it("orders a failover chain like the plugin, IP-API last", () => {
    expect(failoverOrder([p("ip-api"), p("ipquery"), p("proxycheck")], []).map((x) => x.key)).toEqual(["proxycheck", "ipquery", "ip-api"]);
    expect(failoverOrder([p("ip-api"), p("ipquery"), p("proxycheck")], ["ip-api", "ipquery"]).map((x) => x.key)).toEqual(["ipquery", "proxycheck", "ip-api"]);
  });

  it("never adds up budgets, and only counts keyless services as an uncapped fallback", () => {
    expect(failoverCoverage([{ info: p("proxycheck"), hasKey: false }, { info: p("ipquery"), hasKey: false }]))
      .toEqual({ first: p("proxycheck"), firstLimit: 100, uncappedFallback: p("ipquery") });
    expect(failoverCoverage([{ info: p("proxycheck"), hasKey: true }, { info: p("ipqualityscore"), hasKey: true }])!.uncappedFallback).toBeNull();
  });
});

describe("source categories", () => {
  it("names what a source found, including Intel's relay and data-centre answers", async () => {
    const { sourceVerdict, typesText, sourceLabel } = await import("../sources.ts");
    expect(sourceLabel("connectionguard-intel")).toBe("Connection Guard Intel");
    expect(sourceVerdict({ status: "POSITIVE", scope: "VPN", types: ["TOR"] }).text).toBe("Tor exit");
    expect(sourceVerdict({ status: "POSITIVE", scope: "VPN", types: ["VPN", "HOSTING"] }).text).toBe("VPN");
    expect(sourceVerdict({ status: "NEGATIVE", scope: "VPN", types: ["RELAY"] })).toEqual({ text: "Privacy relay, allowed", tone: "neutral" });
    expect(sourceVerdict({ status: "UNKNOWN", scope: "VPN", types: ["HOSTING"] }).text).toBe("Data centre, not blocked");
    expect(sourceVerdict({ status: "POSITIVE", scope: "VPN" }).text).toBe("VPN / proxy");
    expect(typesText(["VPN", "PROXY"])).toBe("VPN and proxy");
  });
});
