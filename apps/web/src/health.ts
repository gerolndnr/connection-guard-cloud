// Turns server status into attention notes: "action" when the operator must act, "pencil" when it is good to know.
// Every note has a stable id and a fingerprint of the situation. Dismissing stores the fingerprint, so a
// dismissed note comes back only when the situation changes (a server drops out again, a new day's quota...).
import type { Install, InstallError } from "./api.ts";
import { ago, num, serverName, versionAtLeast } from "./format.ts";
import { sourceLabel } from "./sources.ts";

export interface Note {
  id: string; fingerprint: string; tone: "action" | "pencil"; title: string; detail?: string; command?: string;
  /** Set for "stopped reporting" notes, so the overview can offer to remove a server that is gone for good. */
  installId?: string;
  /** Label of a link to the settings page, for notes the dashboard can fix directly. */
  settingsLink?: string;
  /** An outside link, such as a prefilled bug report. */
  link?: { href: string; label: string };
}
const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

const ERROR_CONTEXT: Record<InstallError["context"], { during: string; meaning: string }> = {
  STARTUP: { during: "while starting", meaning: "If Connection Guard did not start completely, players may not be checked. The server log has the details." },
  RELOAD: { during: "while reloading", meaning: "A failed reload keeps the previous settings active." },
  LOOKUP: { during: "during lookups", meaning: "A lookup that fails counts as unanswered, so your failure policy decides those logins." },
  CACHE: { during: "in the cache", meaning: "Check the cache settings (SQLite or Redis) and the server log." },
  SYNC: { during: "talking to the dashboard", meaning: "This concerns the dashboard connection, not the checks themselves." },
  COMMAND: { during: "running a command", meaning: "A console or dashboard command did not complete." },
  OTHER: { during: "", meaning: "The server log has the details." },
};

/** A prefilled bug report: class names, the top frame, versions and the fingerprint. Nothing about players or the server. */
export function errorReportUrl(i: Pick<Install, "platform" | "platform_version">, e: InstallError): string {
  const title = `${e.type.slice(e.type.lastIndexOf(".") + 1)} ${ERROR_CONTEXT[e.context].during}`.trim();
  const body = [
    "Reported automatically by Connection Guard (no message text, no player data).", "",
    `- Exception: \`${e.type}\`${e.cause_type ? ` caused by \`${e.cause_type}\`` : ""}`,
    `- Where: \`${e.top_frame}\` (${e.context.toLowerCase()})`,
    `- Plugin: ${e.plugin_version} on ${i.platform_version}`,
    `- Fingerprint: \`${e.fingerprint}\``, "",
    "What were you doing when it happened?",
  ].join("\n");
  return `https://github.com/gerolndnr/connection-guard/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

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
    const coverage = i.status?.vpn_unchecked_allowed;
    if (coverage && coverage.total > 0) {
      const reasons = Object.entries(coverage.reasons).filter(([, count]) => count! > 0)
        .map(([reason, count]) => `${reason.toLowerCase().replace(/_/g, " ")}: ${num(count!)}`).join(", ");
      out.push({ id: `vpn-unchecked:${i.id}`, installId: i.id, fingerprint: `${coverage.total}:${coverage.since_summary > 0}`,
        tone: coverage.since_summary > 0 ? "action" : "pencil",
        title: `${num(coverage.total)} ${coverage.total === 1 ? "login passed" : "logins passed"} without a VPN result on ${serverName(i)}`,
        detail: `${num(coverage.since_summary)} since the last console summary.${reasons ? ` Reasons: ${reasons}.` : ""} Totals are since the plugin started; intentional exceptions and refused connections are excluded. Check /cg doctor and provider quotas.` });
    }
    if (!i.online) out.push({ id: `offline:${i.id}`, fingerprint: String(i.last_seen_at), installId: i.id, tone: "action", title: `${serverName(i)} stopped reporting`, detail: `Last seen ${ago(i.last_seen_at, now)}. If the server is running, check that it can reach api.connectionguard.net.` });
  }
  for (const p of providers(installs)) {
    const problem = providerProblem(p);
    // Only plugins from 0.5.2 ask the next service when one fails or runs out; on 0.5.1 the failure policy alone decides.
    const chained = installs.filter((i) => i.status?.providers.some((x) => x.id === p.id))
      .every((i) => i.status?.config?.["provider.vpn-failover.enabled"] === true
        || (!Object.hasOwn(i.status?.config ?? {}, "provider.vpn-failover.enabled") && versionAtLeast(i.plugin_version, "0.5.2")));
    const meanwhile = chained
      ? "The next service in the failover chain steps in; if none can answer, your failure policy decides."
      : "Until it answers again, your failure policy decides: with \"Let in\", players get in unchecked.";
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
  // The plugin's own errors in the last 24 hours. Red while it is still happening, amber once it has been quiet for an hour.
  for (const i of installs) for (const e of i.errors ?? []) {
    if (now - e.last_at > 86_400_000) continue;
    const short = e.type.slice(e.type.lastIndexOf(".") + 1);
    const ctx = ERROR_CONTEXT[e.context];
    out.push({
      id: `error:${i.id}:${e.fingerprint}`, fingerprint: utcDay(now), tone: now - e.last_at < 3_600_000 ? "action" : "pencil",
      title: `${serverName(i)}: ${short} ${ctx.during}`.trim(),
      detail: `${e.count === 1 ? "Once" : `${e.count} times`} since ${ago(e.first_at, now)}, last ${ago(e.last_at, now)}, at ${e.top_frame} (Connection Guard ${e.plugin_version}). ${ctx.meaning}`,
      command: "/cg doctor",
      link: { href: errorReportUrl(i, e), label: "Report it on GitHub" },
    });
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
