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
  /** Last 7 days, newest first; only in the network view. */
  errors?: InstallError[];
}
/** One of Connection Guard's own errors as a linked server reported it (plugin 0.5.2+), added up per fingerprint. */
export interface InstallError {
  fingerprint: string; type: string; cause_type: string | null; context: "STARTUP" | "RELOAD" | "LOOKUP" | "CACHE" | "SYNC" | "COMMAND" | "OTHER";
  top_frame: string; plugin_version: string; count: number; first_at: number; last_at: number;
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

export type RuleEffect = "ALLOW" | "DENY" | "EXEMPT";
export type RuleScope = "VPN" | "GEO" | "ALL";
export interface AccessRuleView {
  id: string; effect: RuleEffect; scope: RuleScope; target: string; note: string | null; created_at: number; created_by_name: string | null;
  /** Epoch ms when the rule ends; null: permanent. */
  expires_at: number | null;
  servers: { install_id: string; state: "pending" | "delivered" | "applied" | "failed"; message: string | null }[];
}
export interface Member { id: string; name: string; avatar: string | null; role: Role; created_at: number; you: boolean }
export interface InviteView { id: string; role: "admin" | "viewer"; created_at: number; expires_at: number; created_by_name: string | null }
export interface InvitePreview { network_name: string; network_id: string; role: "admin" | "viewer"; invited_by: string | null; expires_at: number; member: boolean }
export type AlertKind = "server_offline" | "provider_trouble" | "quota_low" | "refusal_spike" | "weekly_digest";
export interface AlertSettings { webhook_set: boolean; webhook_hint: string | null; kinds: AlertKind[] }
export interface ActivityEntry { action: string; at: number; user_name: string | null; detail: Record<string, unknown> }
export interface Announcement { id: string; tone?: "info" | "warn" | "danger"; text: string; url?: string }

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
    // `skipped`: servers whose plugin does not take some of these settings from the dashboard yet; they got the rest.
    request<{ versions: Record<string, number>; skipped?: Record<string, string[]> }>(`/installs/${installId}/config`, { method: "PUT", json: body }),
  resetConfig: (installId: string) => request<{ version: number }>(`/installs/${installId}/config/reset`, { json: {} }),
  createToken: (networkId: string) => request<{ token: string }>(`/networks/${networkId}/tokens`, { json: {} }),

  // Writes always carry a JSON body: the API refuses state changes without one (CSRF protection).
  rules: (networkId: string) => request<{ rules: AccessRuleView[] }>(`/networks/${networkId}/rules`),
  addRule: (networkId: string, body: { effect: RuleEffect; scope: RuleScope; target: string; note?: string | null; expires_in_minutes?: number | null }) =>
    request<{ id: string; servers?: number; skipped?: number; expires_at?: number | null; duplicate?: boolean }>(`/networks/${networkId}/rules`, { json: body }),
  removeRule: (networkId: string, ruleId: string) => request<{ ok: true }>(`/networks/${networkId}/rules/${ruleId}`, { method: "DELETE", json: {} }),
  recheck: (networkId: string, ip: string) => request<{ ok: true; servers: number }>(`/networks/${networkId}/recheck`, { json: { ip } }),
  players: (uuids: string[]) => request<{ names: Record<string, string | null> }>(`/players?uuids=${uuids.join(",")}`),
  members: (networkId: string) => request<{ members: Member[] }>(`/networks/${networkId}/members`),
  setRole: (networkId: string, userId: string, role: Role) => request<{ ok: true }>(`/networks/${networkId}/members/${userId}`, { method: "PATCH", json: { role } }),
  removeMember: (networkId: string, userId: string) => request<{ ok: true }>(`/networks/${networkId}/members/${userId}`, { method: "DELETE", json: {} }),
  invites: (networkId: string) => request<{ invites: InviteView[] }>(`/networks/${networkId}/invites`),
  createInvite: (networkId: string, role: "admin" | "viewer") => request<{ id: string; url: string; expires_at: number }>(`/networks/${networkId}/invites`, { json: { role } }),
  revokeInvite: (networkId: string, inviteId: string) => request<{ ok: true }>(`/networks/${networkId}/invites/${inviteId}`, { method: "DELETE", json: {} }),
  invite: (token: string) => request<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string, termsVersion: string) => request<{ network_id: string }>(`/invites/${encodeURIComponent(token)}/accept`, { json: { accept_terms: true, terms_version: termsVersion } }),
  alerts: (networkId: string) => request<AlertSettings>(`/networks/${networkId}/alerts`),
  saveAlerts: (networkId: string, body: { webhook_url?: string | null; kinds: AlertKind[] }) => request<AlertSettings>(`/networks/${networkId}/alerts`, { method: "PUT", json: body }),
  testAlerts: (networkId: string) => request<{ ok: true }>(`/networks/${networkId}/alerts/test`, { json: {} }),
  activity: (networkId: string) => request<{ activity: ActivityEntry[] }>(`/networks/${networkId}/activity`),
  deleteNetwork: (networkId: string, confirm: string) => request<{ ok: true }>(`/networks/${networkId}`, { method: "DELETE", json: { confirm } }),
  deleteAccount: () => request<{ ok: true }>("/me", { method: "DELETE", json: { confirm: "DELETE" } }),
  announcement: () => request<{ announcement: Announcement | null }>("/announcement"),
};
