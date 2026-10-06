import { describe, expect, it } from "vitest";
import { sourceKey, sourceLabel } from "../sources.ts";
import { failoverCoverage, failoverOrder, PROVIDERS, providersFor } from "../providers.ts";

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
    expect(providersFor(old).map((x) => x.key)).toEqual(["proxycheck", "ip-api", "iphub", "vpnapi"]);
    expect(providersFor({ ...old, "provider.vpn.ipquery.enabled": true }).map((x) => x.key)).toContain("ipquery");
    // IPQualityScore needs its key path as well.
    expect(providersFor({ ...old, "provider.vpn.ipqualityscore.enabled": false }).map((x) => x.key)).not.toContain("ipqualityscore");
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
