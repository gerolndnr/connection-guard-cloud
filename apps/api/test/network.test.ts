import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import type { SyncResponse } from "@cg/protocol";
import { ORIGIN, api, claim, install, login, syncOk } from "./helpers.ts";
import { ruleTarget } from "../src/network.ts";
import { findAlerts } from "../src/alerts.ts";

async function linkedNetwork(owner = "Owner") {
  const ins = await install();
  const cookie = await login(owner);
  const { network_id } = await (await claim(cookie, ins.link_code!)).json<{ network_id: string }>();
  return { ins, cookie, network_id };
}

describe("access rules", () => {
  it("accepts addresses, ranges, UUIDs and ASNs only", () => {
    expect(ruleTarget("203.0.113.7")).toBe("203.0.113.7");
    expect(ruleTarget("203.0.113.0/24")).toBe("203.0.113.0/24");
    expect(ruleTarget("2001:db8::1")).toBe("2001:db8::1");
    expect(ruleTarget("069A79F4-44E9-4726-A5BE-FCA90E38AAF5")).toBe("069a79f4-44e9-4726-a5be-fca90e38aaf5");
    expect(ruleTarget("AS3320")).toBe("ASN:3320");
    expect(ruleTarget("asn:3320")).toBe("ASN:3320");
    for (const bad of ["Steve", "COUNTRY:DE", "300.1.1.1", "ASN:0", "ban-ip %IP%"]) expect(ruleTarget(bad)).toBeNull();
  });

  it("sends a rule to every server and shows where it applied", async () => {
    const { ins, cookie, network_id } = await linkedNetwork();
    const res = await api(cookie, `/networks/${network_id}/rules`, { json: { effect: "ALLOW", scope: "ALL", target: "203.0.113.7", note: "school network" } });
    expect(res.status).toBe(201);
    const { id } = await res.json<{ id: string }>();

    const delivered = await syncOk(ins, { seq: 10 });
    const cmd = delivered.commands.find((x) => x.type === "access_rule.add")!;
    expect(cmd).toMatchObject({ effect: "ALLOW", scope: "ALL", target: "203.0.113.7", note: "school network" });

    await syncOk(ins, { seq: 11, command_results: [{ id: cmd.id, ok: true, message: "Stored rule-1" }] });
    const { rules } = await (await api(cookie, `/networks/${network_id}/rules`)).json<{ rules: { id: string; servers: { state: string }[] }[] }>();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ id, servers: [{ state: "applied" }] });

    // Same rule again is not duplicated.
    expect((await (await api(cookie, `/networks/${network_id}/rules`, { json: { effect: "ALLOW", scope: "ALL", target: "203.0.113.7" } })).json<{ duplicate: boolean }>()).duplicate).toBe(true);

    expect((await api(cookie, `/networks/${network_id}/rules/${id}`, { method: "DELETE", json: {} })).status).toBe(200);
    const removal = await syncOk(ins, { seq: 12 });
    expect(removal.commands.find((x) => x.type === "access_rule.remove")).toMatchObject({ effect: "ALLOW", target: "203.0.113.7" });
    expect((await (await api(cookie, `/networks/${network_id}/rules`)).json<{ rules: unknown[] }>()).rules).toHaveLength(0);
  });

  it("rejects invalid targets and viewers", async () => {
    const { cookie, network_id } = await linkedNetwork();
    expect((await api(cookie, `/networks/${network_id}/rules`, { json: { effect: "DENY", scope: "ALL", target: "not a target" } })).status).toBe(422);
    const stranger = await login("Stranger");
    expect((await api(stranger, `/networks/${network_id}/rules`, { json: { effect: "DENY", scope: "ALL", target: "203.0.113.9" } })).status).toBe(403);
  });

  it("gives servers that join later the network's rules", async () => {
    const { cookie, network_id } = await linkedNetwork();
    await api(cookie, `/networks/${network_id}/rules`, { json: { effect: "DENY", scope: "ALL", target: "198.51.100.0/24" } });
    const second = await install();
    await api(cookie, `/link/${second.link_code}`, { json: { network_id, accept_dpa: true, dpa_version: env.DPA_VERSION, turnstile_token: "t" } });
    const res: SyncResponse = await syncOk(second, { seq: 1 });
    expect(res.commands.find((x) => x.type === "access_rule.add")).toMatchObject({ effect: "DENY", target: "198.51.100.0/24" });
  });

  it("queues a recheck that clears the cached answer for an address", async () => {
    const { ins, cookie, network_id } = await linkedNetwork();
    expect((await api(cookie, `/networks/${network_id}/recheck`, { json: { ip: "203.0.113.7" } })).status).toBe(200);
    const res = await syncOk(ins, { seq: 20 });
    expect(res.commands.find((x) => x.type === "cache.clear")).toMatchObject({ ip: "203.0.113.7" });
  });
});

describe("time-limited rules", () => {
  it("are only sent to servers that enforce the expiry", async () => {
    const { ins, cookie, network_id } = await linkedNetwork();
    // Not synced yet: the server has not said it understands expiry.
    const refused = await api(cookie, `/networks/${network_id}/rules`, { json: { effect: "ALLOW", scope: "ALL", target: "203.0.113.50", expires_in_minutes: 60 } });
    expect(refused.status).toBe(409);
    expect((await refused.json<{ error: string }>()).error).toBe("rule_expiry_unsupported");

    await syncOk(ins, { seq: 40 }); // the example status reports capabilities: ["rule_expiry"]
    const before = Date.now();
    const res = await api(cookie, `/networks/${network_id}/rules`, { json: { effect: "ALLOW", scope: "ALL", target: "203.0.113.50", expires_in_minutes: 60 } });
    expect(res.status).toBe(201);
    const body = await res.json<{ servers: number; skipped: number; expires_at: number }>();
    expect(body).toMatchObject({ servers: 1, skipped: 0 });
    expect(body.expires_at).toBeGreaterThanOrEqual(before + 60 * 60_000 - 1000);

    const delivered = await syncOk(ins, { seq: 41 });
    expect(delivered.commands.find((x) => x.type === "access_rule.add")).toMatchObject({ target: "203.0.113.50", expires_at: body.expires_at });
    const { rules } = await (await api(cookie, `/networks/${network_id}/rules`)).json<{ rules: { expires_at: number | null }[] }>();
    expect(rules[0]!.expires_at).toBe(body.expires_at);
  });

  it("permanent rules carry no expires_at, so older plugins see the same command as before", async () => {
    const { ins, cookie, network_id } = await linkedNetwork();
    await api(cookie, `/networks/${network_id}/rules`, { json: { effect: "DENY", scope: "ALL", target: "198.51.100.77" } });
    const res = await syncOk(ins, { seq: 50 });
    expect(res.commands.find((x) => x.type === "access_rule.add")).not.toHaveProperty("expires_at");
  });

  it("disappear once expired", async () => {
    const { ins, cookie, network_id } = await linkedNetwork();
    await syncOk(ins, { seq: 60 });
    const { id } = await (await api(cookie, `/networks/${network_id}/rules`, { json: { effect: "ALLOW", scope: "ALL", target: "203.0.113.60", expires_in_minutes: 5 } })).json<{ id: string }>();
    await env.DB.prepare("UPDATE access_rules SET expires_at = ? WHERE id = ?").bind(Date.now() - 1000, id).run();
    expect((await (await api(cookie, `/networks/${network_id}/rules`)).json<{ rules: unknown[] }>()).rules).toHaveLength(0);
    // An expired rule no longer blocks adding the same rule again.
    expect((await api(cookie, `/networks/${network_id}/rules`, { json: { effect: "ALLOW", scope: "ALL", target: "203.0.113.60", expires_in_minutes: 5 } })).status).toBe(201);
  });
});

describe("team", () => {
  it("invites a member once, and protects the last owner", async () => {
    const { cookie: owner, network_id } = await linkedNetwork("Owner");
    const res = await api(owner, `/networks/${network_id}/invites`, { json: { role: "admin" } });
    expect(res.status).toBe(201);
    const { url } = await res.json<{ url: string }>();
    const token = url.split("/invite/")[1]!;

    const mod = await login("Moderator");
    const preview = await (await api(mod, `/invites/${token}`)).json<{ network_name: string; role: string; member: boolean }>();
    expect(preview).toMatchObject({ role: "admin", member: false });
    expect((await api(mod, `/invites/${token}/accept`, { json: { accept_terms: true, terms_version: env.DPA_VERSION } })).status).toBe(200);
    expect((await api(mod, `/networks/${network_id}`)).status).toBe(200);
    // Used once.
    expect((await api(await login("Third"), `/invites/${token}`)).status).toBe(404);

    const { members } = await (await api(owner, `/networks/${network_id}/members`)).json<{ members: { id: string; role: string }[] }>();
    expect(members.map((m) => m.role).sort()).toEqual(["admin", "owner"]);
    const ownerId = members.find((m) => m.role === "owner")!.id;
    expect((await api(owner, `/networks/${network_id}/members/${ownerId}`, { method: "DELETE", json: {} })).status).toBe(409);
    // Admins cannot invite admins.
    expect((await api(mod, `/networks/${network_id}/invites`, { json: { role: "admin" } })).status).toBe(403);
    expect((await api(mod, `/networks/${network_id}/invites`, { json: { role: "viewer" } })).status).toBe(201);
  });
});

describe("alerts", () => {
  it("stores only Discord webhooks, and never returns them", async () => {
    const { cookie, network_id } = await linkedNetwork();
    expect((await api(cookie, `/networks/${network_id}/alerts`, { method: "PUT", json: { webhook_url: "https://evil.example/hook", kinds: [] } })).status).toBe(422);
    const hook = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789ABCD";
    const res = await api(cookie, `/networks/${network_id}/alerts`, { method: "PUT", json: { webhook_url: hook, kinds: ["server_offline", "quota_low"] } });
    expect(await res.json()).toEqual({ webhook_set: true, webhook_hint: "…ABCD", kinds: ["server_offline", "quota_low"] });
    const row = await env.DB.prepare("SELECT * FROM alert_settings WHERE network_id = ?").bind(network_id).first<Record<string, unknown>>();
    expect(JSON.stringify(row)).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("finds offline servers and low quotas", async () => {
    const { ins, network_id } = await linkedNetwork();
    const now = Date.now();
    await env.DB.prepare("UPDATE installs SET last_seen_at = ? WHERE id = ?").bind(now - 45 * 60_000, ins.install_id).run();
    const offline = await findAlerts(env, network_id, new Set(["server_offline", "quota_low"]), now);
    expect(offline.map((a) => a.kind)).toEqual(["server_offline"]);

    const status = { mode: "ENFORCE", uptime_seconds: 1, providers: [{ id: "proxycheck", scope: "VPN", attempts: 10, successes: 10, last_reason: null, paused: false, daily_used: 900, daily_budget: 1000 }],
      warnings: [], config_version: null, cache_type: "SQLITE", buffered_events: 0, dropped_events: 0, config: null, managed: [], config_result: null };
    await env.DB.prepare("UPDATE installs SET last_seen_at = ?, status_json = ? WHERE id = ?").bind(now, JSON.stringify(status), ins.install_id).run();
    const quota = await findAlerts(env, network_id, new Set(["server_offline", "quota_low", "provider_trouble"]), now);
    expect(quota.map((a) => a.kind)).toEqual(["quota_low"]);
    expect(JSON.stringify(quota)).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });
});

describe("self-service deletion", () => {
  it("deletes a network after confirming its name; servers become unlinked", async () => {
    const { ins, cookie, network_id } = await linkedNetwork();
    expect((await api(cookie, `/networks/${network_id}`, { method: "DELETE", json: { confirm: "wrong" } })).status).toBe(400);
    expect((await api(cookie, `/networks/${network_id}`, { method: "DELETE", json: { confirm: "Test Network" } })).status).toBe(200);
    const row = await env.DB.prepare("SELECT network_id FROM installs WHERE id = ?").bind(ins.install_id).first<{ network_id: string | null }>();
    expect(row!.network_id).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM networks WHERE id = ?").bind(network_id).first("n")).toBe(0);
    const res = await syncOk(ins, { seq: 30 });
    expect(res.claimed).toBe(false);
  });

  it("deletes an account and its sole-owner networks", async () => {
    const { cookie, network_id } = await linkedNetwork("Leaving");
    expect((await api(cookie, "/me", { method: "DELETE", json: { confirm: "nope" } })).status).toBe(400);
    expect((await api(cookie, "/me", { method: "DELETE", json: { confirm: "DELETE" } })).status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM networks WHERE id = ?").bind(network_id).first("n")).toBe(0);
    expect((await api(cookie, "/me")).status).toBe(401);
  });

  it("keeps a network that has another owner", async () => {
    const { cookie: first, network_id } = await linkedNetwork("First");
    const { url } = await (await api(first, `/networks/${network_id}/invites`, { json: { role: "admin" } })).json<{ url: string }>();
    const second = await login("Second");
    await api(second, `/invites/${url.split("/invite/")[1]}/accept`, { json: { accept_terms: true, terms_version: env.DPA_VERSION } });
    const { members } = await (await api(first, `/networks/${network_id}/members`)).json<{ members: { id: string; name: string }[] }>();
    await api(first, `/networks/${network_id}/members/${members.find((m) => m.name === "Second")!.id}`, { method: "PATCH", json: { role: "owner" } });
    expect((await api(first, "/me", { method: "DELETE", json: { confirm: "DELETE" } })).status).toBe(200);
    expect((await api(second, `/networks/${network_id}`)).status).toBe(200);
  });
});

it("serves the announcement without a session", async () => {
  await env.PUBLIC.put("announcement", JSON.stringify({ id: "a1", tone: "info", text: "Maintenance tonight" }));
  const res = await SELF.fetch(`${ORIGIN}/api/announcement`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ announcement: { id: "a1", tone: "info", text: "Maintenance tonight" } });
});
