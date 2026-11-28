import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, LoaderCircle, RefreshCw, Search } from "lucide-react";
import type { ContributionKind, PlayerFlag, SectionStatus, SourceRef } from "@cg/protocol/intel";
import { api, ApiError, type IntelSettings, type PlayerReport } from "../api.ts";
import { Shell, useConfig } from "../components/Shell.tsx";
import { Row, Section, Switch } from "../components/Form.tsx";
import { ago, num } from "../format.ts";
import { intelReady, parseUuid, useIntel } from "../intel.ts";
import { usePlayerNames } from "../players.ts";
import { track } from "../analytics.ts";

const date = (t: number | null | undefined) => (t ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–");
const span = (a: number, b: number) => (date(a) === date(b) ? date(a) : `${date(a)} – ${date(b)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

const kindText: Record<ContributionKind, string> = {
  login_observation: "Logins: name, Mojang-signed skin, a keyed hash of home addresses",
  punishment: "Bans, mutes, warnings and kicks from your ban plugin (category only, never the reason or staff)",
  punishment_revoked: "Punishments lifted early",
  anticheat: "Anti-cheat confirmations (daily totals per check category)",
  bot: "Bots your anti-bot plugin confirmed",
  chat_violation: "Chat moderation (category only, never the message)",
  playtime: "Playtime from Plan Player Analytics",
};

export function PlayersPage() {
  const { networkId } = useParams({ from: "/n/$networkId/players" });
  const { uuid } = useSearch({ from: "/n/$networkId/players" });
  const intel = useIntel(networkId);
  const s = intel.data;
  return (
    <Shell networkId={networkId}>
      <div className="mx-auto max-w-3xl space-y-6 pb-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">Players</h1>
          <p className="mt-1 max-w-prose text-fg-2">
            What other networks and public sources know about an account: punishments, account history, gameplay, possible alts and where it plays.
            It helps staff decide whether to look closer. It never refuses anyone.
          </p>
        </div>
        {intel.isPending ? <div className="skeleton h-40" /> : !s ? (
          <p role="alert" className="text-danger-text">{intel.error instanceof ApiError && intel.error.status === 404 ? "This network does not exist or you are not a member." : "Could not load Player Intelligence. Try again."}</p>
        ) : (
          <>
            <Availability networkId={networkId} settings={s} />
            {intelReady(s) && <Lookup networkId={networkId} current={uuid} />}
            {intelReady(s) && uuid && <Report key={uuid} networkId={networkId} uuid={uuid} settings={s} />}
            {s.available && s.offered && <Sharing networkId={networkId} settings={s} />}
            {s.available && s.offered && s.can_manage && <Keys networkId={networkId} settings={s} />}
            {s.available && s.offered && <Sources settings={s} />}
          </>
        )}
      </div>
    </Shell>
  );
}

// ---- availability -------------------------------------------------------------------

function Availability({ networkId, settings: s }: { networkId: string; settings: IntelSettings }) {
  const config = useConfig();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (intelReady(s)) return null;

  let title: string;
  let body: ReactNode;
  // The current agreement covers Player Intelligence once its version is the one Intel Cloud asks for, or newer.
  const current = config.data?.dpa_version ?? null;
  const canAccept = s.can_manage && s.agreement_version !== null && current !== null && current >= s.agreement_version;
  if (!s.available) {
    title = "Not available right now";
    body = "Player Intelligence runs on Connection Guard's own cloud and did not answer. A self-hosted cloud endpoint does not have it.";
  } else if (!s.offered) {
    title = "Coming soon";
    body = "Player Intelligence starts with the next version of the data processing agreement. Owners and admins will be asked to accept it here; until then nothing about players is shared or looked up.";
  } else {
    title = "Accept the updated agreement";
    body = s.can_manage
      ? `Player Intelligence is covered by the data processing agreement from version ${s.agreement_version}. Accept it for this network to look up players and share with other networks.`
      : "An owner or admin of this network needs to accept the updated data processing agreement first.";
  }

  async function accept() {
    if (!current) return;
    setBusy(true); setError(null);
    try {
      await api.acceptDpa(networkId, current);
      track("intel_agreement_accepted");
      await Promise.all([qc.invalidateQueries({ queryKey: ["network", networkId] }), qc.invalidateQueries({ queryKey: ["intel", networkId] })]);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "dpa_outdated" ? "The agreement changed while this page was open. Reload to read the current version." : "Could not save. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="card px-6 py-5">
      <h2 className="text-base font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="mt-1 max-w-prose text-[0.875rem] leading-relaxed text-fg-2">{body}</p>
      {s.available && s.offered && (
        <p className="mt-2 text-[0.8125rem] text-fg-2">
          <a href="https://connectionguard.net/avv" target="_blank" rel="noopener" className="underline underline-offset-4">Read the binding German agreement</a>
          {" · "}<a href="https://connectionguard.net/dpa" target="_blank" rel="noopener" className="underline underline-offset-4">English translation</a>
        </p>
      )}
      {canAccept && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={accept}>{busy ? "Saving…" : `Accept version ${current} for this network`}</button>
          <span className="text-[0.8125rem] text-fg-2">You confirm you can enter into it for the server operator.</span>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[0.8125rem] text-danger-text">{error}</p>}
    </div>
  );
}

// ---- lookup -------------------------------------------------------------------------

function Lookup({ networkId, current }: { networkId: string; current: string | undefined }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Who joined lately, from the decision log: one click instead of copying a UUID.
  const recent = useQuery({ queryKey: ["recent-players", networkId], queryFn: () => api.events(networkId, { limit: 100 }), staleTime: 60_000 });
  const seen = new Map<string, string | undefined>();
  for (const e of recent.data?.events ?? []) if (e.uuid && !seen.has(e.uuid) && seen.size < 8) seen.set(e.uuid, e.name);
  const names = usePlayerNames([...seen.keys()]);
  const open = (uuid: string) => navigate({ to: "/n/$networkId/players", params: { networkId }, search: { uuid } });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = q.trim();
    const uuid = parseUuid(input);
    if (uuid) { open(uuid); return; }
    if (!/^[A-Za-z0-9_]{1,16}$/.test(input)) { setError("Enter a Minecraft name or UUID."); return; }
    // Names are matched against the decision log: the dashboard cannot ask Mojang directly.
    setBusy(true);
    try {
      const { events } = await api.events(networkId, { q: input, limit: 200 });
      const hit = events.find((ev) => ev.uuid && ev.name?.toLowerCase() === input.toLowerCase());
      if (hit?.uuid) open(hit.uuid);
      else setError(`Nobody called ${input} is in this network's decision log. Enter their UUID instead.`);
    } catch {
      setError("Could not search the decision log. Try again, or enter the UUID.");
    } finally { setBusy(false); }
  }

  return (
    <section aria-label="Look up a player" className="card px-6 py-5">
      <form onSubmit={submit} className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Name or UUID</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <input className="ph-no-capture input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or UUID" autoComplete="off" spellCheck={false} />
        </label>
        <button type="submit" className="btn btn-primary shrink-0" disabled={busy || !q.trim()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : "Look up"}</button>
      </form>
      {error && <p role="alert" className="mt-2 text-[0.8125rem] text-danger-text">{error}</p>}
      {seen.size > 0 && (
        <div className="mt-4">
          <p className="label">Joined recently</p>
          <ul className="ph-no-capture mt-2 flex flex-wrap gap-1.5">
            {[...seen].map(([uuid, name]) => (
              <li key={uuid}>
                <button type="button" onClick={() => open(uuid)} aria-current={uuid === current ? "true" : undefined}
                  className={`h-7 rounded-md border px-2.5 text-[0.8125rem] transition-colors ${uuid === current ? "border-fg bg-subtle text-fg" : "border-line text-fg-2 hover:border-line-strong hover:text-fg"}`}>
                  {name ?? names.get(uuid) ?? `${uuid.slice(0, 8)}…`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---- report -------------------------------------------------------------------------

const errorText: Record<string, string> = {
  agreement_required: "An owner or admin needs to accept the updated data processing agreement first.",
  intel_unavailable: "Player Intelligence did not answer. Try again in a minute.",
  rate_limited: "Too many lookups at once. Try again in a minute.",
  bad_request: "That is not a valid Minecraft UUID.",
};

function Report({ networkId, uuid, settings }: { networkId: string; uuid: string; settings: IntelSettings }) {
  const report = useQuery({
    queryKey: ["player-intel", networkId, uuid],
    queryFn: () => api.playerIntel(networkId, uuid),
    // Sources still being asked: come back when Intel Cloud says they are worth asking again.
    refetchInterval: (q) => { const r = q.state.data?.retry_in; return r ? Math.max(5, r) * 1000 : false; },
    staleTime: 60_000,
  });
  const names = usePlayerNames([uuid]);
  const r = report.data?.players[0];
  const sourceName = (id: string) => settings.sources.find((s) => s.id === id)?.name ?? (id === "crowd" ? "Linked networks" : id);

  if (report.isPending) return <div className="skeleton h-72" />;
  if (!r) {
    const code = report.error instanceof ApiError ? report.error.code : "";
    return <p role="alert" className="card px-6 py-5 text-danger-text">{errorText[code] ?? "Could not load the report. Try again."}</p>;
  }
  const name = r.sections.account?.names?.[0]?.name ?? names.get(uuid) ?? null;
  const pending = report.data?.retry_in != null;

  return (
    <div className="space-y-6">
      <section aria-label="Summary" className="card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div className="ph-no-capture min-w-0">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">{name ?? "Unknown name"}</h2>
            <p className="mono break-all text-[0.8125rem] text-fg-2">{uuid}</p>
          </div>
          <div className="flex items-center gap-2 text-[0.8125rem] text-fg-3">
            {pending ? <span className="flex items-center gap-1.5"><LoaderCircle aria-hidden className="size-3.5 animate-spin" /> Still asking sources</span> : <span>Updated {ago(r.generated_at)}</span>}
            <button type="button" className="btn btn-ghost h-8 px-2" aria-label="Refresh" disabled={report.isFetching} onClick={() => report.refetch()}>
              <RefreshCw aria-hidden className={`size-4 ${report.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        {r.flags.length > 0 ? (
          <ul className="divide-y divide-line">
            {r.flags.map((f) => <FlagRow key={f.code} flag={f} />)}
          </ul>
        ) : (
          <p className="px-6 py-4 text-[0.875rem] text-fg-2">Nothing stands out. No source knows anything about this account that staff should check.</p>
        )}
        <p className="border-t border-line px-6 py-3 text-[0.75rem] leading-relaxed text-fg-3">
          Reports inform staff and are not proof; accounts change hands and sources make mistakes. Do not punish anyone on a report alone.{" "}
          <Link to="/n/$networkId/register" params={{ networkId }} search={{ q: uuid }} className="underline underline-offset-4 hover:text-fg">This player's decisions</Link>
        </p>
      </section>
      {r.sections.punishments && <Punishments s={r.sections.punishments} sourceName={sourceName} />}
      {r.sections.account && <Account s={r.sections.account} sourceName={sourceName} />}
      {r.sections.gameplay && <Gameplay s={r.sections.gameplay} />}
      {r.sections.alts && <Alts s={r.sections.alts} sourceName={sourceName} />}
      {r.sections.servers && <Servers s={r.sections.servers} />}
    </div>
  );
}

const severityStyle = { warning: "badge-would", notice: "badge-neutral", info: "badge-neutral" } as const;
const severityText = { warning: "Check", notice: "Notice", info: "Info" } as const;

function FlagRow({ flag }: { flag: PlayerFlag }) {
  return (
    <li className="flex items-start gap-3 px-6 py-3">
      <span className={`badge ${severityStyle[flag.severity]} mt-px h-5 w-16 shrink-0 justify-center text-[0.6875rem]`}>{severityText[flag.severity]}</span>
      <span className="text-[0.875rem]">{flag.text}</span>
    </li>
  );
}

const statusText: Record<SectionStatus, string | null> = { ok: null, partial: "Some sources did not answer", pending: "Still asking sources", unavailable: "No source could answer" };

/** A report section: title, where it came from and how complete it is, then facts. */
function Part({ title, status, sources, children }: { title: string; status: SectionStatus; sources: SourceRef[]; children: ReactNode }) {
  const note = statusText[status];
  return (
    <Section title={title} description={
      <>
        {sources.length > 0 ? <>From {sources.map((s, i) => (
          <span key={s.id}>{i > 0 && ", "}{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-4">{s.name}<ExternalLink aria-hidden className="size-3" /></a> : s.name}</span>
        ))}</> : "No source knows this account yet"}
        {note && <span className={status === "pending" ? "text-fg-3" : "text-warn-text"}> · {note}</span>}
      </>
    }>
      <dl className="ph-no-capture divide-y divide-line">{children}</dl>
    </Section>
  );
}

function Fact({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return (
    <div className="grid gap-1 px-6 py-3 text-[0.875rem] sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-6">
      <dt className="text-fg-2">{label}{help && <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-fg-3">{help}</span>}</dt>
      <dd className="num min-w-0">{children}</dd>
    </div>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return <ul className="space-y-1">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
}

type S<K extends keyof PlayerReport["sections"]> = NonNullable<PlayerReport["sections"][K]>;
const severityLevel = { none: "None", low: "Low", medium: "Medium", high: "High" } as const;
const typeText = { ban: "Ban", mute: "Mute", warn: "Warning", kick: "Kick" } as const;

function Punishments({ s, sourceName }: { s: S<"punishments">; sourceName: (id: string) => string }) {
  const inForce = [s.in_force.bans && plural(s.in_force.bans, "ban"), s.in_force.mutes && plural(s.in_force.mutes, "mute")].filter(Boolean).join(", ");
  const totals = [plural(s.totals.bans, "ban"), plural(s.totals.mutes, "mute"), plural(s.totals.warns, "warning"), plural(s.totals.kicks, "kick")].join(" · ");
  return (
    <Part title="Punishments" status={s.status} sources={s.sources}>
      <Fact label="In force">{inForce || "None"}</Fact>
      <Fact label="Severity" help="From type, length, category and how many networks.">{severityLevel[s.severity]}</Fact>
      <Fact label="All time">{totals}</Fact>
      <Fact label="Last 30 days · 365 days">{num(s.last_30d)} · {num(s.last_365d)}</Fact>
      <Fact label="Lifted early" help="Sources do not say why; not necessarily an appeal.">{num(s.revoked_early)}</Fact>
      <Fact label="Other networks" help="Linked networks that punished this player, never yours. Their names are never shown.">{num(s.networks)}</Fact>
      {s.categories.length > 0 && <Fact label="Reasons">{s.categories.map((c) => `${c.category} ${num(c.count)}`).join(" · ")}</Fact>}
      <Fact label="Confirmed, last 90 days" help="By other networks' anti-cheat and chat moderation.">
        Anti-cheat on {plural(s.detections.anticheat_networks, "network")} · chat on {plural(s.detections.chat_networks, "network")}
      </Fact>
      {s.entries && s.entries.length > 0 && (
        <Fact label="Entries">
          <List items={s.entries.map((e) => (
            <>
              <span className="font-medium">{typeText[e.type]}</span> for {e.category} · {e.origin === "crowd" ? "a linked network" : e.list_name ?? sourceName(e.source)} · {date(e.issued_at)}
              <span className="text-fg-2"> · {e.revoked_at ? `lifted ${date(e.revoked_at)}` : e.active ? (e.expires_at ? `until ${date(e.expires_at)}` : "permanent") : `ended ${date(e.expires_at)}`}</span>
            </>
          ))} />
        </Fact>
      )}
    </Part>
  );
}

function Account({ s, sourceName }: { s: S<"account">; sourceName: (id: string) => string }) {
  return (
    <Part title="Account history" status={s.status} sources={s.sources}>
      <Fact label="First seen">{s.first_seen ? date(s.first_seen) : "Not seen yet"}</Fact>
      <Fact label="Exists since at least" help="A lower bound: the earliest date any source saw it.">
        {s.estimated_age.at_least_since ? <>{date(s.estimated_age.at_least_since)}{s.estimated_age.evidence.length > 0 && <span className="text-fg-2"> ({s.estimated_age.evidence.map((e) => sourceName(e.source)).join(", ")})</span>}</> : "Unknown"}
      </Fact>
      <Fact label="Name changes">{s.name_changes === null ? "Unknown" : num(s.name_changes)}</Fact>
      <Fact label="Back after a break">{s.reactivated ? `${date(s.reactivated.at)}, after ${plural(s.reactivated.gap_days, "day")} unseen` : "No"}</Fact>
      {s.names && s.names.length > 0 && <Fact label="Names"><List items={s.names.map((n) => <><span className="font-medium">{n.name}</span> <span className="text-fg-2">{span(n.first_seen, n.last_seen)}</span></>)} /></Fact>}
      {s.skins && s.skins.length > 0 && (
        <Fact label="Skins">
          <List items={s.skins.map((k) => (
            <><a href={`https://textures.minecraft.net/texture/${k.hash}`} target="_blank" rel="noopener noreferrer" className="mono underline underline-offset-4">{k.hash.slice(0, 12)}…</a> <span className="text-fg-2">{span(k.first_seen, k.last_seen)}</span></>
          ))} />
        </Fact>
      )}
      {s.capes && s.capes.length > 0 && <Fact label="Capes"><List items={s.capes.map((k) => <>{k.name ?? <span className="mono">{k.hash.slice(0, 12)}…</span>} <span className="text-fg-2">{span(k.first_seen, k.last_seen)}</span></>)} /></Fact>}
    </Part>
  );
}

const ratio = (n: number | null) => (n === null ? "–" : n.toFixed(2));
const hours = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${num(Math.round(minutes / 60))} h`);

function Gameplay({ s }: { s: S<"gameplay"> }) {
  const h = s.hypixel;
  const w = s.wynncraft;
  return (
    <Part title="Gameplay" status={s.status} sources={s.sources}>
      <Fact label="Hypixel">
        {h ? (
          <List items={[
            <>First login {date(h.first_login)} · level {h.level === null ? "–" : h.level.toFixed(1)}{h.achievement_points !== null && ` · ${num(h.achievement_points)} achievement points`}</>,
            ...(h.bedwars ? [<>BedWars: {plural(h.bedwars.games, "game")} · FKDR {ratio(h.bedwars.fkdr)} · WLR {ratio(h.bedwars.wlr)}</>] : []),
            ...(h.skywars ? [<>SkyWars: {plural(h.skywars.games, "game")} · KDR {ratio(h.skywars.kdr)} · WLR {ratio(h.skywars.wlr)}</>] : []),
          ]} />
        ) : "No data"}
      </Fact>
      <Fact label="Wynncraft">
        {w ? <>First join {date(w.first_join)}{w.playtime_hours !== null && ` · ${num(Math.round(w.playtime_hours))} h played`}{w.total_level !== null && ` · total level ${num(w.total_level)}`}</> : "No data"}
      </Fact>
      <Fact label="On linked networks, 30 days" help="Playtime from Plan Player Analytics.">{s.crowd_playtime_30d === null ? "No data" : hours(s.crowd_playtime_30d)}</Fact>
      {s.anomalies.length > 0 && <Fact label="Unusual"><List items={s.anomalies.map((a) => a.text)} /></Fact>}
    </Part>
  );
}

const listCategory = { alt: "alt", bot: "bot", pool: "account pool", evasion: "ban evasion" } as const;

function Alts({ s, sourceName }: { s: S<"alts">; sourceName: (id: string) => string }) {
  return (
    <Part title="Alt accounts" status={s.status} sources={s.sources}>
      <Fact label="On public lists">{s.listed.length ? <List items={s.listed.map((l) => `${sourceName(l.list)} (${listCategory[l.category]})`)} /> : "None"}</Fact>
      <Fact label="Ban evasion confirmed" help="By other networks.">{plural(s.evasion_networks, "network")}</Fact>
      <Fact label="Bot confirmed" help="By other networks' anti-bot plugins.">{plural(s.bot_networks, "network")}</Fact>
      <Fact label="Account pool suspected" help="Many networks, name changes, a long break and punishments together.">{s.pool_suspected ? "Yes" : "No"}</Fact>
      <Fact label="Same home address" help="Other accounts seen from it in 30 days. Counts only: which accounts is never shown. VPN, mobile and shared addresses never count.">
        {s.shared_address ? plural(s.shared_address.accounts, "other account") : "None"}
      </Fact>
    </Part>
  );
}

function Servers({ s }: { s: S<"servers"> }) {
  return (
    <Part title="Where it plays" status={s.status} sources={s.sources}>
      <Fact label="First observed">{date(s.first_observed)}</Fact>
      <Fact label="Days seen">{num(s.known_days)} in all · {num(s.active_days_30d)} in 30 days · {num(s.active_days_365d)} in 365 days</Fact>
      <Fact label="Linked networks" help="Including yours. Counts only.">{num(s.networks)}</Fact>
      <Fact label="Public servers" help="Servers whose public player list showed this account.">{num(s.public_servers)}</Fact>
      {s.public_samples && s.public_samples.length > 0 && (
        <Fact label="Seen on"><List items={s.public_samples.map((p) => <><span className="mono">{p.server}</span> <span className="text-fg-2">{span(p.first_seen, p.last_seen)}</span></>)} /></Fact>
      )}
    </Part>
  );
}

// ---- sharing, keys, sources -----------------------------------------------------------------

function Sharing({ networkId, settings: s }: { networkId: string; settings: IntelSettings }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function change(contribute: boolean) {
    setSaving(true); setError(null);
    qc.setQueryData<IntelSettings>(["intel", networkId], (old) => (old ? { ...old, contribute } : old));
    try {
      await api.setIntelContribute(networkId, contribute);
      track("intel_contribute_changed", { contribute });
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
      await qc.invalidateQueries({ queryKey: ["intel", networkId] });
    }
  }
  return (
    <Section title="Sharing with other networks" description="Reports are only as good as what linked networks share. Other networks see counts, never your network's name, your staff or reasons.">
      <Row label="Share from this network" error={error ?? undefined} help={
        <>On: what your linked servers report below counts for other networks. Off: nothing new is taken; what was shared runs out on its usual schedule. Unlinking a server removes the punishments it shared; deleting the network removes everything.
          {!s.can_manage && " Owners and admins can change this."}</>
      }>
        <Switch checked={s.contribute} onChange={change} label="Share from this network" disabled={!s.can_manage || saving} />
      </Row>
      <Row label="Taken right now" help="Parts are switched on as they are ready; your servers follow without an update.">
        <ul className="space-y-1 text-[0.8125rem]">
          {s.accept_kinds.map((k) => <li key={k} className="flex gap-2"><Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent-text" />{kindText[k] ?? k}</li>)}
        </ul>
      </Row>
    </Section>
  );
}

function Keys({ networkId, settings: s }: { networkId: string; settings: IntelSettings }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // The new key, shown until the page closes or the key is revoked.
  const [created, setCreated] = useState<{ id: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = s.keys.filter((k) => !k.revoked);
  const refresh = () => qc.invalidateQueries({ queryKey: ["intel", networkId] });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setCopied(false);
    try {
      const res = await api.createIntelKey(networkId, name.trim());
      setCreated(res); setName("");
      track("intel_key_created");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "too_many_keys" ? "A network can have 10 active keys. Revoke one first." : "Could not create the key. Try again.");
    } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setError(null);
    if (created?.id === id) setCreated(null);
    try { await api.revokeIntelKey(networkId, id); }
    catch (err) { if (!(err instanceof ApiError && err.status === 404)) setError("Could not revoke the key. Try again."); }
    await refresh();
  }

  return (
    <Section title="API keys" description={
      <>Let your own tools, such as a Discord bot or a staff panel, fetch player reports from Intel Cloud. A key belongs to this network and sees what this page sees.{" "}
        <a href="https://intel-cloud.connectionguard.net/openapi.json" target="_blank" rel="noopener" className="underline underline-offset-4">API reference</a></>
    }>
      {s.keys.length > 0 && (
        <ul className="divide-y divide-line">
          {s.keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-4 px-6 py-3">
              <div className="min-w-0">
                <p className="flex items-baseline gap-2"><span className="truncate font-medium">{k.name}</span><span className="mono shrink-0 text-[0.75rem] text-fg-3">cgk_…{k.hint}</span></p>
                <p className="text-[0.75rem] text-fg-3">Created {ago(k.created_at)}{k.created_by_name ? ` by ${k.created_by_name}` : ""}{k.revoked_at ? ` · revoked ${ago(k.revoked_at)}` : ""}</p>
              </div>
              {k.revoked ? <span className="badge badge-neutral">Revoked</span> : <button type="button" className="btn btn-ghost h-8 px-2 text-[0.8125rem]" onClick={() => revoke(k.id)}>Revoke</button>}
            </li>
          ))}
        </ul>
      )}
      <div className="px-6 py-5">
        <form onSubmit={create} className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Key name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={48} placeholder="What it is for, e.g. Discord bot" />
          </label>
          <button type="submit" className="btn btn-secondary shrink-0" disabled={busy || !name.trim() || active.length >= 10}>{busy ? "Creating…" : "Create key"}</button>
        </form>
        {created && (
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3">
            <p className="text-[0.8125rem] font-medium">Copy the key now. It is shown only once; store it like a password.</p>
            <div className="mt-2 flex gap-2">
              <input readOnly className="input mono ph-no-capture text-[0.8125rem]" value={created.key} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn-secondary shrink-0" onClick={async () => { await navigator.clipboard.writeText(created.key); setCopied(true); }}>
                {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy</>}
              </button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-[0.8125rem] text-danger-text">{error}</p>}
      </div>
    </Section>
  );
}

function Sources({ settings: s }: { settings: IntelSettings }) {
  return (
    <Section title="Sources" description="Where reports come from besides linked networks. Answers are cached, so a report is quick even when a source is slow.">
      <ul className="divide-y divide-line">
        {s.sources.map((src) => (
          <li key={src.id} className="flex items-center justify-between gap-4 px-6 py-3 text-[0.875rem]">
            <span>{src.name}</span>
            <span className={`badge ${src.available ? "badge-admitted" : "badge-neutral"}`}>{src.available ? "Connected" : "Not connected yet"}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
