import { describe, expect, it } from "vitest";
import { Command, GATED_PATHS, InstallRequest, SyncRequest, SyncResponse, isConfigPath, supportsPath, tolerateSync } from "../src/index.ts";
import { installRequest, syncRequest, syncRequestWithErrors, syncResponse } from "../src/examples.ts";

describe("protocol v1", () => {
  it("accepts the canonical examples", () => {
    expect(InstallRequest.parse(installRequest)).toEqual(installRequest);
    expect(SyncRequest.parse(syncRequest)).toEqual(syncRequest);
    expect(SyncResponse.parse(syncResponse)).toEqual(syncResponse);
  });

  it("rejects unknown fields so the plugin cannot leak extra data", () => {
    expect(SyncRequest.safeParse({ ...syncRequest, player_names: ["x"] }).success).toBe(false);
    expect(SyncRequest.safeParse({ ...syncRequest, events: [{ ...syncRequest.events[0], name: "Notch" }] }).success).toBe(false);
  });

  it("accepts time-limited rules and capabilities", () => {
    const add = { id: "cmd_abcdefghijkl", type: "access_rule.add", effect: "ALLOW", scope: "ALL", target: "203.0.113.1", note: null };
    expect(Command.safeParse({ ...add, expires_at: 1791129600000 }).success).toBe(true);
    expect(Command.safeParse({ ...add, expires_at: null }).success).toBe(true);
    expect(Command.safeParse(add).success).toBe(true);
    expect(Command.safeParse({ ...add, expires_at: -1 }).success).toBe(false);
    expect(Command.safeParse({ ...add, expires_at: "1h" }).success).toBe(false);
  });

  it("accepts decisions from admission hooks of other plugins", () => {
    const event = { ...syncRequest.events[0]!, outcome: "DENY", reason: "EXTERNAL_POLICY", flags: ["EXTERNAL_POLICY"] };
    const counters = { ...syncRequest.counters, reasons: { EXTERNAL_POLICY: 2, EXTERNAL_UNAVAILABLE: 1 } };
    expect(SyncRequest.safeParse({ ...syncRequest, events: [event], counters }).success).toBe(true);
  });

  it("keeps a sync from a newer plugin, dropping only what this version cannot read", () => {
    const future = { ...syncRequest.events[0]!, reason: "SOMETHING_NEW" };
    const body = { ...syncRequest, events: [syncRequest.events[0], future],
      counters: { ...syncRequest.counters, reasons: { VPN_FLAG: 3, SOMETHING_NEW: 1 } } };
    expect(SyncRequest.safeParse(body).success).toBe(false);
    const tolerated = tolerateSync(body);
    expect(tolerated.dropped_events).toBe(1);
    expect(tolerated.dropped_reasons).toBe(1);
    const parsed = SyncRequest.parse(tolerated.json);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.counters.reasons).toEqual({ VPN_FLAG: 3 });
  });

  it("keeps a newer plugin's status: unknown settings paths and provider reasons are dropped, not fatal", () => {
    const status = {
      ...syncRequest.status,
      config: { ...syncRequest.status.config, "provider.some-future-switch": true },
      providers: [{ ...syncRequest.status.providers[0]!, last_reason: "SOMETHING_NEW" }],
    };
    const body = { ...syncRequest, status };
    expect(SyncRequest.safeParse(body).success).toBe(false);
    const parsed = SyncRequest.parse(tolerateSync(body).json);
    expect(parsed.status.config).not.toHaveProperty("provider.some-future-switch");
    expect(parsed.status.config).toHaveProperty("operation.mode");
    expect(parsed.status.providers[0]!.last_reason).toBeNull();
  });

  it("offers gated settings only to servers that report them", () => {
    expect(supportsPath({ "operation.mode": "OBSERVE" }, "operation.mode")).toBe(true);
    expect(supportsPath({ "operation.mode": "OBSERVE" }, "provider.vpn-failover.enabled")).toBe(false);
    expect(supportsPath({ "provider.vpn-failover.enabled": true }, "provider.vpn-failover.enabled")).toBe(true);
    expect(supportsPath(null, "provider.vpn.ipquery.enabled")).toBe(false);
    expect(GATED_PATHS.every((p) => isConfigPath(p))).toBe(true);
  });

  it("accepts error reports, and older syncs without them", () => {
    expect(SyncRequest.safeParse(syncRequestWithErrors).success).toBe(true);
    expect(SyncRequest.safeParse(syncRequest).success).toBe(true);
  });

  it("keeps only the plugin's own frames and drops unreadable reports one by one", () => {
    const report = syncRequestWithErrors.errors![0]!;
    const foreign = { ...report, fingerprint: "aaaaaaaaaaaaaaaa", frames: [...report.frames, { class: "org.bukkit.plugin.Foo", method: "run", line: 1 }, { class: "/home/alice/x", method: "y", line: 2 }] };
    const onlyForeign = { ...report, fingerprint: "bbbbbbbbbbbbbbbb", frames: [{ class: "net.other.Plugin", method: "run", line: 1 }] };
    const withMessage = { ...report, fingerprint: "cccccccccccccccc", message: "lookup failed for 203.0.113.9" };
    const tooMany = Array.from({ length: 12 }, (_, i) => ({ ...report, fingerprint: i.toString(16).padStart(16, "0") }));
    const t = tolerateSync({ ...syncRequest, errors: [foreign, onlyForeign, withMessage, ...tooMany] });
    const parsed = SyncRequest.parse(t.json);
    // The first ten are read: the foreign-frame report survives trimmed, the other two are dropped, then seven more.
    expect(parsed.errors!.length).toBe(8);
    expect(parsed.errors![0]!.frames.map((f) => f.class).every((c) => c.startsWith("com.github.gerolndnr.connectionguard."))).toBe(true);
    expect(JSON.stringify(parsed.errors)).not.toContain("203.0.113.9");
    expect(t.dropped_errors).toBe(15 - 8);
    expect(SyncRequest.parse(tolerateSync({ ...syncRequest, errors: "nope" }).json).errors).toBeUndefined();
  });

  it("still rejects unknown top-level and status fields after tolerating", () => {
    expect(SyncRequest.safeParse(tolerateSync({ ...syncRequest, player_names: ["x"] }).json).success).toBe(false);
    expect(SyncRequest.safeParse(tolerateSync({ ...syncRequest, status: { ...syncRequest.status, extra: 1 } }).json).success).toBe(false);
    expect(tolerateSync(null).json).toBe(null);
  });

  it("only knows a closed set of commands", () => {
    expect(Command.safeParse({ id: "cmd_abcdefghijkl", type: "console.execute", command: "op x" }).success).toBe(false);
  });

  it("caps events per sync", () => {
    const events = Array.from({ length: 501 }, () => syncRequest.events[0]!);
    expect(SyncRequest.safeParse({ ...syncRequest, events }).success).toBe(false);
  });

  it("rejects unsupported protocol versions", () => {
    expect(InstallRequest.safeParse({ ...installRequest, protocol: 2 }).success).toBe(false);
  });
});

import { ConfigValues, DesiredConfig, SECRET_PATHS } from "../src/config.ts";

describe("dashboard config", () => {
  it("never allows console commands or connection settings", () => {
    for (const path of ["behavior.vpn.execute-command.enabled", "behavior.vpn.execute-command.command", "provider.cache.type",
      "provider.cache.redis.hostname", "identity.trust-forwarded-uuid", "cloud.enabled", "cloud.endpoint"]) {
      expect(ConfigValues.safeParse({ [path]: true }).success, path).toBe(false);
    }
  });

  it("validates each field by type", () => {
    expect(ConfigValues.safeParse({ "operation.mode": "ENFORCE", "behavior.geo.list": ["CN", "RU"], "required-positive-flags": 2 }).success).toBe(true);
    expect(ConfigValues.safeParse({ "operation.mode": "BLOCK" }).success).toBe(false);
    expect(ConfigValues.safeParse({ "behavior.geo.list": ["cn"] }).success).toBe(false);
    expect(ConfigValues.safeParse({ "required-positive-flags": 0 }).success).toBe(false);
    expect(ConfigValues.safeParse({ "behavior.vpn.send-webhook.url": "http://insecure.example" }).success).toBe(false);
    expect(ConfigValues.safeParse({ "provider.vpn.iphub.api-key": "key with spaces" }).success).toBe(false);
  });

  it("keeps only secret paths", () => {
    expect(SECRET_PATHS).toContain("provider.vpn.proxycheck.api-key");
    expect(DesiredConfig.safeParse({ version: 1, reset: false, values: {}, keep_secrets: ["operation.mode"] }).success).toBe(false);
  });
});
