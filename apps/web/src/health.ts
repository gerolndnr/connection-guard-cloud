// Turns server status into attention notes: "action" when the operator must act, "pencil" when it is good to know.
// Every note has a stable id and a fingerprint of the situation. Dismissing stores the fingerprint, so a
// dismissed note comes back only when the situation changes (a server drops out again, a new day's quota...).
import type { Install } from "./api.ts";
import { ago, serverName } from "./format.ts";
import { sourceLabel } from "./sources.ts";

export interface Note {
  id: string; fingerprint: string; tone: "action" | "pencil"; title: string; detail?: string; command?: string;
  /** Set for "stopped reporting" notes, so the overview can offer to remove a server that is gone for good. */
  installId?: string;
  /** Label of a link to the settings page, for notes the dashboard can fix directly. */
  settingsLink?: string;
}
const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

const warningText: Record<string, string> = {
  "mode.observe": "",
  "cache.none": "No cache configured: every login costs a provider lookup.",
  "identity.untrusted": "Player identity is not verified on this platform.",
  // Proposed for plugin 0.5.2 (Redis unreachable, memory fallback); see the plugin handoff of 2026-10-06.
  "cache.fallback": "Redis is unreachable. The server uses a temporary in-memory cache and reconnects in the background.",
};

export interface ProviderRow { id: string; scope: string; attempts: number; successes: number; paused: boolean; last_reason: string | null; daily_used: number | null; daily_budget: number | null; servers: number; quota_exhausted: boolean }

const failurePriority = (reason: string | null | undefined) =>
  ({ BUDGET_EXHAUSTED: 6, AUTHENTICATION: 5, RATE_LIMIT: 4, CIRCUIT_OPEN: 3, NONE: 0, NO_EVIDENCE: 0, STALE_DATA: 1 }[reason ?? "NONE"] ?? 2);

/** A healthy server must not hide another server's exhausted quota or open circuit. */
export function providerProblem(p: ProviderRow): string | null {
  if (p.quota_exhausted || p.last_reason === "BUDGET_EXHAUSTED") return "Quota exhausted";
  if (p.last_reason === "AUTHENTICATION") return "Credentials rejected";
  if (p.last_reason === "RATE_LIMIT") return "Rate limited";
  if (p.last_reason === "CIRCUIT_OPEN") return "Circuit open";
  if (p.paused) return "Paused";
  if (p.attempts >= 5 && p.successes / p.attempts < 0.8) return "Unreliable";
  return null;
}

export function providers(installs: Install[]): ProviderRow[] {
  const byId = new Map<string, ProviderRow>();
  for (const i of installs) for (const p of i.status?.providers ?? []) {
    const row = byId.get(p.id) ?? { id: p.id, scope: p.scope, attempts: 0, successes: 0, paused: false, last_reason: null, daily_used: null, daily_budget: null, servers: 0, quota_exhausted: false };
    row.attempts += p.attempts; row.successes += p.successes; row.paused ||= p.paused; row.servers += 1;
    if (failurePriority(p.last_reason) > failurePriority(row.last_reason)) row.last_reason = p.last_reason;
    row.quota_exhausted ||= p.last_reason === "BUDGET_EXHAUSTED" || (p.daily_budget !== null && p.daily_budget > 0 && p.daily_used !== null && p.daily_used >= p.daily_budget);
    if (p.daily_used !== null) row.daily_used = (row.daily_used ?? 0) + p.daily_used;
    // Each server reports its own budget; the network total is their sum.
    if (p.daily_budget !== null) row.daily_budget = (row.daily_budget ?? 0) + p.daily_budget;
    byId.set(p.id, row);
  }
  return [...byId.values()].sort((a, b) => a.scope.localeCompare(b.scope) || a.id.localeCompare(b.id));
}

export function notes(installs: Install[], now = Date.now()): Note[] {
  const out: Note[] = [];
  for (const i of installs) {
    if (!i.online) out.push({ id: `offline:${i.id}`, fingerprint: String(i.last_seen_at), installId: i.id, tone: "action", title: `${serverName(i)} stopped reporting`, detail: `Last seen ${ago(i.last_seen_at, now)}. If the server is running, check that it can reach api.connectionguard.net.` });
  }
  // Only plugins from 0.5.2 ask the next service when one fails or runs out; on 0.5.1 the failure policy alone decides.
  const chained = installs.some((i) => i.status?.config?.["provider.vpn-failover.enabled"] === true);
  const meanwhile = chained
    ? "The next service in the failover chain steps in; if none can answer, your failure policy decides."
    : "Until it answers again, your failure policy decides: with \"Let in\", players get in unchecked.";
  for (const p of providers(installs)) {
    const problem = providerProblem(p);
    const usage = p.daily_used !== null && p.daily_budget ? `${p.daily_used} of ${p.daily_budget} locally counted lookups today${p.servers > 1 ? ` across ${p.servers} servers` : ""}. ` : "";
    const quotaDetail = `${usage}Counts are per-server estimates, not the provider account's remaining balance. Check /cg doctor and the provider account. ${meanwhile}`;
    if (problem && problem !== "Quota exhausted") {
      out.push({ id: `failing:${p.id}`, fingerprint: `${utcDay(now)}:${problem}`, tone: "action", title: `${sourceLabel(p.id)}: ${problem.toLowerCase()}`, detail: `${p.successes} of ${p.attempts} lookups answered${p.last_reason ? `, last error: ${p.last_reason.toLowerCase().replace(/_/g, " ")}` : ""}. Check /cg doctor. ${meanwhile}` });
    }
    if (problem === "Quota exhausted" || (p.daily_budget && p.daily_used !== null && p.daily_used / p.daily_budget >= 0.8)) {
      const exhausted = problem === "Quota exhausted";
      out.push({ id: `quota:${p.id}`, fingerprint: `${utcDay(now)}:${exhausted ? "exhausted" : "low"}`, tone: "action", title: `${sourceLabel(p.id)}: ${exhausted ? "quota exhausted on at least one server" : "local daily budget almost used"}`, detail: quotaDetail });
    }
  }
  const observing = installs.filter((i) => i.status?.mode === "OBSERVE");
  if (observing.length > 0) {
    out.push({
      id: "observe", fingerprint: observing.map((o) => o.id).sort().join(","),
      tone: "pencil",
      title: observing.length === installs.length ? "Observing only: nothing is refused yet" : `${observing.length} of ${installs.length} servers only observe`,
      detail: "Watch the decisions for a few days. When the \"Would refuse\" entries look right, switch to Enforce.",
      settingsLink: "Switch in Settings",
    });
  }
  const seen = new Set<string>();
  for (const i of installs) for (const w of i.status?.warnings ?? []) {
    const text = warningText[w] ?? w.replace(/[._-]/g, " ");
    if (!text || seen.has(w)) continue;
    seen.add(w);
    out.push({ id: `warning:${w}`, fingerprint: "1", tone: "pencil", title: text });
  }
  const dropped = installs.reduce((n, i) => n + (i.status?.dropped_events ?? 0), 0);
  if (dropped > 0) out.push({ id: "dropped", fingerprint: String(dropped), tone: "pencil", title: `${dropped} entries could not be delivered`, detail: "The server buffered more than it could send while offline. Totals are still complete." });
  return out;
}
