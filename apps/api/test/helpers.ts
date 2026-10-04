import { SELF, env } from "cloudflare:test";
import { installRequest, syncRequest } from "@cg/protocol/examples";
import type { InstallResponse, SyncRequest, SyncResponse } from "@cg/protocol";

export const ORIGIN = "http://localhost:8787";

export async function install(extra: Record<string, unknown> = {}): Promise<InstallResponse> {
  const res = await SELF.fetch(`${ORIGIN}/v1/installs`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...installRequest, ...extra }),
  });
  if (res.status !== 201) throw new Error(`install failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export function sync(ins: InstallResponse, body: Partial<SyncRequest> = {}, init: RequestInit = {}) {
  return SELF.fetch(`${ORIGIN}/v1/sync`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ins.install_id}.${ins.secret}`, ...(init.headers ?? {}) },
    body: init.body ?? JSON.stringify({ ...syncRequest, ...body }),
  });
}

export async function syncOk(ins: InstallResponse, body: Partial<SyncRequest> = {}): Promise<SyncResponse> {
  const res = await sync(ins, body);
  if (res.status !== 200) throw new Error(`sync failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Logs in through the dev endpoint and returns a cookie header value. */
export async function login(name = "Operator"): Promise<string> {
  const res = await SELF.fetch(`${ORIGIN}/api/auth/dev-login`, {
    method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ name }),
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

export function api(cookie: string, path: string, init: RequestInit & { json?: unknown } = {}) {
  const { json, ...rest } = init;
  return SELF.fetch(`${ORIGIN}/api${path}`, {
    ...rest,
    method: rest.method ?? (json === undefined ? "GET" : "POST"),
    headers: { cookie, origin: ORIGIN, ...(json === undefined ? {} : { "content-type": "application/json" }), ...(rest.headers ?? {}) },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
}

export async function claim(cookie: string, code: string, networkName = "Test Network") {
  return api(cookie, `/link/${code}`, {
    json: { network_name: networkName, accept_dpa: true, dpa_version: env.DPA_VERSION, turnstile_token: "test" },
  });
}
