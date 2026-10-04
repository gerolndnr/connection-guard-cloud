// The real dashboard components, fed with clearly labeled example data.
import { useEffect, useMemo, useRef, useState } from "react";
import type { DecisionEvent } from "@cg/protocol";
import type { RegisterEvent, Stats } from "@web/api.ts";
import { TallyChart } from "@web/components/TallyChart.tsx";
import { DecisionTable } from "@web/components/Register.tsx";
import { VerdictBadge } from "@web/components/Badge.tsx";
import { countryName, explain, ms, num, reasonLabel, verdict } from "@web/format.ts";

// Deterministic example generator, so server and client render the same first frame.
function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); }
const PLAYERS = ["Steve_Builds", "Alex", "kitty_crafter", "Notch_Fan_42", "redstone_ruth", "Blockhead", "Pixel", "dragonslayer9"];
const ORIGINS: [string, string][] = [["DE", "Deutsche Telekom"], ["US", "Comcast"], ["GB", "BT"], ["NL", "KPN"], ["PL", "Orange Polska"], ["BR", "Claro"], ["SE", "Telia"]];
const VPNS: [string, string][] = [["NL", "M247 Europe"], ["US", "DigitalOcean"], ["DE", "Hetzner Online"]];

function makeEvent(r: () => number, at: number, i: number, force?: "vpn" | "geo"): RegisterEvent {
  const kind = r();
  const vpn = force ? force === "vpn" : kind < 0.16, geo = force ? force === "geo" : !vpn && kind < 0.22;
  const [cc, isp] = vpn ? VPNS[Math.floor(r() * VPNS.length)]! : geo ? ["RU", "Rostelecom"] : ORIGINS[Math.floor(r() * ORIGINS.length)]!;
  const cached = r() < 0.4;
  const ip = `${[84, 91, 176, 185, 31, 77][Math.floor(r() * 6)]}.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}.${1 + Math.floor(r() * 253)}`;
  const flags: DecisionEvent["flags"] = vpn ? ["VPN"] : geo ? ["GEO"] : [];
  return {
    id: `example-${i}`, install_id: "example", at, platform: "VELOCITY", phase: "LOGIN", mode: "ENFORCE",
    outcome: flags.length ? "DENY" : "ALLOW", reason: vpn ? "VPN_FLAG" : geo ? "GEO_FLAG" : "CHECKS_COMPLETE",
    identity_trust: "AUTHENTICATED", uuid: null, ip, vpn: vpn ? "POSITIVE" : "NEGATIVE", geo: "KNOWN", flags,
    duration_ms: cached ? 3 + Math.floor(r() * 6) : 90 + Math.floor(r() * 220),
    sources: [
      { id: "proxycheck", scope: "VPN", status: vpn ? "POSITIVE" : "NEGATIVE", reason: "NONE", duration_ms: 80 + Math.floor(r() * 150), voting: true, from_cache: cached, country: cc, asn: null, isp, risk: vpn ? 80 + Math.floor(r() * 20) : Math.floor(r() * 15) },
      { id: "iphub", scope: "VPN", status: vpn ? "POSITIVE" : "NEGATIVE", reason: "NONE", duration_ms: 60 + Math.floor(r() * 120), voting: true, from_cache: cached, country: null, asn: null, isp: null, risk: null },
      { id: "ip-api", scope: "GEO", status: geo ? "POSITIVE" : "NEGATIVE", reason: "NONE", duration_ms: 40 + Math.floor(r() * 80), voting: false, from_cache: cached, country: cc, asn: null, isp: null, risk: null },
    ],
    rules: [],
  };
}

function makeStats(now: number): Stats {
  const r = rng(7);
  const series = Array.from({ length: 24 }, (_, h) => {
    const t = Math.floor(now / 3_600_000) * 3_600_000 - (23 - h) * 3_600_000;
    const hour = new Date(t).getHours();
    const checks = Math.round(8 + 40 * Math.exp(-((hour - 20) ** 2) / 14) * (0.75 + r() * 0.5));
    const denied = Math.round(checks * (0.05 + r() * 0.06));
    return { t, checks, denied, would_refuse: 0, vpn_positive: Math.round(denied * 0.8), latency_p95: 300 };
  });
  const sum = (k: "checks" | "denied" | "vpn_positive") => series.reduce((n, p) => n + p[k], 0);
  const checks = sum("checks"), denied = sum("denied");
  return {
    range: "24h", from: series[0]!.t, to: now, bucket_ms: 3_600_000, series, countries: [], reasons: [],
    previous: { checks: Math.round(checks * 0.9), denied: Math.round(denied * 1.1), vpn_positive: sum("vpn_positive") },
    totals: { checks, allowed: checks - denied, denied, errors: 0, vpn_positive: sum("vpn_positive"), geo_flagged: denied - sum("vpn_positive"),
      cache_hits: Math.round(checks * 0.42), lookups: Math.round(checks * 0.58), would_refuse: 0, flagged_let_in: 0, latency_p95_max: 312, cache_hit_rate: 0.42 },
  };
}

// The first frame always shows both kinds of refusal, so the explanation panel has something to explain.
const FIRST_FRAME: ("vpn" | "geo" | undefined)[] = [undefined, "vpn", undefined, undefined, "geo", undefined];

export function DashboardPreview() {
  // A fixed reference time keeps the static HTML and the first client render identical.
  const [now] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  const stats = useMemo(() => makeStats(now), [now]);
  const gen = useRef(rng(11));
  const counter = useRef(0);
  const [events, setEvents] = useState<RegisterEvent[]>(() =>
    Array.from({ length: 6 }, (_, i) => makeEvent(gen.current, now - i * 47_000, counter.current++, FIRST_FRAME[i])));
  const [selected, setSelected] = useState<RegisterEvent | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);

  // A new example login every few seconds, only while visible and only without reduced motion.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = Boolean(e?.isIntersecting); }, { threshold: 0.2 });
    if (box.current) io.observe(box.current);
    const t = window.setInterval(() => {
      if (!visible || document.hidden) return;
      const e = makeEvent(gen.current, Date.now(), counter.current++);
      setEvents((prev) => [e, ...prev].slice(0, 6));
      setFresh(new Set([e.id]));
    }, 3800);
    return () => { window.clearInterval(t); io.disconnect(); };
  }, []);

  const shown = selected ?? events.find((e) => e.outcome === "DENY") ?? events[0]!;
  const src = shown.sources.find((s) => s.country);
  const t = stats.totals;
  const kpis: [string, string, string][] = [
    ["Checked", num(t.checks), "last 24 hours"],
    ["Refused", num(t.denied), `${((t.denied / t.checks) * 100).toFixed(1)}% of checks`],
    ["Cache hits", `${Math.round((t.cache_hit_rate ?? 0) * 100)}%`, "no lookup needed"],
    ["Check time", ms(t.latency_p95_max), "p95"],
  ];
  return (
    <div ref={box} className="overflow-hidden rounded-2xl border border-line bg-page">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5"><span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" /></span>
        <span className="mono truncate rounded-md bg-subtle px-2.5 py-1 text-[0.75rem] text-fg-2">app.connectionguard.net</span>
        <span className="ml-auto shrink-0 whitespace-nowrap rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn-text">Example data</span>
      </div>
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map(([label, value, sub]) => (
              <div key={label} className="card px-4 py-3">
                <dt className="label">{label}</dt>
                <dd className="num mt-1 text-xl font-semibold tracking-[-0.03em]">{value}</dd>
                <dd className="mt-0.5 text-[0.75rem] text-fg-3">{sub}</dd>
              </div>
            ))}
          </dl>
          <div className="card px-4 pb-3 pt-4"><TallyChart stats={stats} /></div>
          <div className="card overflow-hidden">
            <p className="border-b border-line px-4 py-3 text-sm font-medium">Latest decisions <span className="font-normal text-fg-3">· click one</span></p>
            <div className="overflow-x-auto max-sm:[&_td:last-child]:hidden max-sm:[&_th:last-child]:hidden"><DecisionTable events={events} installs={[]} compact narrow selected={shown.id} onSelect={setSelected} fresh={fresh} /></div>
          </div>
        </div>
        <aside aria-label="Why this decision" aria-live="polite" className="card h-fit p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mono truncate font-semibold">{shown.ip}</p>
              <p className="text-[0.75rem] text-fg-3">{src?.country ? `${countryName(src.country)} · ${src.isp ?? ""}` : "Unknown origin"}</p>
            </div>
            <VerdictBadge verdict={verdict(shown)} />
          </div>
          <p className="mt-3 rounded-lg border border-line bg-subtle px-3 py-2.5 text-[0.8125rem] leading-relaxed">{explain(shown)}</p>
          <dl className="mt-3 divide-y divide-line text-[0.8125rem]">
            <div className="flex justify-between gap-3 py-2"><dt className="text-fg-2">Reason</dt><dd>{reasonLabel(shown)}</dd></div>
            {shown.sources.map((s) => (
              <div key={s.id} className="flex justify-between gap-3 py-2">
                <dt className="text-fg-2">{s.id}</dt>
                <dd className={s.status === "POSITIVE" ? "text-danger-text" : "text-fg"}>{s.status === "POSITIVE" ? (s.scope === "GEO" ? "Country not allowed" : "VPN / proxy") : "Clean"}{s.from_cache ? " · cached" : ""}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 py-2"><dt className="text-fg-2">Checked in</dt><dd className="num">{ms(shown.duration_ms)}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
