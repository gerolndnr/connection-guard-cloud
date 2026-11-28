import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { lookupRequest, lookupResponse } from "@cg/protocol/intel-examples";
import worker from "../src/index.ts";
import type { IntelCaller, IntelService } from "../src/env.ts";
import { ORIGIN, api, claim, install, login, syncOk } from "./helpers.ts";

/** A stand-in for Intel Cloud's IntelRpc entrypoint that records what apps/api passed on. */
function fakeIntel() {
  const calls: { method: string; args: unknown[] }[] = [];
  const intel: IntelService = {
    lookup: async (caller: IntelCaller, json: unknown) => { calls.push({ method: "lookup", args: [caller, json] }); return { status: 200, body: lookupResponse }; },
    contribute: async (caller, json) => { calls.push({ method: "contribute", args: [caller, json] });
      return { status: 200, body: { accepted: 1, rejected: 0, enabled: true, accept_kinds: ["punishment"], retry_in: null } }; },
    report: async (caller, uuid, _s, detail) => { calls.push({ method: "report", args: [caller, uuid, detail] }); return { status: 200, body: lookupResponse }; },
    forgetNetwork: async (id) => { calls.push({ method: "forgetNetwork", args: [id] }); return true; },
    forgetInstall: async (id) => { calls.push({ method: "forgetInstall", args: [id] }); return true; },
    info: async () => ({ offered: true, agreement_version: env.DPA_VERSION, accept_kinds: ["punishment"], sources: [{ id: "mizan", name: "Mizan", available: true }] }),
  };
  return { intel, calls };
}

async function call(path: string, init: RequestInit, intel?: IntelService) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`${ORIGIN}${path}`, init), { ...env, ...(intel ? { INTEL: intel } : {}) }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const plugin = (ins: { install_id: string; secret: string }, path: string, body: unknown, intel?: IntelService) => call(path, {
  method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ins.install_id}.${ins.secret}` }, body: JSON.stringify(body),
}, intel);

async function linked() {
  const ins = await install();
  const cookie = await login();
  const res = await claim(cookie, ins.link_code!);
  const { network_id } = await res.json() as { network_id: string };
  await syncOk(ins);
  return { ins, cookie, network_id };
}

describe("Player Intelligence through apps/api", () => {
  it("passes a linked server's lookup on with its network and install", async () => {
    const { intel, calls } = fakeIntel();
    const { ins, network_id } = await linked();
    const res = await plugin(ins, "/v1/intel/lookup", lookupRequest, intel);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(lookupResponse);
    expect(calls).toEqual([{ method: "lookup", args: [{ network_id, install_id: ins.install_id }, lookupRequest] }]);
    expect((await plugin(ins, "/v1/intel/contributions", { protocol: 1, batch_id: "b_12345678", items: [{}] }, intel)).status).toBe(200);
    expect(calls[1]!.method).toBe("contribute");
  });

  it("never passes on unlinked or unauthenticated servers", async () => {
    const { intel, calls } = fakeIntel();
    const ins = await install();
    const res = await plugin(ins, "/v1/intel/lookup", lookupRequest, intel);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not_linked", retry_in: 3600 });
    expect((await plugin({ install_id: ins.install_id, secret: "cgs_" + "x".repeat(48) }, "/v1/intel/lookup", lookupRequest, intel)).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("answers intel_unavailable without Intel Cloud (self-hosted)", async () => {
    const { ins } = await linked();
    const res = await plugin(ins, "/v1/intel/lookup", lookupRequest);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "intel_unavailable", retry_in: 86_400 });
  });

  it("lets managers switch contributing off and create and revoke network keys", async () => {
    const { intel } = fakeIntel();
    const { cookie, network_id } = await linked();
    const page = async () => (await call(`/api/networks/${network_id}/intel`, { headers: { cookie, origin: ORIGIN } }, intel)).json() as Promise<Record<string, unknown>>;
    expect(await page()).toMatchObject({ available: true, offered: true, agreement_accepted: true, contribute: true, can_manage: true, keys: [] });
    const put = await call(`/api/networks/${network_id}/intel`, { method: "PUT", headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ contribute: false }) }, intel);
    expect(put.status).toBe(200);
    expect((await page()).contribute).toBe(false);

    const created = await api(cookie, `/networks/${network_id}/intel/keys`, { json: { name: "Discord bot" } });
    expect(created.status).toBe(201);
    const { id, key } = await created.json() as { id: string; key: string };
    expect(key).toMatch(/^cgk_[A-Za-z0-9]{40}$/);
    const listed = (await page()).keys as { id: string; hint: string; revoked: boolean }[];
    expect(listed).toEqual([expect.objectContaining({ id, hint: key.slice(-4), revoked: false, name: "Discord bot" })]);
    expect(JSON.stringify(listed)).not.toContain(key);
    expect((await api(cookie, `/networks/${network_id}/intel/keys/${id}`, { method: "DELETE", json: {} })).status).toBe(200);
    expect(((await page()).keys as { revoked: boolean }[])[0]!.revoked).toBe(true);
    expect((await api(cookie, `/networks/${network_id}/intel/keys/${id}`, { method: "DELETE", json: {} })).status).toBe(404);
  });

  it("gives members a full report and keeps others out", async () => {
    const { intel, calls } = fakeIntel();
    const { cookie, network_id } = await linked();
    const uuid = "4b1c7d6e-2f3a-4c5b-9d8e-7f6a5b4c3d2e";
    const res = await call(`/api/networks/${network_id}/players/${uuid}/intel`, { headers: { cookie, origin: ORIGIN } }, intel);
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ method: "report", args: [{ network_id }, uuid, "full"] }]);
    const stranger = await login("Stranger");
    expect((await call(`/api/networks/${network_id}/players/${uuid}/intel`, { headers: { cookie: stranger, origin: ORIGIN } }, intel)).status).toBe(404);
    expect((await call(`/api/networks/${network_id}/players/nope/intel`, { headers: { cookie, origin: ORIGIN } }, intel)).status).toBe(400);
  });

  it("tells Intel Cloud when a server is unlinked or the network deleted", async () => {
    const { intel, calls } = fakeIntel();
    const { ins, cookie, network_id } = await linked();
    await call(`/api/installs/${ins.install_id}/unlink`, { method: "POST", headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, body: "{}" }, intel);
    expect(calls).toContainEqual({ method: "forgetInstall", args: [ins.install_id] });
    await call(`/api/networks/${network_id}`, { method: "DELETE", headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ confirm: "Test Network" }) }, intel);
    expect(calls).toContainEqual({ method: "forgetNetwork", args: [network_id] });
  });
});
