import { useEffect, useRef, useState } from "react";
import { Ban, Check, RotateCw, ShieldCheck, X } from "lucide-react";
import { api, ApiError, type Install, type RegisterEvent, type RuleEffect, type RuleScope } from "../api.ts";
import { track } from "../analytics.ts";
import { RULE_DURATIONS, ago, clock, countryName, day, explain, ms, reasonLabel, serverName, supportsExpiry, verdict } from "../format.ts";
import { VerdictBadge } from "./Badge.tsx";
import { isLocalList, sourceLabel, sourceVerdict } from "../sources.ts";

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
export function DecisionTable({ events, installs, selected, onSelect, compact = false, narrow = false, fresh, players }: {
  events: RegisterEvent[]; installs: Install[]; selected?: string | null; onSelect?: ((e: RegisterEvent) => void) | undefined;
  compact?: boolean; narrow?: boolean; fresh?: Set<string>;
  /** Minecraft names by UUID, when known. */
  players?: Map<string, string | null>;
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
                  {(() => {
                    const player = e.uuid ? players?.get(e.uuid) : null;
                    const label = player
                      ? <><span className="font-medium">{player}</span> <span className="mono text-[0.8125rem] font-normal text-fg-3">{e.ip}</span></>
                      : <span className="mono font-medium">{e.ip}</span>;
                    return onSelect
                      ? <button type="button" className="truncate text-left hover:underline" onClick={(ev) => { ev.stopPropagation(); onSelect(e); }}>{label}</button>
                      : <span className="truncate">{label}</span>;
                  })()}
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
export function WhySheet({ event, installs, onClose, networkId, canManage = false, playerName }: {
  event: RegisterEvent; installs: Install[]; onClose: () => void;
  /** With a network and permission, the sheet offers one-click fixes (allow, block, check again). */
  networkId?: string; canManage?: boolean; playerName?: string | null;
}) {
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
            {playerName && <p className="truncate text-lg font-semibold tracking-tight">{playerName}</p>}
            <p className={`mono truncate ${playerName ? "text-[0.875rem] text-fg-2" : "text-lg font-semibold tracking-tight"}`}>{event.ip}</p>
            <p className="num mt-0.5 text-[0.8125rem] text-fg-2">{day(event.at)}, {clock(event.at)}{install ? ` · ${serverName(install)}` : ""}</p>
          </div>
          <VerdictBadge verdict={v} />
        </div>
        <p className={`mt-5 rounded-lg border px-4 py-3 text-[0.875rem] leading-relaxed ${tone}`}>{explain(event)}</p>
        {networkId && canManage && <Fixes key={event.id} event={event} networkId={networkId} playerName={playerName ?? null} installs={installs} />}

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
                    <span className="font-medium" title={s.id}>{sourceLabel(s.id)}</span>
                    <span className={`badge badge-${sourceVerdict(s).tone}`}>{sourceVerdict(s).text}</span>
                  </div>
                  <p className="num mt-1 text-[0.8125rem] text-fg-2">
                    {[s.country && countryName(s.country), s.isp, s.asn !== null && `AS${s.asn}`, s.risk !== null && `risk ${s.risk}`,
                      s.from_cache ? "from cache" : ms(s.duration_ms), s.reason !== "NONE" && s.reason.toLowerCase().replace(/_/g, " "),
                      !s.voting && "not voting", s.data_as_of && `data from ${day(s.data_as_of)}`].filter(Boolean).join(" · ")}
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

/** Identities the plugin trusts for UUID rules (the same set it uses for UUID matching). */
const TRUSTED = new Set<RegisterEvent["identity_trust"]>(["AUTHENTICATED", "PLATFORM_ONLINE", "VERIFIED_FORWARDING", "FORWARDED", "FLOODGATE"]);

type Fix = { key: string; label: string; hint: string; effect: RuleEffect; scope: RuleScope; target: string; icon: "allow" | "block"; tone: "primary" | "secondary" | "danger" };

/** One-click answers to "this was wrong": they become access rules on every server of the network. */
function Fixes({ event, networkId, playerName, installs }: { event: RegisterEvent; networkId: string; playerName: string | null; installs: Install[] }) {
  const servers = installs.length;
  const expiryServers = installs.filter(supportsExpiry).length;
  // Letting someone in for a while is the safer default; it needs servers that enforce the end themselves.
  const [minutes, setMinutes] = useState<number | null>(expiryServers > 0 ? 24 * 60 : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  const v = verdict(event);
  const flagged = v === "refused" || v === "would-refuse";
  const who = playerName ?? "this player";
  const asn = event.sources.find((s) => s.asn !== null && s.scope !== "GEO");
  const isp = asn?.isp ?? event.sources.find((s) => s.isp)?.isp ?? null;
  const uuidOk = Boolean(event.uuid) && TRUSTED.has(event.identity_trust);
  const fixes: Fix[] = flagged
    ? [
      ...(uuidOk ? [{ key: "allow-player", label: `Let ${who} in`, hint: `${minutes ? (RULE_DURATIONS.find((d) => d.minutes === minutes)?.long ?? "").replace(/^for/, "For") : "Always"}, from any address. Only works while the player's identity is verified.`, effect: "ALLOW" as const, scope: "ALL" as const, target: event.uuid!, icon: "allow" as const, tone: "primary" as const }] : []),
      { key: "allow-ip", label: "Allow this IP address", hint: minutes ? "Everyone connecting from it skips the checks until the time is up." : "Everyone connecting from it skips the checks.", effect: "ALLOW", scope: "ALL", target: event.ip, icon: "allow", tone: uuidOk ? "secondary" : "primary" },
      ...(asn && event.flags.includes("VPN") ? [{ key: "trust-asn", label: `Trust AS${asn.asn}${isp ? ` (${isp})` : ""} for VPN checks`, hint: "For a home or school provider that detection services wrongly list.", effect: "EXEMPT" as const, scope: "VPN" as const, target: `ASN:${asn.asn}`, icon: "allow" as const, tone: "secondary" as const }] : []),
    ]
    : [
      ...(uuidOk ? [{ key: "block-player", label: `Block ${who}`, hint: "Refused from any address.", effect: "DENY" as const, scope: "ALL" as const, target: event.uuid!, icon: "block" as const, tone: "danger" as const }] : []),
      { key: "block-ip", label: "Block this IP address", hint: "Everyone connecting from it is refused.", effect: "DENY", scope: "ALL", target: event.ip, icon: "block", tone: "danger" },
    ];

  const run = async (f: Fix) => {
    if (f.effect === "DENY" && confirm !== f.key) { setConfirm(f.key); return; }
    setBusy(f.key); setConfirm(null);
    const limited = f.effect !== "DENY" ? minutes : null;
    try {
      const res = await api.addRule(networkId, { effect: f.effect, scope: f.scope, target: f.target, note: playerName ? `from decision: ${playerName}` : "from decision", expires_in_minutes: limited });
      const n = res.servers ?? servers;
      const span = limited ? ` ${RULE_DURATIONS.find((d) => d.minutes === limited)?.long ?? ""}` : "";
      setDone((d) => ({ ...d, [f.key]: res.duplicate ? "Already a rule. Remove it under Network to change it."
        : `Done${span}, on ${n} ${n === 1 ? "server" : "servers"}. Applies within a minute.${res.skipped ? ` Not sent to ${res.skipped} older ${res.skipped === 1 ? "server" : "servers"} that can't end it on time.` : ""}` }));
      track("decision_fix", { fix: f.key, verdict: v, minutes: limited });
    } catch (err) {
      setDone((d) => ({ ...d, [f.key]: err instanceof ApiError ? "Could not save this rule." : "No connection. Try again." }));
    } finally { setBusy(null); }
  };
  const recheck = async () => {
    setBusy("recheck");
    try { await api.recheck(networkId, event.ip); setDone((d) => ({ ...d, recheck: "The next login from this address is checked fresh." })); track("decision_fix", { fix: "recheck", verdict: v }); }
    catch { setDone((d) => ({ ...d, recheck: "Could not send. Try again." })); }
    finally { setBusy(null); }
  };

  return (
    <section className="mt-5" aria-label="Fix this decision">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{flagged ? "Was this wrong?" : "Should this player be kept out?"}</h3>
        {flagged && expiryServers > 0 && (
          <div role="group" aria-label="How long" className="segmented">
            {RULE_DURATIONS.map((d) => <button key={d.label} type="button" aria-pressed={minutes === d.minutes} onClick={() => setMinutes(d.minutes)}>{d.label}</button>)}
          </div>
        )}
      </div>
      <ul className="space-y-2">
        {fixes.map((f) => (
          <li key={f.key}>
            {done[f.key] ? (
              <p role="status" className="flex items-start gap-2 rounded-lg border border-line bg-subtle px-3 py-2.5 text-[0.8125rem]"><Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" />{done[f.key]}</p>
            ) : (
              <button type="button" disabled={busy !== null} onClick={() => run(f)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${f.tone === "primary" ? "border-accent/40 bg-accent-soft hover:border-accent" : f.tone === "danger" ? "border-line hover:border-danger/50 hover:bg-danger-soft" : "border-line hover:bg-subtle"}`}>
                {f.icon === "allow" ? <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-text" /> : <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-danger-text" />}
                <span className="min-w-0">
                  <span className="block text-[0.875rem] font-medium">{confirm === f.key ? `Confirm: ${f.label.toLowerCase()}` : busy === f.key ? "Sending…" : f.label}</span>
                  <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-fg-2">{f.hint}</span>
                </span>
              </button>
            )}
          </li>
        ))}
        {/* A hit on a list the server keeps (Tor list, Intel) is not a cached answer: checking again changes nothing. */}
        {!event.sources.some((x) => isLocalList(x.id) && x.status === "POSITIVE") && <li>
          {done.recheck
            ? <p role="status" className="flex items-start gap-2 rounded-lg border border-line bg-subtle px-3 py-2.5 text-[0.8125rem]"><Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" />{done.recheck}</p>
            : <button type="button" disabled={busy !== null} onClick={recheck} className="flex w-full items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition-colors hover:bg-subtle disabled:opacity-60">
                <RotateCw aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-2" />
                <span><span className="block text-[0.875rem] font-medium">{busy === "recheck" ? "Sending…" : "Check this address again"}</span>
                  <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-fg-2">Forgets the cached answer, for example after the player turned their VPN off.</span></span>
              </button>}
        </li>}
      </ul>
      <p className="mt-2 text-[0.75rem] text-fg-3">
        Rules you add here are listed under Network, where you can remove them.
        {flagged && expiryServers === 0 && " Letting someone in for a limited time needs a newer Connection Guard on your servers."}
      </p>
    </section>
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
