import { useState } from "react";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDismissed } from "../dismissed.ts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleAlert, CircleCheck, Eye, Server, ShieldCheck } from "lucide-react";
import { api, ApiError, type Install, type Range } from "../api.ts";
import { Shell } from "../components/Shell.tsx";
import { TallyChart } from "../components/TallyChart.tsx";
import { Attention } from "../components/Attention.tsx";
import { DecisionTable } from "../components/Register.tsx";
import { StatusDot } from "../components/Badge.tsx";
import { SetupChecklist } from "../components/SetupChecklist.tsx";
import { notes, providers, type ProviderRow } from "../health.ts";
import { ago, countryName, ms, num, pct, platformName, reasonText, serverName } from "../format.ts";

const RANGES: { id: Range; label: string; long: string }[] = [
  { id: "24h", label: "24h", long: "24 hours" }, { id: "7d", label: "7d", long: "7 days" },
  { id: "30d", label: "30d", long: "30 days" }, { id: "90d", label: "90d", long: "90 days" },
];

/** Change versus the previous period of the same length. "Up" is neither good nor bad by itself. */
function Delta({ now, before, rangeLabel }: { now: number; before: number; rangeLabel: string }) {
  if (before === 0) return now === 0 ? null : <span className="text-[0.75rem] text-fg-3">new vs previous {rangeLabel}</span>;
  const change = (now - before) / before;
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="num inline-flex items-center gap-0.5 text-[0.75rem] text-fg-2" title={`Previous ${rangeLabel}: ${num(before)}`}>
      <Icon aria-hidden className="size-3.5" />{change >= 0 ? "+" : ""}{(change * 100).toFixed(Math.abs(change) < 0.1 ? 1 : 0)}%
      <span className="text-fg-3">&nbsp;vs previous</span>
    </span>
  );
}

function Kpi({ label, value, sub, tone, delta }: { label: string; value: string; sub?: string | undefined; tone?: "danger" | "warn" | undefined; delta?: React.ReactNode }) {
  return (
    <div className="card px-5 py-4">
      <dt className="label flex items-center gap-2">
        {tone && <span aria-hidden className={`size-1.5 rounded-full ${tone === "danger" ? "bg-danger" : "bg-warn"}`} />}{label}
      </dt>
      <dd className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="num text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">{value}</span>{delta}
      </dd>
      <dd className="mt-2 min-h-[1.25rem] text-[0.8125rem] text-fg-3">{sub}</dd>
    </div>
  );
}

function CardHeader({ title, id, children }: { title: string; id?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 id={id} className="text-sm font-medium">{title}</h2>
      {children}
    </div>
  );
}

function ProviderLine({ p }: { p: ProviderRow }) {
  const ratio = p.daily_budget ? Math.min(1, (p.daily_used ?? 0) / p.daily_budget) : null;
  const health = p.attempts > 0 ? p.successes / p.attempts : null;
  const bad = p.paused || (health !== null && p.attempts >= 5 && health < 0.8);
  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          <StatusDot tone={bad ? "danger" : health === null ? "idle" : "ok"} />
          {p.id}<span className="text-[0.8125rem] font-normal text-fg-3">{p.scope === "GEO" ? "Country" : "VPN"}</span>
        </span>
        <span className={`num text-[0.8125rem] ${bad ? "font-medium text-danger-text" : "text-fg-2"}`}>
          {p.paused ? "Paused" : health === null ? "No lookups yet" : `${pct(health, 0)} answered`}
        </span>
      </div>
      {ratio !== null && (
        <div className="mt-2.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle" role="meter" aria-valuemin={0} aria-valuemax={p.daily_budget!} aria-valuenow={p.daily_used ?? 0} aria-label={`${p.id} daily quota`}>
            <div className={`h-full rounded-full ${ratio >= 0.8 ? "bg-danger" : "bg-fg"}`} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
          </div>
          <p className="num mt-1.5 flex justify-between text-[0.75rem] text-fg-3"><span>Quota today</span><span>{num(p.daily_used ?? 0)} / {num(p.daily_budget!)}</span></p>
        </div>
      )}
    </li>
  );
}

function ServerRow({ i }: { i: Install }) {
  const mode = i.status?.mode;
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5">
          <StatusDot tone={i.online ? "ok" : "danger"} />
          <div className="min-w-0">
            <p className="truncate font-medium">{serverName(i)}</p>
            <p className="max-w-[10rem] truncate text-[0.8125rem] text-fg-3 sm:max-w-none" title={i.platform_version}>{platformName[i.platform]}<span className="hidden sm:inline"> · {i.platform_version}</span></p>
          </div>
        </div>
      </td>
      <td className="mono hidden text-[0.8125rem] text-fg-2 sm:table-cell">v{i.plugin_version}</td>
      <td>{mode === "ENFORCE" ? <span className="badge badge-neutral"><ShieldCheck aria-hidden className="size-3" strokeWidth={2.5} />Enforce</span> : mode === "OBSERVE" ? <span className="badge badge-would"><Eye aria-hidden className="size-3" strokeWidth={2.5} />Observe</span> : null}</td>
      <td className="num whitespace-nowrap text-right text-[0.8125rem]">
        {i.online ? <span className="text-fg-3">{ago(i.last_seen_at)}</span> : <span className="font-medium text-danger-text">Offline<span className="hidden sm:inline"> · {ago(i.last_seen_at)}</span></span>}
      </td>
    </tr>
  );
}

function Bars({ rows, total, label }: { rows: { key: string; name: string; value: number; tone?: string | undefined }[]; total: number; label: string }) {
  return (
    <ul aria-label={label} className="space-y-1 px-2 py-2.5">
      {rows.map((r) => (
        <li key={r.key} className="px-2 py-1.5 text-[0.8125rem]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">{r.tone && <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${r.tone}`} />}<span className="truncate">{r.name}</span></span>
            <span className="num text-fg-2">{num(r.value)}</span>
          </div>
          <div aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-subtle">
            <div className="h-full rounded-full bg-fg-3/60" style={{ width: `${Math.max(1.5, (r.value / Math.max(1, total)) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Overview() {
  const { networkId } = useParams({ from: "/n/$networkId" });
  const { server } = useSearch({ from: "/n/$networkId" });
  const [range, setRange] = useState<Range>("24h");
  const net = useQuery({ queryKey: ["network", networkId], queryFn: () => api.network(networkId) });
  const stats = useQuery({ queryKey: ["stats", networkId, range, server], queryFn: () => api.stats(networkId, range, server), placeholderData: (prev) => prev });
  const latest = useQuery({ queryKey: ["events", networkId, "latest", server], queryFn: () => api.events(networkId, { limit: 8, install: server }) });
  const { isDismissed, dismiss, restoreAll } = useDismissed(networkId);
  const qc = useQueryClient();

  if (net.error) {
    return <Shell networkId={networkId}><p role="alert" className="text-danger-text">{net.error instanceof ApiError && net.error.status === 404 ? "This network does not exist or you are not a member." : "The overview could not be loaded. It retries every minute."}</p></Shell>;
  }
  const allInstalls = net.data?.installs ?? [];
  const installs = server ? allInstalls.filter((i) => i.id === server) : allInstalls;
  const t = stats.data?.totals;
  const anyObserving = installs.some((i) => i.status?.mode === "OBSERVE");
  const observing = installs.length > 0 && installs.every((i) => i.status?.mode === "OBSERVE");
  const allNotes = notes(installs);
  const attention = allNotes.filter((n) => !isDismissed(n));
  const dismissedCount = allNotes.length - attention.length;
  const canManage = net.data?.role !== "viewer";
  const removeServer = canManage ? async (installId: string) => { await api.unlink(installId); await qc.invalidateQueries(); } : undefined;
  const settingsLink = (label: string) => (
    <Link to="/n/$networkId/settings" params={{ networkId }} search={server ? { server } : {}} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium no-underline hover:underline">
      {label} <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
  const showDismissed = dismissedCount > 0 && (
    <button type="button" className="text-[0.8125rem] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg" onClick={restoreAll}>
      Show {dismissedCount} dismissed
    </button>
  );
  const actions = attention.filter((n) => n.tone === "action").length;
  const tips = attention.length - actions;
  const countText = [actions > 0 && `${actions} ${actions === 1 ? "issue" : "issues"}`, tips > 0 && `${tips} ${tips === 1 ? "tip" : "tips"}`].filter(Boolean).join(" · ");
  const lastSeen = installs.reduce((m, i) => Math.max(m, i.last_seen_at), 0);
  const rangeLong = RANGES.find((r) => r.id === range)!.long;

  const status = !net.data ? null
    : installs.length === 0 ? { tone: "idle" as const, title: "No servers yet", sub: "Start a server with Connection Guard 0.5 or newer and open the link it prints." }
    : actions > 0 ? { tone: "danger" as const, title: `${actions} ${actions === 1 ? "issue needs" : "issues need"} your attention`, sub: tips > 0 ? `Plus ${tips} ${tips === 1 ? "tip" : "tips"} to improve your setup.` : "Review them to keep checks reliable." }
    : { tone: "ok" as const, title: "All systems normal", sub: `${installs.length === 1 ? "Your server is" : `${installs.length} servers are`} reporting. Last report ${ago(lastSeen)}.${dismissedCount ? ` ${dismissedCount} dismissed ${dismissedCount === 1 ? "note" : "notes"}.` : ""}` };

  const countryTotal = stats.data?.countries.reduce((n, c) => n + c.value, 0) ?? 0;
  const reasonRows = (stats.data?.reasons ?? []).flatMap((r) => r.key !== "FLAG_ALLOWED" ? [{ key: r.key, name: reasonText[r.key as keyof typeof reasonText] ?? r.key, value: r.value,
      tone: r.key === "VPN_FLAG" || r.key === "GEO_FLAG" ? "bg-danger" : undefined }] : [
    ...(t && t.would_refuse > 0 ? [{ key: "WOULD", name: "Would refuse in ENFORCE", value: t.would_refuse, tone: "bg-warn" }] : []),
    ...(t && t.flagged_let_in > 0 ? [{ key: "FLAG_ALLOWED", name: "Flagged, let in by settings", value: t.flagged_let_in }] : []),
  ]).sort((a, b) => b.value - a.value);

  return (
    <Shell networkId={networkId}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">Overview</h1>
          <p className="mt-1 text-fg-2">{net.data ? `${net.data.network.name}${server && installs[0] ? ` · ${serverName(installs[0])}` : ""}` : " "}</p>
        </div>
        <div role="group" aria-label="Period" className="segmented">
          {RANGES.map((r) => <button key={r.id} type="button" aria-pressed={range === r.id} aria-label={r.long} onClick={() => setRange(r.id)}>{r.label}</button>)}
        </div>
      </div>

      <section aria-label="Status" className="card mt-6 flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
        {status ? (
          <>
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
              {status.tone === "danger" ? <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger sm:mt-0" />
                : status.tone === "ok" ? <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-accent sm:mt-0" />
                : <Server aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-3 sm:mt-0" />}
              <div className="min-w-0">
                <p className="font-medium">{status.title}</p>
                <p className="text-[0.8125rem] text-fg-2">{status.sub}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-8 sm:pl-0">
            {anyObserving && <span className="badge badge-would"><Eye aria-hidden className="size-3" strokeWidth={2.5} />{observing ? "Observe mode" : "Some servers observe"}</span>}
            {attention.length > 0 && (
              <button type="button" className="btn btn-secondary h-8" onClick={() => {
                const target = document.getElementById(window.matchMedia("(min-width: 1024px)").matches ? "attention-rail" : "attention");
                target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
              }}>Review</button>
            )}
            </div>
          </>
        ) : <div className="skeleton h-9 w-full" />}
      </section>

      {net.data && (
        <SetupChecklist networkId={networkId} installs={allInstalls} role={net.data.role}
          hasDecisions={Boolean(latest.data?.events.length) || (t?.checks ?? 0) > 0} wouldRefuse={t?.would_refuse ?? 0} />
      )}

      <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Checked" value={t ? num(t.checks) : "–"} sub={t ? `${num(t.lookups)} provider lookups` : undefined}
          delta={t && stats.data && <Delta now={t.checks} before={stats.data.previous.checks} rangeLabel={rangeLong} />} />
        <Kpi label="Refused" value={t ? num(t.denied) : "–"} tone={t && t.denied > 0 ? "danger" : undefined} sub={t && t.checks ? `${pct(t.denied / t.checks)} of checks` : undefined}
          delta={t && stats.data && <Delta now={t.denied} before={stats.data.previous.denied} rangeLabel={rangeLong} />} />
        {anyObserving
          ? <Kpi label="Would refuse" value={t ? num(t.would_refuse) : "–"} tone="warn" sub={observing ? "If you switch to ENFORCE" : "On servers that only observe"} />
          : <Kpi label="Errors" value={t ? num(t.errors) : "–"} tone={t && t.errors > 0 ? "danger" : undefined} sub="Checks that failed" />}
        <Kpi label="VPN rate" value={t && t.checks ? pct(t.vpn_positive / t.checks) : "–"} sub={t ? `${num(t.vpn_positive)} VPN or proxy found` : undefined}
          delta={t && stats.data && <Delta now={t.vpn_positive} before={stats.data.previous.vpn_positive} rangeLabel={rangeLong} />} />
      </dl>

      {attention.length > 0 && (
        <section id="attention" aria-labelledby="att-m" className="card mt-4 scroll-mt-28 overflow-hidden lg:hidden">
          <CardHeader id="att-m" title="Needs attention"><span className="num text-[0.8125rem] text-fg-3">{countText}</span></CardHeader>
          <Attention notes={attention} onDismiss={dismiss} onRemoveServer={removeServer} settingsLink={settingsLink} />
          {showDismissed && <div className="border-t border-line px-4 py-2.5">{showDismissed}</div>}
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <section className="card" aria-labelledby="chart-h">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
              <h2 id="chart-h" className="text-sm font-medium">Connections · {rangeLong}</h2>
              <dl className="flex gap-5 text-[0.8125rem]">
                <div><dt className="text-fg-3">Check time p95</dt><dd className="num font-medium">{t ? ms(t.latency_p95_max) : "–"}</dd></div>
                <div><dt className="text-fg-3">Cache hits</dt><dd className="num font-medium">{t ? pct(t.cache_hit_rate, 0) : "–"}</dd></div>
              </dl>
            </div>
            <div className="px-5 pb-4 pt-2">{stats.data ? <TallyChart stats={stats.data} /> : <div className="skeleton h-56" />}</div>
          </section>

          <section className="card overflow-hidden" aria-labelledby="latest-h">
            <CardHeader id="latest-h" title="Latest decisions">
              <Link to="/n/$networkId/register" params={{ networkId }} search={server ? { server } : {}} className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-fg-2 no-underline hover:text-fg">
                View all <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </CardHeader>
            {latest.data && latest.data.events.length > 0 ? (
              <div className="overflow-x-auto"><DecisionTable events={latest.data.events} installs={installs} compact /></div>
            ) : latest.isPending ? <div className="space-y-2 p-4">{[0, 1, 2].map((k) => <div key={k} className="skeleton h-7" />)}</div> : (
              <p className="px-4 py-8 text-center text-fg-2">No decisions yet. The next login on a linked server shows up here after its next sync, usually within a minute.</p>
            )}
          </section>

          <section className="card overflow-hidden" aria-labelledby="servers-h">
            <CardHeader id="servers-h" title="Servers"><span className="num text-[0.8125rem] text-fg-3">{installs.length}</span></CardHeader>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th scope="col">Server</th><th scope="col" className="hidden sm:table-cell">Version</th><th scope="col">Mode</th><th scope="col" className="text-right">Last report</th></tr></thead>
                <tbody>{installs.map((i) => <ServerRow key={i.id} i={i} />)}</tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-4" aria-label="Details">
          <section id={attention.length > 0 ? "attention-rail" : undefined} className={`card scroll-mt-28 overflow-hidden ${attention.length > 0 ? "hidden lg:block" : ""}`} aria-labelledby="att-h">
            <CardHeader id="att-h" title="Needs attention">{attention.length > 0 && <span className="num text-[0.8125rem] text-fg-3">{countText}</span>}</CardHeader>
            {net.data && attention.length === 0
              ? <p className="flex items-center gap-2.5 px-4 py-4 text-fg-2"><CircleCheck aria-hidden className="size-4 text-accent" /> {dismissedCount ? "Nothing new." : "Nothing right now. Providers answer and quotas are fine."}</p>
              : <Attention notes={attention} onDismiss={dismiss} onRemoveServer={removeServer} settingsLink={settingsLink} />}
            {showDismissed && <div className="border-t border-line px-4 py-2.5">{showDismissed}</div>}
          </section>
          <section className="card overflow-hidden" aria-labelledby="prov-h">
            <CardHeader id="prov-h" title="Providers" />
            <ul className="divide-y divide-line text-[0.875rem]">{providers(installs).map((p) => <ProviderLine key={`${p.id}-${p.scope}`} p={p} />)}</ul>
          </section>
          {reasonRows.length > 0 && (
            <section className="card overflow-hidden" aria-labelledby="why-h">
              <CardHeader id="why-h" title="Decisions by reason" />
              <Bars label="Decisions by reason" total={reasonRows[0]!.value} rows={reasonRows} />
            </section>
          )}
        </aside>
      </div>

      {Boolean(stats.data?.countries.length) && (
        <div className="mt-4">
          {stats.data && stats.data.countries.length > 0 && (
            <section className="card overflow-hidden" aria-labelledby="cc-h">
              <CardHeader id="cc-h" title="Top countries" />
              <div className="grid md:grid-cols-2 md:divide-x md:divide-line">
                <Bars label="Connections by country, top 4" total={stats.data.countries[0]!.value}
                  rows={stats.data.countries.slice(0, 4).map((c) => ({ key: c.key, name: countryName(c.key), value: c.value }))} />
                {stats.data.countries.length > 4 && <Bars label="Connections by country, 5 to 8" total={stats.data.countries[0]!.value}
                  rows={stats.data.countries.slice(4, 8).map((c) => ({ key: c.key, name: countryName(c.key), value: c.value }))} />}
              </div>
              <p className="border-t border-line px-4 py-2 text-[0.75rem] text-fg-3">{num(countryTotal)} connections with a known country</p>
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}
