import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { syncRequest, decisionEvent } from "@cg/protocol/examples";
import { claim, install, login, sync, syncOk } from "./helpers.ts";

describe("POST /v1/installs", () => {
  it("registers anonymously and hands out a link code", async () => {
    const ins = await install();
    expect(ins.install_id).toMatch(/^ins_/);
    expect(ins.link_code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(ins.link_url).toBe(`http://localhost:8787/link/${ins.link_code}`);
    expect(ins.claimed).toBe(false);
    const row = await env.DB.prepare("SELECT secret_hash FROM installs WHERE id = ?").bind(ins.install_id).first<{ secret_hash: string }>();
    expect(row!.secret_hash).not.toContain(ins.secret); // only the hash is stored
  });

  it("rejects unknown fields and other protocol versions", async () => {
    const bad = await fetchInstall({ protocol: 1, platform: "BUKKIT", platform_version: "x", plugin_version: "1", java_version: "8", server_ip: "1.2.3.4" });
    expect(bad.status).toBe(400);
    const v2 = await fetchInstall({ protocol: 2 });
    expect(v2.status).toBe(426);
  });
});

async function fetchInstall(body: unknown) {
  const { SELF } = await import("cloudflare:test");
  return SELF.fetch("http://localhost:8787/v1/installs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /v1/sync", () => {
  it("requires the install secret", async () => {
    const ins = await install();
    const res = await sync({ ...ins, secret: "cgs_" + "x".repeat(48) });
    expect(res.status).toBe(401);
  });

  it("drops events while unclaimed but keeps anonymous aggregates", async () => {
    const ins = await install();
    const res = await syncOk(ins);
    expect(res.claimed).toBe(false);
    expect(res.accept_events).toBe(false);
    expect(res.link_code).toBe(ins.link_code);
    const batches = await env.DB.prepare("SELECT COUNT(*) AS n FROM event_batches WHERE install_id = ?").bind(ins.install_id).first<{ n: number }>();
    expect(batches!.n).toBe(0);
    const rollup = await env.DB.prepare("SELECT checks, countries_json FROM rollups_hourly WHERE install_id = ?").bind(ins.install_id).first<{ checks: number; countries_json: string }>();
    expect(rollup!.checks).toBe(3);
    expect(JSON.parse(rollup!.countries_json)).toEqual({ DE: 2, NL: 1 });
  });

  it("stores events once claimed and never double counts a retried seq", async () => {
    const ins = await install();
    const cookie = await login();
    expect((await claim(cookie, ins.link_code!)).status).toBe(201);

    const first = await syncOk(ins, { seq: 1 });
    expect(first.claimed).toBe(true);
    expect(first.network_name).toBe("Test Network");
    await syncOk(ins, { seq: 1 }); // retry of the same request
    await syncOk(ins, { seq: 2, events: [{ ...decisionEvent, id: crypto.randomUUID(), outcome: "DENY", reason: "VPN_FLAG" }] });

    const rollup = await env.DB.prepare("SELECT SUM(checks) AS checks FROM rollups_hourly WHERE install_id = ?").bind(ins.install_id).first<{ checks: number }>();
    expect(rollup!.checks).toBe(6);
    const batches = await env.DB.prepare("SELECT event_count, denied_count FROM event_batches WHERE install_id = ? ORDER BY id").bind(ins.install_id).all<{ event_count: number; denied_count: number }>();
    expect(batches.results).toEqual([{ event_count: 1, denied_count: 0 }, { event_count: 1, denied_count: 1 }]);
  });

  it("keeps a sync from a newer plugin and drops only the events it cannot read", async () => {
    const ins = await install();
    expect((await claim(await login(), ins.link_code!)).status).toBe(201);
    const external = { ...decisionEvent, id: crypto.randomUUID(), outcome: "DENY", reason: "EXTERNAL_POLICY", flags: ["EXTERNAL_POLICY"] };
    const future = { ...decisionEvent, id: crypto.randomUUID(), reason: "SOMETHING_NEWER" };
    await syncOk(ins, { seq: 1, events: [external, future],
      counters: { ...syncRequest.counters, reasons: { EXTERNAL_POLICY: 1, SOMETHING_NEWER: 1 } } });
    const batch = await env.DB.prepare("SELECT event_count, denied_count FROM event_batches WHERE install_id = ?").bind(ins.install_id).first();
    expect(batch).toEqual({ event_count: 1, denied_count: 1 });
    const rollup = await env.DB.prepare("SELECT reasons_json FROM rollups_hourly WHERE install_id = ?").bind(ins.install_id).first<{ reasons_json: string }>();
    expect(JSON.parse(rollup!.reasons_json)).toEqual({ EXTERNAL_POLICY: 1 });
  });

  it("accepts gzip bodies", async () => {
    const ins = await install();
    const gz = new Blob([JSON.stringify(syncRequest)]).stream().pipeThrough(new CompressionStream("gzip"));
    const body = await new Response(gz).arrayBuffer();
    const res = await sync(ins, {}, { body, headers: { "content-encoding": "gzip" } });
    expect(res.status).toBe(200);
  });

  it("refuses oversized bodies", async () => {
    const ins = await install();
    const res = await sync(ins, {}, { body: "x".repeat(300 * 1024) });
    expect(res.status).toBe(413);
  });

  it("delivers queued commands and records their results", async () => {
    const ins = await install();
    const cookie = await login();
    await claim(cookie, ins.link_code!);
    await env.DB.prepare("INSERT INTO commands (id, install_id, payload_json, created_at) VALUES (?, ?, ?, ?)")
      .bind("cmd_abcdefghijkl", ins.install_id, JSON.stringify({ type: "cache.clear", ip: null }), Date.now()).run();
    const res = await syncOk(ins, { seq: 1 });
    expect(res.commands).toEqual([{ id: "cmd_abcdefghijkl", type: "cache.clear", ip: null }]);
    await syncOk(ins, { seq: 2, command_results: [{ id: "cmd_abcdefghijkl", ok: true, message: null }] });
    const after = await syncOk(ins, { seq: 3 });
    expect(after.commands).toEqual([]);
  });
});

describe("onboarding pace", () => {
  it("lets a new unlinked install and a just-linked one check in every 15 s", async () => {
    const ins = await install();
    const idle = { ...syncRequest.counters, checks: 0, lookups: 0, countries: {}, reasons: {} };
    const before = await syncOk(ins, { seq: 1, events: [], counters: idle, status: { ...syncRequest.status, buffered_events: 0 } });
    expect(before.next_sync_in).toBe(15);
    const cookie = await login();
    await claim(cookie, ins.link_code!);
    const after = await syncOk(ins, { seq: 2, events: [], counters: idle, status: { ...syncRequest.status, buffered_events: 0 } });
    expect(after.next_sync_in).toBe(15);
  });
});
