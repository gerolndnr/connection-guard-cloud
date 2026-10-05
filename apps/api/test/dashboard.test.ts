import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { decisionEvent, syncRequest } from "@cg/protocol/examples";
import { ORIGIN, api, claim, install, login, syncOk } from "./helpers.ts";

describe("dashboard API", () => {
  it("requires a session", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/me`);
    expect(res.status).toBe(401);
  });

  it("rejects cross-origin writes", async () => {
    const cookie = await login();
    const res = await api(cookie, "/link/AAAA-BBBB", { json: {}, headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("links a server and shows its numbers since installation", async () => {
    const ins = await install();
    // 3 checks before anyone linked it, stamped "now" so the 24h range keeps covering them.
    const now = Date.now();
    await syncOk(ins, {
      counters: { ...syncRequest.counters, window_start: now - 60_000, window_end: now },
      events: [{ ...decisionEvent, at: now - 30_000 }],
    });
    const cookie = await login("Gero");

    const preview = await api(cookie, `/link/${ins.link_code!.toLowerCase().replace("-", "")}`);
    expect(preview.status).toBe(200);
    const info = await preview.json<{ since_install: { checks: number } }>();
    expect(info.since_install.checks).toBe(3);

    const res = await claim(cookie, ins.link_code!, "Gero's Network");
    expect(res.status).toBe(201);
    const { network_id } = await res.json<{ network_id: string }>();

    const me = await (await api(cookie, "/me")).json<{ networks: { id: string; role: string; servers: number }[] }>();
    expect(me.networks).toEqual([{ id: network_id, name: "Gero's Network", role: "owner", servers: 1 }]);

    const stats = await (await api(cookie, `/networks/${network_id}/stats?range=24h`)).json<{ totals: { checks: number; vpn_positive: number }; countries: unknown[] }>();
    expect(stats.totals.checks).toBe(3);
    expect(stats.totals.vpn_positive).toBe(1);
    expect(stats.countries).toEqual([{ key: "DE", value: 2 }, { key: "NL", value: 1 }]);

    const dpa = await env.DB.prepare("SELECT version FROM dpa_acceptances WHERE network_id = ?").bind(network_id).first<{ version: string }>();
    expect(dpa!.version).toBe(env.DPA_VERSION);

    // A link code works exactly once.
    expect((await claim(cookie, ins.link_code!)).status).toBe(404);
  });

  it("requires DPA acceptance", async () => {
    const ins = await install();
    const cookie = await login();
    const res = await api(cookie, `/link/${ins.link_code}`, { json: { network_name: "x", accept_dpa: false, dpa_version: env.DPA_VERSION, turnstile_token: "t" } });
    expect(res.status).toBe(400);
  });

  it("keeps networks private to their members", async () => {
    const ins = await install();
    const owner = await login("Owner");
    const { network_id } = await (await claim(owner, ins.link_code!)).json<{ network_id: string }>();
    const stranger = await login("Stranger");
    expect((await api(stranger, `/networks/${network_id}`)).status).toBe(404);
    expect((await api(stranger, `/networks/${network_id}/events`)).status).toBe(404);
    expect((await api(stranger, `/installs/${ins.install_id}/unlink`, { json: {} })).status).toBe(404);
  });

  it("lists, filters and deletes decision events", async () => {
    const ins = await install();
    const cookie = await login();
    const { network_id } = await (await claim(cookie, ins.link_code!)).json<{ network_id: string }>();
    const now = Date.now();
    await syncOk(ins, { seq: 1, events: [
      { ...decisionEvent, id: crypto.randomUUID(), at: now - 2000, ip: "198.51.100.7", outcome: "DENY", reason: "VPN_FLAG" },
      { ...decisionEvent, id: crypto.randomUUID(), at: now - 1000, ip: "192.0.2.1" },
    ] });
    const all = await (await api(cookie, `/networks/${network_id}/events`)).json<{ events: { ip: string }[] }>();
    expect(all.events.map((e) => e.ip)).toEqual(["192.0.2.1", "198.51.100.7"]);
    const denied = await (await api(cookie, `/networks/${network_id}/events?outcome=DENY`)).json<{ events: { ip: string }[] }>();
    expect(denied.events.map((e) => e.ip)).toEqual(["198.51.100.7"]);
    const search = await (await api(cookie, `/networks/${network_id}/events?q=192.0.2`)).json<{ events: unknown[] }>();
    expect(search.events).toHaveLength(1);

    expect((await api(cookie, `/installs/${ins.install_id}/unlink`, { json: {} })).status).toBe(200);
    const after = await (await api(cookie, `/networks/${network_id}/events`)).json<{ events: unknown[] }>();
    expect(after.events).toEqual([]);
    const res = await syncOk(ins, { seq: 2 });
    expect(res.claimed).toBe(false);
    expect(res.link_code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it("joins a fleet directly with a network token", async () => {
    const seed = await install();
    const cookie = await login();
    const { network_id } = await (await claim(cookie, seed.link_code!)).json<{ network_id: string }>();
    const { token } = await (await api(cookie, `/networks/${network_id}/tokens`, { json: {} })).json<{ token: string }>();
    const member = await install({ network_token: token });
    expect(member.claimed).toBe(true);
    expect(member.link_code).toBeNull();
    const net = await (await api(cookie, `/networks/${network_id}`)).json<{ installs: unknown[] }>();
    expect(net.installs).toHaveLength(2);
  });
});

describe("would-refuse", () => {
  it("filters observe-mode flagged entries server side and splits the tally by mode", async () => {
    const ins = await install();
    const cookie = await login();
    const { network_id } = await (await claim(cookie, ins.link_code!)).json<{ network_id: string }>();
    const now = Date.now();
    const { syncRequest } = await import("@cg/protocol/examples");
    await syncOk(ins, {
      seq: 1,
      status: { ...syncRequest.status, mode: "OBSERVE" },
      counters: { ...syncRequest.counters, window_end: now, reasons: { CHECKS_COMPLETE: 2, FLAG_ALLOWED: 1 } },
      events: [
        { ...decisionEvent, id: crypto.randomUUID(), at: now - 1000, mode: "OBSERVE", outcome: "ALLOW", reason: "FLAG_ALLOWED", flags: ["VPN"] },
        { ...decisionEvent, id: crypto.randomUUID(), at: now - 900, mode: "OBSERVE", outcome: "ALLOW", reason: "CHECKS_COMPLETE", flags: [] },
      ],
    });
    const would = await (await api(cookie, `/networks/${network_id}/events?outcome=WOULD_REFUSE`)).json<{ events: unknown[] }>();
    expect(would.events).toHaveLength(1);
    const stats = await (await api(cookie, `/networks/${network_id}/stats?range=24h`)).json<{ totals: { would_refuse: number; flagged_let_in: number } }>();
    expect(stats.totals.would_refuse).toBe(1);
    expect(stats.totals.flagged_let_in).toBe(0);
  });
});

describe("api host", () => {
  it("sends dashboard and sign-in requests on the API host to the app origin", async () => {
    const res = await SELF.fetch("https://api.connectionguard.net/api/auth/discord?next=%2F", { redirect: "manual" });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://app.connectionguard.net/api/auth/discord?next=%2F");
  });

  it("keeps the plugin protocol on the API host", async () => {
    const res = await SELF.fetch("https://api.connectionguard.net/v1/health");
    expect(res.status).toBe(200);
  });
});
