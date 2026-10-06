import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { syncRequest } from "@cg/protocol/examples";
import type { SyncResponse } from "@cg/protocol";
import { api, claim, install, login, syncOk } from "./helpers.ts";

async function linked() {
  const ins = await install();
  const cookie = await login("Owner");
  const { network_id } = await (await claim(cookie, ins.link_code!)).json<{ network_id: string }>();
  return { ins, cookie, network_id };
}

const status = (over: Partial<typeof syncRequest.status>) => ({ ...syncRequest.status, ...over });

describe("dashboard-managed settings", () => {
  it("delivers a saved config to the plugin, fast, and forgets the secret once applied", async () => {
    const { ins, cookie } = await linked();
    const save = await api(cookie, `/installs/${ins.install_id}/config`, {
      method: "PUT",
      json: { values: { "operation.mode": "ENFORCE", "behavior.geo.list": ["CN"] }, secrets: { "provider.vpn.iphub.api-key": "abc123" } },
    });
    expect(save.status).toBe(200);
    const { versions } = await save.json<{ versions: Record<string, number> }>();
    const version = versions[ins.install_id]!;

    const res: SyncResponse = await syncOk(ins, { seq: 1, status: status({ config_version: null, config_result: null }) });
    expect(res.config).toEqual({ version, reset: false, keep_secrets: [],
      values: { "operation.mode": "ENFORCE", "behavior.geo.list": ["CN"], "provider.vpn.iphub.api-key": "abc123" } });
    expect(res.next_sync_in).toBe(15);
    const stored = await env.DB.prepare("SELECT secrets_enc FROM install_configs WHERE install_id = ?").bind(ins.install_id).first<{ secrets_enc: unknown }>();
    expect(stored!.secrets_enc).not.toBeNull();

    const after = await syncOk(ins, { seq: 2, status: status({ config_version: version, config_result: { version, ok: true, message: null } }) });
    expect(after.config).toBeNull();
    const cleared = await env.DB.prepare("SELECT secrets_enc, applied_version FROM install_configs WHERE install_id = ?").bind(ins.install_id).first<{ secrets_enc: unknown; applied_version: number }>();
    expect(cleared).toEqual({ secrets_enc: null, applied_version: version });

    const view = await (await api(cookie, `/installs/${ins.install_id}/config`)).json<{ pending: boolean; applied_version: number; desired: { secret_paths: string[] } }>();
    expect(view.pending).toBe(false);
    expect(view.applied_version).toBe(version);
    expect(view.desired.secret_paths).toEqual(["provider.vpn.iphub.api-key"]);

    // Saving again without re-entering the key asks the plugin to keep its copy.
    await api(cookie, `/installs/${ins.install_id}/config`, { method: "PUT", json: { values: { "operation.mode": "OBSERVE" } } });
    const next = await syncOk(ins, { seq: 3, status: status({ config_version: version }) });
    expect(next.config!.keep_secrets).toEqual(["provider.vpn.iphub.api-key"]);
    expect(next.config!.values).toEqual({ "operation.mode": "OBSERVE" });
  });

  it("records a rejected config and stops resending it", async () => {
    const { ins, cookie } = await linked();
    const { versions } = await (await api(cookie, `/installs/${ins.install_id}/config`, { method: "PUT", json: { values: { "required-positive-flags": 3 } } })).json<{ versions: Record<string, number> }>();
    const v = versions[ins.install_id]!;
    await syncOk(ins, { seq: 1, status: status({ config_version: null }) });
    const res = await syncOk(ins, { seq: 2, status: status({ config_version: null, config_result: { version: v, ok: false, message: "required-positive-flags must be 1..enabled voting provider count" } }) });
    expect(res.config).toBeNull();
    const view = await (await api(cookie, `/installs/${ins.install_id}/config`)).json<{ error: { message: string } | null; pending: boolean }>();
    expect(view.pending).toBe(false);
    expect(view.error!.message).toContain("required-positive-flags");
  });

  it("refuses anything outside the allowlist, and viewers or strangers", async () => {
    const { ins, cookie } = await linked();
    const bad = await api(cookie, `/installs/${ins.install_id}/config`, { method: "PUT", json: { values: { "behavior.vpn.execute-command.command": "op x" } } });
    expect(bad.status).toBe(422);
    const secretInValues = await api(cookie, `/installs/${ins.install_id}/config`, { method: "PUT", json: { values: { "provider.vpn.iphub.api-key": "k" } } });
    expect(secretInValues.status).toBe(400);
    const stranger = await login("Stranger");
    expect((await api(stranger, `/installs/${ins.install_id}/config`)).status).toBe(404);
    expect((await api(stranger, `/installs/${ins.install_id}/config`, { method: "PUT", json: { values: {} } })).status).toBe(404);
  });

  it("resets to config.yml", async () => {
    const { ins, cookie } = await linked();
    await api(cookie, `/installs/${ins.install_id}/config`, { method: "PUT", json: { values: { "operation.mode": "ENFORCE" } } });
    const { version } = await (await api(cookie, `/installs/${ins.install_id}/config/reset`, { json: {} })).json<{ version: number }>();
    const res = await syncOk(ins, { seq: 1, status: status({ config_version: null }) });
    expect(res.config).toEqual({ version, reset: true, values: {}, keep_secrets: [] });
  });

  it("applies to every server of the network at once", async () => {
    const { ins, cookie, network_id } = await linked();
    const second = await install();
    await api(cookie, `/link/${second.link_code}`, { json: { network_id, accept_dpa: true, dpa_version: env.DPA_VERSION, turnstile_token: "t" } });
    const { versions } = await (await api(cookie, `/installs/${ins.install_id}/config`, { method: "PUT", json: { values: { "operation.mode": "ENFORCE" }, apply_to: "network" } })).json<{ versions: Record<string, number> }>();
    expect(Object.keys(versions).sort()).toEqual([ins.install_id, second.install_id].sort());
  });

  it("sends newer settings only to servers whose plugin reports them", async () => {
    const { ins, cookie, network_id } = await linked();
    const old = await install();
    await api(cookie, `/link/${old.link_code}`, { json: { network_id, accept_dpa: true, dpa_version: env.DPA_VERSION, turnstile_token: "t" } });
    // `ins` runs a plugin that offers the failover switch; `old` does not.
    await syncOk(ins, { seq: 1, status: status({ config_result: null, config: { ...syncRequest.status.config, "provider.vpn-failover.enabled": true } }) });
    await syncOk(old, { seq: 1, status: status({ config_result: null }) });

    const refused = await api(cookie, `/installs/${old.install_id}/config`, { method: "PUT", json: { values: { "provider.vpn-failover.enabled": false } } });
    expect(refused.status).toBe(422);
    expect((await refused.json<{ issues: { path: string }[] }>()).issues[0]!.path).toBe("provider.vpn-failover.enabled");

    const res = await api(cookie, `/installs/${ins.install_id}/config`, { method: "PUT",
      json: { values: { "provider.vpn-failover.enabled": false, "operation.mode": "ENFORCE" }, apply_to: "network" } });
    expect(res.status).toBe(200);
    const { skipped } = await res.json<{ skipped: Record<string, string[]> }>();
    expect(skipped).toEqual({ [old.install_id]: ["provider.vpn-failover.enabled"] });
    expect((await syncOk(ins, { seq: 2, status: status({ config_result: null }) })).config!.values).toEqual({ "provider.vpn-failover.enabled": false, "operation.mode": "ENFORCE" });
    expect((await syncOk(old, { seq: 2, status: status({ config_result: null }) })).config!.values).toEqual({ "operation.mode": "ENFORCE" });
  });
});
