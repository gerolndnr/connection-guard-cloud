// Typed client for apps/api/src/dashboard.ts.
import type { ConfigSnapshot, DecisionEvent, Status } from "@cg/protocol";

export class ApiError extends Error {
  constructor(public status: number, public code: string, public issues: { path: string; message: string }[] = []) { super(code); }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...rest,
    method: rest.method ?? (json === undefined ? "GET" : "POST"),
    headers: json === undefined ? rest.headers : { "content-type": "application/json", ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; issues?: { path: string; message: string }[] };
    throw new ApiError(res.status, body.error ?? "unknown", body.issues ?? []);
  }
  return res.json() as Promise<T>;
}

export type Role = "owner" | "admin" | "viewer";
export interface AppConfig {
  environment: string; discord_enabled: boolean; dev_login: boolean; turnstile_site_key: string; dpa_version: string;
  /** Empty when product analytics is off. */
  posthog_key: string; posthog_host: string;
}
export interface Me { user: { id: string; name: string; avatar: string | null }; networks: { id: string; name: string; role: Role; servers: number }[] }
export interface Install {
  id: string; name: string | null; platform: "BUKKIT" | "BUNGEE" | "VELOCITY"; platform_version: string; plugin_version: string;
  java_version: string; created_at: number; claimed_at: number | null; last_seen_at: number; online: boolean; status: Status | null;
}
export interface NetworkView { network: { id: string; name: string; retention_days: number; created_at: number }; role: Role; installs: Install[] }
export type Range = "24h" | "7d" | "30d" | "90d";
export interface Stats {
  range: Range; from: number; to: number; bucket_ms: number;
  totals: { checks: number; allowed: number; denied: number; errors: number; vpn_positive: number; geo_flagged: number; cache_hits: number; lookups: number; would_refuse: number; flagged_let_in: number; latency_p95_max: number | null; cache_hit_rate: number | null };
  series: { t: number; checks: number; denied: number; would_refuse: number; vpn_positive: number; latency_p95: number | null }[];
  countries: { key: string; value: number }[];
  reasons: { key: string; value: number }[];
  previous: { checks: number; denied: number; vpn_positive: number };
}
export type RegisterEvent = DecisionEvent & { install_id: string };
export interface LinkPreview { code: string; install: Install; since_install: { checks: number; denied: number; vpn_positive: number } }

export interface ServerConfig {
  role: Role; online: boolean; last_seen_at: number;
  effective: ConfigSnapshot | null; managed: string[]; mode: "OBSERVE" | "ENFORCE" | null;
  applied_version: number; pending: boolean; error: { version: number; message: string } | null;
  desired: { version: number; reset: boolean; values: Record<string, unknown>; secret_paths: string[]; updated_at: number; updated_by: string | null } | null;
}

export const api = {
  config: () => request<AppConfig>("/config"),
  me: () => request<Me>("/me"),
  devLogin: (name: string) => request<{ ok: true }>("/auth/dev-login", { json: { name } }),
  logout: () => request<{ ok: true }>("/auth/logout", { json: {} }),
  linkPreview: (code: string) => request<LinkPreview>(`/link/${encodeURIComponent(code)}`),
  claim: (code: string, body: { network_id?: string; network_name?: string; server_name?: string; accept_dpa: true; dpa_version: string; turnstile_token: string }) =>
    request<{ network_id: string; install_id: string }>(`/link/${encodeURIComponent(code)}`, { json: body }),
  network: (id: string) => request<NetworkView>(`/networks/${id}`),
  stats: (id: string, range: Range, install?: string) =>
    request<Stats>(`/networks/${id}/stats?range=${range}${install ? `&install=${install}` : ""}`),
  events: (id: string, params: { outcome?: string | undefined; q?: string; before?: number | undefined; limit?: number; install?: string | undefined }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
    return request<{ events: RegisterEvent[]; next_before: number | null }>(`/networks/${id}/events?${qs}`);
  },
  renameInstall: (id: string, name: string | null) => request<{ ok: true }>(`/installs/${id}`, { method: "PATCH", json: { name } }),
  unlink: (id: string) => request<{ ok: true }>(`/installs/${id}/unlink`, { json: {} }),
  serverConfig: (installId: string) => request<ServerConfig>(`/installs/${installId}/config`),
  saveConfig: (installId: string, body: { values: Record<string, unknown>; secrets: Record<string, string>; apply_to: "server" | "network" }) =>
    request<{ versions: Record<string, number> }>(`/installs/${installId}/config`, { method: "PUT", json: body }),
  resetConfig: (installId: string) => request<{ version: number }>(`/installs/${installId}/config/reset`, { json: {} }),
  createToken: (networkId: string) => request<{ token: string }>(`/networks/${networkId}/tokens`, { json: {} }),
};
