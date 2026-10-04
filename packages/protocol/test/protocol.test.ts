import { describe, expect, it } from "vitest";
import { Command, InstallRequest, SyncRequest, SyncResponse, tolerateSync } from "../src/index.ts";
import { installRequest, syncRequest, syncResponse } from "../src/examples.ts";

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
