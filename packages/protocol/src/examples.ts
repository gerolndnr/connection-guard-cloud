// Canonical example payloads. Used by the backend tests and written to
// fixtures/ for the Java plugin's contract tests.
import type { DecisionEvent, InstallRequest, SyncRequest, SyncResponse } from "./index.ts";

export const installRequest: InstallRequest = {
  protocol: 1,
  platform: "VELOCITY",
  platform_version: "Velocity 3.4.0-SNAPSHOT",
  plugin_version: "0.5.0",
  java_version: "21.0.4",
};

export const decisionEvent: DecisionEvent = {
  id: "6f1b6f3e-8d2a-4b8e-9c55-3f0d7c3c2a11",
  at: 1_791_100_000_000,
  platform: "VELOCITY",
  phase: "LOGIN",
  mode: "OBSERVE",
  outcome: "ALLOW",
  reason: "FLAG_ALLOWED",
  identity_trust: "AUTHENTICATED",
  uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
  ip: "203.0.113.24",
  vpn: "POSITIVE",
  geo: "KNOWN",
  flags: ["VPN"],
  duration_ms: 182,
  sources: [{
    id: "proxycheck", scope: "VPN", status: "POSITIVE", reason: "NONE", duration_ms: 171, voting: true,
    from_cache: false, country: "NL", asn: 64500, isp: "Example Hosting B.V.", risk: 88,
  }],
  rules: [],
};

export const syncRequest: SyncRequest = {
  protocol: 1,
  seq: 7,
  plugin_version: "0.5.0",
  platform_version: "Velocity 3.4.0-SNAPSHOT",
  status: {
    mode: "OBSERVE",
    uptime_seconds: 3600,
    providers: [{ id: "proxycheck", scope: "VPN", attempts: 40, successes: 39, last_reason: "TIMEOUT", paused: false,
      daily_used: 40, daily_budget: 1000 }],
    warnings: ["mode.observe"],
    config_version: null,
    cache_type: "SQLITE",
    buffered_events: 0,
    dropped_events: 0,
    config: {
      "operation.mode": "OBSERVE",
      "provider.vpn.proxycheck.enabled": true,
      "provider.vpn.proxycheck.api-key": { set: true, hint: "a1b2" },
      "behavior.geo.list": ["CN"],
    },
    managed: ["behavior.geo.list"],
    config_result: { version: 1, ok: true, message: null },
  },
  counters: {
    window_start: 1_791_099_940_000,
    window_end: 1_791_100_000_000,
    checks: 3, allowed: 3, denied: 0, errors: 0, vpn_positive: 1, geo_flagged: 0, cache_hits: 1, lookups: 2,
    latency_ms_p50: 95, latency_ms_p95: 182,
    countries: { DE: 2, NL: 1 },
    reasons: { CHECKS_COMPLETE: 2, FLAG_ALLOWED: 1 },
  },
  events: [decisionEvent],
  command_results: [],
};

export const syncResponse: SyncResponse = {
  next_sync_in: 60,
  live: false,
  claimed: true,
  network_name: "Example Network",
  link_code: null,
  link_url: null,
  accept_events: true,
  commands: [
    { id: "cmd_abcdefghijkl", type: "access_rule.add", effect: "ALLOW", scope: "VPN", target: "203.0.113.24", note: "dashboard" },
  ],
  config: {
    version: 2,
    reset: false,
    values: { "operation.mode": "ENFORCE", "behavior.geo.list": ["CN", "RU"], "provider.vpn.iphub.api-key": "testkey123" },
    keep_secrets: ["provider.vpn.proxycheck.api-key"],
  },
};
