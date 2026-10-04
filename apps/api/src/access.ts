// Who may do what in a network, and the audit trail for it.
import type { Env } from "./env.ts";

export type Role = "owner" | "admin" | "viewer";

export async function roleIn(env: Env, networkId: string, userId: string): Promise<Role | null> {
  const row = await env.DB.prepare("SELECT role FROM memberships WHERE network_id = ? AND user_id = ?")
    .bind(networkId, userId).first<{ role: Role }>();
  return row?.role ?? null;
}

export const canManage = (role: Role | null) => role === "owner" || role === "admin";

export async function audit(env: Env, networkId: string | null, userId: string, action: string, detail: Record<string, unknown> = {}) {
  await env.DB.prepare("INSERT INTO audit_log (network_id, user_id, action, detail_json, at) VALUES (?, ?, ?, ?, ?)")
    .bind(networkId, userId, action, JSON.stringify(detail), Date.now()).run();
}
