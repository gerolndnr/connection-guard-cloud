import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, LoaderCircle, Trash2 } from "lucide-react";
import { api, ApiError, type AccessRuleView, type AlertKind, type NetworkView, type Role, type RuleEffect, type RuleScope } from "../api.ts";
import { Shell, useMe } from "../components/Shell.tsx";
import { Row, Section, Switch } from "../components/Form.tsx";
import { ago, num, serverName } from "../format.ts";
import { usePlayerNames } from "../players.ts";
import { track } from "../analytics.ts";

const effectText: Record<RuleEffect, string> = { ALLOW: "Always let in", DENY: "Always refuse", EXEMPT: "Skip checks" };
const scopeText: Record<RuleScope, string> = { ALL: "all checks", VPN: "VPN checks", GEO: "country checks" };
const stateText = { pending: "waiting for the server", delivered: "sent", applied: "in place", failed: "failed" } as const;

export function NetworkPage() {
  const { networkId } = useParams({ from: "/n/$networkId/network" });
  const net = useQuery({ queryKey: ["network", networkId], queryFn: () => api.network(networkId) });
  if (net.isPending) return <Shell networkId={networkId}><div className="skeleton h-64" /></Shell>;
  if (!net.data) return <Shell networkId={networkId}><p role="alert" className="text-danger-text">This network does not exist or you are not a member.</p></Shell>;
  const role = net.data.role;
  const manage = role !== "viewer";
  return (
    <Shell networkId={networkId}>
      <div className="mx-auto max-w-3xl space-y-6 pb-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">Network</h1>
          <p className="mt-1 text-fg-2">{net.data.network.name} · {net.data.installs.length} {net.data.installs.length === 1 ? "server" : "servers"}</p>
        </div>
        <Rules networkId={networkId} view={net.data} manage={manage} />
        <Team networkId={networkId} role={role} />
        {manage && <Alerts networkId={networkId} />}
        {manage && <Activity networkId={networkId} />}
        <DataSection networkId={networkId} view={net.data} role={role} />
      </div>
    </Shell>
  );
}

// ---- access rules -----------------------------------------------------------------

function targetLabel(target: string, names: Map<string, string | null>) {
  if (target.startsWith("ASN:")) return `AS${target.slice(4)} (provider network)`;
  if (/^[0-9a-f-]{36}$/.test(target)) return names.get(target) ?? `Player ${target.slice(0, 8)}…`;
  return target.includes("/") ? `${target} (range)` : target;
}

function Rules({ networkId, view, manage }: { networkId: string; view: NetworkView; manage: boolean }) {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ["rules", networkId], queryFn: () => api.rules(networkId), refetchInterval: (q) => (q.state.data?.rules.some((r) => r.servers.some((s) => s.state !== "applied" && s.state !== "failed")) ? 5000 : 60_000) });
  const names = usePlayerNames(rules.data?.rules.map((r) => r.target) ?? []);
  const [target, setTarget] = useState("");
  const [effect, setEffect] = useState<RuleEffect>("ALLOW");
  const [scope, setScope] = useState<RuleScope>("ALL");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const serverNames = new Map(view.installs.map((i) => [i.id, serverName(i)]));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.addRule(networkId, { effect, scope, target: target.trim(), note: note.trim() || null });
      setTarget(""); setNote("");
      await qc.invalidateQueries({ queryKey: ["rules", networkId] });
    } catch (err) {
      setError(err instanceof ApiError && err.code === "invalid_target" ? "Use an IP address or range (203.0.113.0/24), a player UUID or an ASN like AS3320." : "The rule could not be saved.");
    } finally { setBusy(false); }
  };
  const remove = async (r: AccessRuleView) => {
    await api.removeRule(networkId, r.id);
    await qc.invalidateQueries({ queryKey: ["rules", networkId] });
  };

  return (
    <Section id="rules" title="Access rules" description="Always let in or always refuse a player, an address or a provider network, on every server of this network. Rules you add from a decision show up here.">
      {rules.data && rules.data.rules.length > 0 ? (
        <ul className="ph-no-capture divide-y divide-line">
          {rules.data.rules.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-4 px-6 py-3.5">
              <div className="min-w-0">
                <p className="truncate font-medium">{targetLabel(r.target, names)}</p>
                <p className="text-[0.8125rem] text-fg-2">
                  <span className={r.effect === "DENY" ? "text-danger-text" : "text-accent-text"}>{effectText[r.effect]}</span> · {scopeText[r.scope]}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
                <p className="mt-0.5 text-[0.75rem] text-fg-3">
                  {r.servers.length === 0 ? "No servers yet" : r.servers.map((s) => `${serverNames.get(s.install_id) ?? "Server"}: ${stateText[s.state]}${s.message ? ` (${s.message})` : ""}`).join(" · ")}
                  {" · "}added {ago(r.created_at)}{r.created_by_name ? ` by ${r.created_by_name}` : ""}
                </p>
              </div>
              {manage && <button type="button" className="btn btn-ghost size-8 shrink-0 p-0" aria-label="Remove rule" title="Remove rule" onClick={() => remove(r)}><Trash2 className="size-4" /></button>}
            </li>
          ))}
        </ul>
      ) : <p className="px-6 py-5 text-fg-2">{rules.isPending ? "Loading…" : "No rules yet. Open a decision and choose “Was this wrong?” to add one."}</p>}
      {manage && (
        <form onSubmit={add} className="grid gap-3 border-t border-line px-6 py-5 sm:grid-cols-[minmax(0,1.4fr)_auto_auto]">
          <label className="grid gap-1.5 sm:col-span-3">
            <span className="label">Add a rule</span>
            <input className="input mono ph-no-capture" placeholder="IP, range, player UUID or AS3320" value={target} onChange={(e) => setTarget(e.target.value)} required />
          </label>
          <select className="input" aria-label="Effect" value={effect} onChange={(e) => setEffect(e.target.value as RuleEffect)}>
            {(Object.keys(effectText) as RuleEffect[]).map((k) => <option key={k} value={k}>{effectText[k]}</option>)}
          </select>
          <select className="input" aria-label="Applies to" value={scope} onChange={(e) => setScope(e.target.value as RuleScope)}>
            {(Object.keys(scopeText) as RuleScope[]).map((k) => <option key={k} value={k}>For {scopeText[k]}</option>)}
          </select>
          <input className="input" placeholder="Note (optional)" value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} />
          <div className="flex items-center gap-3 sm:col-span-3">
            <button type="submit" className="btn btn-primary" disabled={busy || !target.trim()}>{busy ? "Adding…" : "Add rule"}</button>
            {error && <p role="alert" className="text-[0.8125rem] text-danger-text">{error}</p>}
          </div>
        </form>
      )}
    </Section>
  );
}

// ---- team ---------------------------------------------------------------------------

function Team({ networkId, role }: { networkId: string; role: Role }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const members = useQuery({ queryKey: ["members", networkId], queryFn: () => api.members(networkId) });
  const invites = useQuery({ queryKey: ["invites", networkId], queryFn: () => api.invites(networkId), enabled: role !== "viewer" });
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["members", networkId] }), qc.invalidateQueries({ queryKey: ["invites", networkId] })]);

  const invite = async (r: "admin" | "viewer") => {
    setError(null);
    try { const res = await api.createInvite(networkId, r); setCreated(res.url); setCopied(false); await refresh(); }
    catch { setError("The invite could not be created."); }
  };
  const changeRole = async (userId: string, r: Role) => {
    setError(null);
    try { await api.setRole(networkId, userId, r); await refresh(); }
    catch (err) { setError(err instanceof ApiError && err.code === "last_owner" ? "A network needs at least one owner." : "The role could not be changed."); }
  };
  const remove = async (userId: string, self: boolean) => {
    setError(null);
    try {
      await api.removeMember(networkId, userId);
      if (self) { await qc.invalidateQueries({ queryKey: ["me"] }); navigate({ to: "/" }); } else await refresh();
    } catch (err) { setError(err instanceof ApiError && err.code === "last_owner" ? "Make someone else an owner first." : "That did not work."); }
  };

  return (
    <Section id="team" title="Team" description="Give moderators their own access with their Discord account. Admins can change settings and rules; viewers can only look.">
      <ul className="divide-y divide-line">
        {members.data?.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-6 py-3">
            {m.avatar ? <img src={m.avatar} alt="" className="ph-no-capture size-8 rounded-full" /> : <span className="grid size-8 place-items-center rounded-full bg-fg text-xs font-semibold text-surface">{m.name.slice(0, 1)}</span>}
            <div className="min-w-0 flex-1">
              <p className="ph-no-capture truncate font-medium">{m.name}{m.you && <span className="font-normal text-fg-3"> (you)</span>}</p>
              <p className="text-[0.75rem] text-fg-3">Joined {ago(m.created_at)}</p>
            </div>
            {role === "owner" && !m.you ? (
              <select className="ph-no-capture input h-8 w-auto text-[0.8125rem]" aria-label={`Role of ${m.name}`} value={m.role} onChange={(e) => changeRole(m.id, e.target.value as Role)}>
                <option value="owner">Owner</option><option value="admin">Admin</option><option value="viewer">Viewer</option>
              </select>
            ) : <span className="badge badge-neutral capitalize">{m.role}</span>}
            {(m.you || role === "owner") && !(m.you && m.role === "owner" && (members.data?.members.filter((x) => x.role === "owner").length ?? 0) < 2) && (
              <button type="button" className="btn btn-ghost h-8 px-2 text-[0.8125rem]" onClick={() => remove(m.id, m.you)}>{m.you ? "Leave" : "Remove"}</button>
            )}
          </li>
        ))}
      </ul>
      {role !== "viewer" && (
        <div className="border-t border-line px-6 py-5">
          <p className="label">Invite someone</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {role === "owner" && <button type="button" className="btn btn-secondary" onClick={() => invite("admin")}>Invite an admin</button>}
            <button type="button" className="btn btn-secondary" onClick={() => invite("viewer")}>Invite a viewer</button>
          </div>
          {created && (
            <div className="mt-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3">
              <p className="text-[0.8125rem] font-medium">Send this link to the person. It works once, for 7 days, and is shown only now.</p>
              <div className="mt-2 flex gap-2">
                <input readOnly className="input mono ph-no-capture text-[0.8125rem]" value={created} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn-secondary shrink-0" onClick={async () => { await navigator.clipboard.writeText(created); setCopied(true); }}>
                  {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy</>}
                </button>
              </div>
            </div>
          )}
          {invites.data && invites.data.invites.length > 0 && (
            <ul className="mt-4 space-y-1 text-[0.8125rem] text-fg-2">
              {invites.data.invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3">
                  <span>Open invite for a {i.role}, expires {new Date(i.expires_at).toLocaleDateString()}</span>
                  <button type="button" className="underline decoration-line-strong underline-offset-4 hover:text-fg" onClick={async () => { await api.revokeInvite(networkId, i.id); await refresh(); }}>Revoke</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p role="alert" className="border-t border-line px-6 py-3 text-[0.8125rem] text-danger-text">{error}</p>}
    </Section>
  );
}

// ---- alerts --------------------------------------------------------------------------

const KINDS: { kind: AlertKind; title: string; body: string }[] = [
  { kind: "server_offline", title: "A server stops reporting", body: "After 30 minutes without contact." },
  { kind: "provider_trouble", title: "A detection service fails", body: "Wrong API key, no quota left, or most lookups failing." },
  { kind: "quota_low", title: "Daily quota running low", body: "When a service has used 80% of today's lookups." },
  { kind: "refusal_spike", title: "Unusually many refusals", body: "At least 10 in an hour and three times the usual rate." },
  { kind: "weekly_digest", title: "Weekly summary", body: "Mondays: checks, refusals and VPNs found in the last 7 days." },
];

function Alerts({ networkId }: { networkId: string }) {
  const qc = useQueryClient();
  const alerts = useQuery({ queryKey: ["alerts", networkId], queryFn: () => api.alerts(networkId) });
  const [kinds, setKinds] = useState<AlertKind[] | null>(null);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = kinds ?? alerts.data?.kinds ?? [];
  const dirty = kinds !== null || url.trim() !== "";

  const save = async (webhook?: string | null) => {
    setBusy(true); setStatus(null);
    try {
      const res = await api.saveAlerts(networkId, { kinds: current, ...(webhook !== undefined ? { webhook_url: webhook } : url.trim() ? { webhook_url: url.trim() } : {}) });
      qc.setQueryData(["alerts", networkId], res);
      setKinds(null); setUrl("");
      setStatus({ tone: "ok", text: "Saved." });
    } catch (err) {
      setStatus({ tone: "error", text: err instanceof ApiError && err.code === "invalid_webhook" ? "That is not a Discord webhook URL. In Discord: Server settings → Integrations → Webhooks → Copy URL." : "Could not save." });
    } finally { setBusy(false); }
  };
  const test = async () => {
    setStatus(null);
    try { await api.testAlerts(networkId); setStatus({ tone: "ok", text: "Test message sent. Check your Discord channel." }); }
    catch { setStatus({ tone: "error", text: "Discord did not accept the message. Check the webhook." }); }
  };

  return (
    <Section id="alerts" title="Discord alerts" description="Get a message in your Discord when something needs you, so you don't have to check the dashboard.">
      <Row label="Webhook" help={alerts.data?.webhook_set ? `Connected (${alerts.data.webhook_hint}). Paste a new URL to replace it.` : "In Discord: Server settings → Integrations → Webhooks → New webhook → Copy URL."}>
        <div className="flex gap-2">
          <input className="input mono ph-no-capture" type="url" placeholder="https://discord.com/api/webhooks/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          {alerts.data?.webhook_set && <button type="button" className="btn btn-ghost shrink-0" onClick={() => save(null)}>Remove</button>}
        </div>
      </Row>
      <div className="divide-y divide-line border-t border-line">
        {KINDS.map((k) => (
          <div key={k.kind} className="flex items-start justify-between gap-6 px-6 py-3.5">
            <div><p className="font-medium">{k.title}</p><p className="text-[0.8125rem] text-fg-2">{k.body}</p></div>
            <Switch label={k.title} checked={current.includes(k.kind)} onChange={(on) => setKinds(on ? [...current, k.kind] : current.filter((x) => x !== k.kind))} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4">
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={() => save()}>{busy ? "Saving…" : "Save alerts"}</button>
        {alerts.data?.webhook_set && <button type="button" className="btn btn-secondary" onClick={test}>Send a test message</button>}
        {status && <p role="status" className={`text-[0.8125rem] ${status.tone === "ok" ? "text-accent-text" : "text-danger-text"}`}>{status.text}</p>}
      </div>
    </Section>
  );
}

// ---- activity -------------------------------------------------------------------------

const actionText: Record<string, string> = {
  "install.linked": "linked a server", "install.unlinked": "removed a server", "install.renamed": "renamed a server",
  "config.saved": "changed settings", "config.reset": "reset settings to config.yml", "network_token.created": "created a fleet token",
  "rule.added": "added an access rule", "rule.removed": "removed an access rule", "cache.cleared": "asked to re-check an address",
  "invite.created": "created an invite", "member.joined": "joined", "member.left": "left", "member.removed": "removed a member",
  "member.role": "changed a role", "alerts.saved": "changed Discord alerts",
};

function Activity({ networkId }: { networkId: string }) {
  const q = useQuery({ queryKey: ["activity", networkId], queryFn: () => api.activity(networkId) });
  const [all, setAll] = useState(false);
  const rows = q.data?.activity ?? [];
  return (
    <Section id="activity" title="Activity" description="Who changed what, newest first. Kept as long as the network exists.">
      {rows.length === 0 ? <p className="px-6 py-5 text-fg-2">{q.isPending ? "Loading…" : "Nothing yet."}</p> : (
        <ul className="divide-y divide-line text-[0.875rem]">
          {rows.slice(0, all ? 100 : 8).map((a, i) => (
            <li key={i} className="flex justify-between gap-4 px-6 py-2.5">
              <span className="min-w-0 truncate"><span className="ph-no-capture font-medium">{a.user_name ?? "Someone"}</span> {actionText[a.action] ?? a.action}</span>
              <span className="shrink-0 text-[0.8125rem] text-fg-3">{ago(a.at)}</span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 8 && !all && <div className="border-t border-line px-6 py-3"><button type="button" className="text-[0.8125rem] font-medium underline decoration-line-strong underline-offset-4" onClick={() => setAll(true)}>Show all</button></div>}
    </Section>
  );
}

// ---- data and deletion ---------------------------------------------------------------------

/** Everything the dashboard holds about this network, as one JSON file (Art. 20 GDPR, and the AVV's "return"). */
async function exportNetwork(networkId: string) {
  const [view, rules, members, activity] = await Promise.all([api.network(networkId), api.rules(networkId), api.members(networkId), api.activity(networkId).catch(() => ({ activity: [] }))]);
  const events = [];
  let before: number | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await api.events(networkId, { limit: 200, before });
    events.push(...res.events);
    if (!res.next_before) break;
    before = res.next_before;
  }
  const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), network: view.network, servers: view.installs, members: members.members, rules: rules.rules, activity: activity.activity, decisions: events }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `connection-guard-${view.network.name.replace(/[^A-Za-z0-9_-]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  return events.length;
}

function DataSection({ networkId, view, role }: { networkId: string; view: NetworkView; role: Role }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useMe();
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<number | null>(null);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setExporting(true);
    try { setExported(await exportNetwork(networkId)); track("network_exported"); } finally { setExporting(false); }
  };
  const del = async () => {
    setDeleting(true); setError(null);
    try {
      await api.deleteNetwork(networkId, confirm);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "config" });
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate({ to: "/" });
    } catch { setError("Deleting failed. Check the name and try again."); setDeleting(false); }
  };
  return (
    <Section id="data" title="Your data" description="Take everything with you, or delete the network.">
      <Row label="Export" help="Network, servers, team, rules, activity and the decisions of the last 30 days as a JSON file.">
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-secondary" disabled={exporting} onClick={run}>{exporting ? <><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> Exporting…</> : "Download JSON"}</button>
          {exported !== null && <span className="text-[0.8125rem] text-fg-2">Done, {num(exported)} decisions.</span>}
        </div>
      </Row>
      {role === "owner" && (
        <Row label={<span className="text-danger-text">Delete this network</span>} help={`Deletes its decisions, rules, team and activity at once. Its ${view.installs.length === 1 ? "server keeps" : "servers keep"} working and can be linked again. Hourly totals stay with the anonymous server for 13 months.`}>
          <div className="grid gap-2">
            <input className="input" placeholder={`Type “${view.network.name}” to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button type="button" className="btn bg-danger text-white hover:brightness-110" disabled={confirm.trim() !== view.network.name || deleting} onClick={del}>{deleting ? "Deleting…" : "Delete network"}</button>
            {error && <p role="alert" className="text-[0.8125rem] text-danger-text">{error}</p>}
          </div>
        </Row>
      )}
      {me.data && <p className="border-t border-line px-6 py-3 text-[0.8125rem] text-fg-2">To delete your whole account, open your avatar menu → Account.</p>}
    </Section>
  );
}
