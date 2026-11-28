import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { decisionEvent } from "@cg/protocol/examples";
import { NAMES_SINCE_DPA } from "../src/dpa.ts";
import { api, claim, install, login, sync, syncOk } from "./helpers.ts";

type Listed = { events: { ip: string; name?: string }[] };

async function linked(name: string) {
  const ins = await install();
  const cookie = await login(name);
  const { network_id } = await (await claim(cookie, ins.link_code!)).json<{ network_id: string }>();
  return { ins, cookie, network_id };
}

const named = (ip: string, name: string, at: number) =>
  ({ ...decisionEvent, id: crypto.randomUUID(), at, ip, uuid: null, identity_trust: "UNTRUSTED" as const, name });

describe("reported player names", () => {
  it("are stored, listed and searchable for a network on the current DPA", async () => {
    expect(env.DPA_VERSION >= NAMES_SINCE_DPA).toBe(true);
    const { ins, cookie, network_id } = await linked("NamesOwner");
    const now = Date.now();
    await syncOk(ins, { seq: 1, events: [named("192.0.2.31", "Offline_Steve", now - 2000), { ...decisionEvent, id: crypto.randomUUID(), at: now - 1000, ip: "192.0.2.32" }] });
    const all = await (await api(cookie, `/networks/${network_id}/events`)).json<Listed>();
    expect(all.events.map((e) => [e.ip, e.name])).toEqual([["192.0.2.32", undefined], ["192.0.2.31", "Offline_Steve"]]);
    const found = await (await api(cookie, `/networks/${network_id}/events`, { json: { q: "OFFLINE_st" } })).json<Listed>();
    expect(found.events.map((e) => e.ip)).toEqual(["192.0.2.31"]);
    const net = await (await api(cookie, `/networks/${network_id}`)).json<{ dpa_current: boolean }>();
    expect(net.dpa_current).toBe(true);
  });

  it("are dropped on arrival until a manager accepts the new DPA", async () => {
    const { ins, cookie, network_id } = await linked("OldTerms");
    // This network accepted only the agreement before names were covered.
    await env.DB.prepare("UPDATE dpa_acceptances SET version = '2026-10-04' WHERE network_id = ?").bind(network_id).run();
    expect((await (await api(cookie, `/networks/${network_id}`)).json<{ dpa_current: boolean }>()).dpa_current).toBe(false);

    const now = Date.now();
    await syncOk(ins, { seq: 1, events: [named("192.0.2.41", "Before_Accept", now - 3000)] });
    let listed = await (await api(cookie, `/networks/${network_id}/events`)).json<Listed>();
    expect(listed.events).toHaveLength(1);
    expect(listed.events[0]).not.toHaveProperty("name");

    expect((await api(cookie, `/networks/${network_id}/dpa`, { json: { accept_dpa: true, dpa_version: "2026-10-04" } })).status).toBe(409);
    const accept = () => api(cookie, `/networks/${network_id}/dpa`, { json: { accept_dpa: true, dpa_version: env.DPA_VERSION } });
    expect((await accept()).status).toBe(200);
    expect((await accept()).status).toBe(200);
    expect((await (await api(cookie, `/networks/${network_id}`)).json<{ dpa_current: boolean }>()).dpa_current).toBe(true);
    const audit = await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE network_id = ? AND action = 'dpa.accepted'").bind(network_id).first<number>("count");
    expect(audit).toBe(1);

    await syncOk(ins, { seq: 1, events: [named("192.0.2.41", "Before_Accept", now - 3000)] });
    await syncOk(ins, { seq: 2, events: [named("192.0.2.42", "After_Accept", now - 1000)] });
    listed = await (await api(cookie, `/networks/${network_id}/events`)).json<Listed>();
    expect(listed.events.map((e) => e.name)).toEqual(["After_Accept", undefined]);
  });

  it("can be accepted only by a manager of the network", async () => {
    const { cookie: owner, network_id } = await linked("DpaOwner");
    const stranger = await login("DpaStranger");
    expect((await api(stranger, `/networks/${network_id}/dpa`, { json: { accept_dpa: true, dpa_version: env.DPA_VERSION } })).status).toBe(404);
    const { url } = await (await api(owner, `/networks/${network_id}/invites`, { json: { role: "viewer" } })).json<{ url: string }>();
    const viewer = await login("DpaViewer");
    await api(viewer, `/invites/${url.split("/invite/")[1]}/accept`, { json: { accept_terms: true, terms_version: env.DPA_VERSION } });
    expect((await api(viewer, `/networks/${network_id}/dpa`, { json: { accept_dpa: true, dpa_version: env.DPA_VERSION } })).status).toBe(403);
    const adminInvite = await (await api(owner, `/networks/${network_id}/invites`, { json: { role: "admin" } })).json<{ url: string }>();
    const admin = await login("DpaAdmin");
    await api(admin, `/invites/${adminInvite.url.split("/invite/")[1]}/accept`, { json: { accept_terms: true, terms_version: env.DPA_VERSION } });
    await env.DB.prepare("DELETE FROM dpa_acceptances WHERE network_id = ?").bind(network_id).run();
    expect((await api(admin, `/networks/${network_id}/dpa`, { json: { accept_dpa: true, dpa_version: env.DPA_VERSION } })).status).toBe(200);
    const net = await (await api(owner, `/networks/${network_id}`)).json<{ dpa_current: boolean }>();
    expect(net.dpa_current).toBe(true);
  });

  it("keep a decision whose name is unreadable, without the name", async () => {
    const { ins, cookie, network_id } = await linked("BadNames");
    const bad = ["", "x".repeat(33), "evil\u202ename", "line\nbreak", "\ud800"];
    const now = Date.now();
    const res = await sync(ins, { seq: 1, events: bad.map((n, i) => named(`192.0.2.${51 + i}`, n, now - 4000 + i)) });
    expect(res.status).toBe(200);
    const listed = await (await api(cookie, `/networks/${network_id}/events`)).json<Listed>();
    expect(listed.events).toHaveLength(bad.length);
    for (const e of listed.events) expect(e).not.toHaveProperty("name");
  });
});
