import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Install, RegisterEvent } from "../api.ts";
import { ago, clock, countryName, day, explain, ms, reasonLabel, serverName, verdict } from "../format.ts";
import { VerdictBadge } from "./Badge.tsx";

const trustText: Record<RegisterEvent["identity_trust"], string> = {
  UNTRUSTED: "Not verified",
  AUTHENTICATED: "Mojang-authenticated",
  FORWARDED: "Forwarded by proxy",
  PLATFORM_ONLINE: "Online-mode server",
  FLOODGATE: "Bedrock (Floodgate)",
  VERIFIED_FORWARDING: "Verified proxy forwarding",
};

const primarySource = (e: RegisterEvent) => e.sources.find((s) => s.country || s.isp) ?? e.sources[0];

/** Decisions table. Rows open the why sheet; the newest rows briefly highlight when they arrive. */
export function DecisionTable({ events, installs, selected, onSelect, compact = false, narrow = false, fresh }: {
  events: RegisterEvent[]; installs: Install[]; selected?: string | null; onSelect?: ((e: RegisterEvent) => void) | undefined;
  compact?: boolean; narrow?: boolean; fresh?: Set<string>;
}) {
  const names = new Map(installs.map((i) => [i.id, serverName(i)]));
  const multi = installs.length > 1;
  const wide = !compact && !narrow;
  return (
    <table className="table ph-no-capture">
      <thead>
        <tr>
          <th scope="col">Connection</th>
          {wide && <th scope="col" className="hidden md:table-cell">Origin</th>}
          <th scope="col">Verdict</th>
          {!narrow && <th scope="col" className="hidden lg:table-cell">Reason</th>}
          <th scope="col" className="text-right">Time</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => {
          const src = primarySource(e);
          const v = verdict(e);
          return (
            <tr key={e.id}
              className={`${onSelect ? "cursor-pointer" : ""} transition-colors ${selected === e.id ? "bg-subtle" : onSelect ? "hover:bg-subtle/70" : ""} ${fresh?.has(e.id) ? "row-new" : ""}`}
              onClick={onSelect ? () => onSelect(e) : undefined}>
              <td>
                <div className="flex min-w-0 items-baseline gap-2">
                  {onSelect
                    ? <button type="button" className="mono truncate text-left font-medium hover:underline" onClick={(ev) => { ev.stopPropagation(); onSelect(e); }}>{e.ip}</button>
                    : <span className="mono truncate font-medium">{e.ip}</span>}
                  {multi && <span className="hidden truncate text-[0.8125rem] text-fg-3 sm:inline">{names.get(e.install_id)}</span>}
                </div>
              </td>
              {wide && (
                <td className="hidden max-w-72 truncate text-fg-2 md:table-cell">
                  {src?.country ? countryName(src.country) : "Unknown"}{src?.isp ? <span className="text-fg-3"> · {src.isp}</span> : null}
                </td>
              )}
              <td><VerdictBadge verdict={v} /></td>
              {!narrow && <td className={`hidden whitespace-nowrap lg:table-cell ${v === "refused" ? "text-danger-text" : "text-fg-2"}`}>{reasonLabel(e)}</td>}
              <td className="num whitespace-nowrap text-right text-[0.8125rem] text-fg-3" title={`${day(e.at)}, ${clock(e.at)}`}>{compact ? ago(e.at) : clock(e.at)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2.5">
      <dt className="text-fg-2">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Side sheet with the full reasoning for one decision. Not modal: the table stays usable. */
export function WhySheet({ event, installs, onClose }: { event: RegisterEvent; installs: Install[]; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const [modal, setModal] = useState(() => window.matchMedia("(max-width: 1023px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setModal(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // Below lg the sheet covers the page, so it behaves as a modal dialog: background inert, focus returns on close.
  useEffect(() => {
    opener.current = document.activeElement;
    // Header and main live in the shell wrapper; the sheet renders outside it.
    const shell = document.querySelector<HTMLElement>("[data-shell]");
    if (modal && shell) shell.inert = true;
    return () => {
      if (shell) shell.inert = false;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [modal]);
  useEffect(() => { closeRef.current?.focus(); }, [event.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const install = installs.find((i) => i.id === event.install_id);
  const v = verdict(event);
  const tone = v === "refused" ? "border-danger/30 bg-danger-soft" : v === "would-refuse" ? "border-warn/30 bg-warn-soft" : "border-line bg-subtle";
  return (
    <aside key={event.id} aria-label="Decision details" role={modal ? "dialog" : undefined} aria-modal={modal || undefined}
      className="ph-no-capture sheet-in fixed inset-0 z-30 overflow-y-auto bg-surface lg:inset-y-3 lg:left-auto lg:right-3 lg:w-[28rem] lg:rounded-xl lg:border lg:border-line lg:shadow-[var(--shadow-pop)]">
      <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface/90 px-5 py-3 backdrop-blur">
        <h2 className="text-sm font-medium">Decision</h2>
        <button ref={closeRef} type="button" onClick={onClose} className="btn btn-ghost size-8 p-0" aria-label="Close"><X className="size-4" /></button>
      </div>
      <div className="px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mono truncate text-lg font-semibold tracking-tight">{event.ip}</p>
            <p className="num mt-0.5 text-[0.8125rem] text-fg-2">{day(event.at)}, {clock(event.at)}{install ? ` · ${serverName(install)}` : ""}</p>
          </div>
          <VerdictBadge verdict={v} />
        </div>
        <p className={`mt-5 rounded-lg border px-4 py-3 text-[0.875rem] leading-relaxed ${tone}`}>{explain(event)}</p>

        <dl className="mt-5 divide-y divide-line border-y border-line text-[0.875rem]">
          <Row label="Mode">{event.mode === "ENFORCE" ? "Enforce" : "Observe (logs only)"}</Row>
          <Row label="Reason">{reasonLabel(event)}</Row>
          <Row label="Identity">{trustText[event.identity_trust]}</Row>
          {event.uuid && <Row label="Player UUID"><span className="mono break-all text-[0.8125rem]">{event.uuid}</span></Row>}
          <Row label="Checked in"><span className="num">{ms(event.duration_ms)}</span></Row>
          <Row label="VPN check">{checkText(event.vpn)}</Row>
          <Row label="Country check">{countryCheck(event)}</Row>
        </dl>

        {event.sources.length > 0 && (
          <section className="mt-7">
            <h3 className="mb-2 text-sm font-medium">Providers</h3>
            <ul className="card divide-y divide-line">
              {event.sources.map((s) => (
                <li key={`${s.id}-${s.scope}`} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{s.id}</span>
                    <span className={`badge ${s.status === "POSITIVE" ? "badge-refused" : s.status === "NEGATIVE" ? "badge-admitted" : "badge-neutral"}`}>
                      {s.status === "POSITIVE" ? (s.scope === "GEO" ? "Country not allowed" : "VPN / proxy") : s.status === "NEGATIVE" ? "Clean" : "No answer"}
                    </span>
                  </div>
                  <p className="num mt-1 text-[0.8125rem] text-fg-2">
                    {[s.country && countryName(s.country), s.isp, s.asn !== null && `AS${s.asn}`, s.risk !== null && `risk ${s.risk}`,
                      s.from_cache ? "from cache" : ms(s.duration_ms), s.reason !== "NONE" && s.reason.toLowerCase().replace(/_/g, " "),
                      !s.voting && "not voting"].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {event.rules.length > 0 && (
          <section className="mt-7">
            <h3 className="mb-2 text-sm font-medium">Rules</h3>
            <ul className="card divide-y divide-line text-[0.875rem]">
              {event.rules.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 px-4 py-2.5">
                  <span className="mono text-[0.8125rem]">{r.id}</span>
                  <span className="text-fg-2">{r.effect.toLowerCase()} · {r.match.toLowerCase()}{r.selected ? " · applied" : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="mt-7 text-[0.8125rem] text-fg-3">Decisions are kept for 30 days, then only hourly totals remain.</p>
      </div>
    </aside>
  );
}

function countryCheck(e: RegisterEvent) {
  if (e.geo === "EXEMPT") return "Exempt from country rules";
  if (e.geo === "NOT_CHECKED") return "Not checked";
  const country = e.sources.find((s) => s.country)?.country;
  if (e.geo === "UNKNOWN" || !country) return "Country unknown, no provider answered";
  return e.flags.includes("GEO") ? `${countryName(country)}, not allowed by your country rules` : `${countryName(country)}, allowed`;
}

function checkText(c: RegisterEvent["vpn"]) {
  return { NOT_CHECKED: "Not checked", EXEMPT: "Exempt", POSITIVE: "VPN or proxy found", NEGATIVE: "Clean", KNOWN: "Known", UNKNOWN: "No answer" }[c];
}
