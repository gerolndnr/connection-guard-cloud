// Add an access rule for an address, a player, a provider network, a provider or operator name, a country or a
// connection type. Every kind maps to a selector the plugin (0.5.0+) understands; the API stores its canonical form.
import { useEffect, useId, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CONNECTION_TYPES, ruleMatchesEvent, ruleTarget, type ConnectionType } from "@cg/protocol/rules";
import { api, ApiError, type NetworkView, type RuleEffect, type RuleScope } from "../api.ts";
import { COUNTRIES } from "../countries.ts";
import { RULE_DURATIONS, num, supportsExpiry, verdict } from "../format.ts";
import { HISTORY_DAYS, useHistory } from "../history.ts";
import { track } from "../analytics.ts";

export type BuilderKind = "address" | "asn" | "isp" | "operator" | "country" | "type";

const KINDS: { id: BuilderKind; label: string }[] = [
  { id: "address", label: "Player or address" }, { id: "asn", label: "Network" }, { id: "isp", label: "Provider" },
  { id: "operator", label: "Operator" }, { id: "country", label: "Country" }, { id: "type", label: "Connection type" },
];

export const TYPE_TEXT: Record<ConnectionType, { label: string; body: string }> = {
  VPN: { label: "VPN", body: "Commercial VPN services." },
  PROXY: { label: "Proxy", body: "Public and anonymising proxies." },
  TOR: { label: "Tor", body: "Tor exit nodes." },
  RELAY: { label: "Relay", body: "Privacy relays such as iCloud Private Relay. Often ordinary Apple users." },
  HOSTING: { label: "Hosting", body: "Data centres and cloud servers, where real players rarely connect from." },
};

const effectText: Record<RuleEffect, string> = { ALLOW: "Let in", DENY: "Refuse", EXEMPT: "Skip checks" };
const scopeText: Record<RuleScope, string> = { ALL: "all checks", VPN: "VPN checks", GEO: "country checks" };
const defaultScope: Record<BuilderKind, RuleScope> = { address: "ALL", asn: "VPN", isp: "VPN", operator: "VPN", country: "GEO", type: "VPN" };

export interface Prefill { target?: string; effect?: RuleEffect }

const PRESETS: { label: string; kind: BuilderKind; value: string; effect: RuleEffect }[] = [
  { label: "Refuse Tor", kind: "type", value: "TOR", effect: "DENY" },
  { label: "Refuse data centres", kind: "type", value: "HOSTING", effect: "DENY" },
  { label: "Refuse public proxies", kind: "type", value: "PROXY", effect: "DENY" },
  { label: "Trust a home or school provider", kind: "isp", value: "", effect: "EXEMPT" },
];

/** Splits a stored or suggested target back into the builder's kind and value. */
function fromTarget(target: string): { kind: BuilderKind; value: string } {
  const i = target.indexOf(":");
  const head = i > 0 ? target.slice(0, i).toLowerCase() : "";
  if (head === "asn") return { kind: "asn", value: `AS${target.slice(i + 1)}` };
  if (head === "isp" || head === "operator" || head === "country" || head === "type") return { kind: head, value: target.slice(i + 1) };
  return { kind: "address", value: target };
}

function compose(kind: BuilderKind, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  switch (kind) {
    case "address": return ruleTarget(v);
    case "asn": return ruleTarget(/^asn?:/i.test(v) ? v : `AS${v.replace(/^AS/i, "")}`);
    default: return ruleTarget(`${kind}:${v}`);
  }
}

export function RuleBuilder({ networkId, view, prefill, onAdded }: { networkId: string; view: NetworkView; prefill?: Prefill; onAdded?: () => void }) {
  const qc = useQueryClient();
  const initial = prefill?.target ? fromTarget(prefill.target) : { kind: "address" as BuilderKind, value: "" };
  const [kind, setKind] = useState<BuilderKind>(initial.kind);
  const [value, setValue] = useState(initial.value);
  const [effect, setEffect] = useState<RuleEffect>(prefill?.effect ?? "ALLOW");
  const [scope, setScope] = useState<RuleScope>(defaultScope[initial.kind]);
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const expiryOk = view.installs.some(supportsExpiry);

  useEffect(() => {
    if (!prefill?.target) return;
    const p = fromTarget(prefill.target);
    setKind(p.kind); setValue(p.value); setScope(defaultScope[p.kind]);
    if (prefill.effect) setEffect(prefill.effect);
  }, [prefill?.target, prefill?.effect]);

  const pickKind = (k: BuilderKind) => { setKind(k); setScope(defaultScope[k]); setValue(k === "type" ? "TOR" : ""); setError(null); };
  const target = compose(kind, value);

  // Preview: how the rule would have matched the last week's logins, where the decision log carries the evidence.
  const history = useHistory(networkId, { enabled: target !== null });
  const preview = useMemo(() => {
    if (!target || !history.data) return null;
    const events = history.data.events;
    let matched = 0, refused = 0, unknown = false;
    for (const e of events) {
      const m = ruleMatchesEvent(target, e);
      if (m === null) { unknown = true; break; }
      if (m) { matched++; if (verdict(e) !== "admitted") refused++; }
    }
    return unknown ? null : { matched, refused, total: events.length, truncated: history.data.truncated };
  }, [target, history.data]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) { setError(invalidText[kind]); return; }
    setBusy(true); setError(null);
    try {
      await api.addRule(networkId, { effect, scope, target, note: note.trim() || null, expires_in_minutes: minutes });
      track("rule_builder_added", { kind, effect, scope, temporary: minutes !== null });
      setValue(kind === "type" ? value : ""); setNote("");
      await qc.invalidateQueries({ queryKey: ["rules", networkId] });
      onAdded?.();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "invalid_target" ? invalidText[kind]
        : err instanceof ApiError && err.code === "rule_expiry_unsupported" ? "Your servers can't end a rule on time yet. Choose Always, or update Connection Guard." : "The rule could not be saved.");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={add} className="grid gap-4 border-t border-line px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label">Add a rule</span>
        <div className="flex flex-wrap gap-1.5" aria-label="Common rules">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn btn-secondary h-7 rounded-full px-2.5 text-[0.8125rem] font-normal"
              onClick={() => { setKind(p.kind); setValue(p.value); setEffect(p.effect); setScope(defaultScope[p.kind]); setError(null); track("rule_preset_picked", { preset: p.label }); }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div role="radiogroup" aria-label="Rule for" className="segmented flex-wrap">
        {KINDS.map((k) => <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} aria-pressed={kind === k.id} onClick={() => pickKind(k.id)}>{k.label}</button>)}
      </div>

      <TargetInput kind={kind} value={value} onChange={(v) => { setValue(v); setError(null); }} />

      <div className="grid gap-3 sm:grid-cols-3">
        <select className="input" aria-label="What happens" value={effect} onChange={(e) => setEffect(e.target.value as RuleEffect)}>
          {(Object.keys(effectText) as RuleEffect[]).map((k) => <option key={k} value={k}>{effectText[k]}</option>)}
        </select>
        <select className="input" aria-label="Applies to" value={scope} onChange={(e) => setScope(e.target.value as RuleScope)}>
          {(Object.keys(scopeText) as RuleScope[]).map((k) => <option key={k} value={k}>For {scopeText[k]}</option>)}
        </select>
        {expiryOk ? (
          <select className="input" aria-label="How long" value={minutes ?? ""} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : null)}>
            {RULE_DURATIONS.map((d) => <option key={d.label} value={d.minutes ?? ""}>{d.minutes ? d.long.replace(/^for /, "For ") : "Always"}</option>)}
          </select>
        ) : <span className="hidden sm:block" />}
        <input className="input sm:col-span-3" placeholder="Note for your team (optional)" value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} />
      </div>

      <p className="min-h-5 text-[0.8125rem] leading-relaxed text-fg-2" aria-live="polite">
        {!target ? (value.trim() && kind !== "type" ? <span className="text-danger-text">{invalidText[kind]}</span> : null)
          : kind === "type" || kind === "operator" ? "The decision log doesn't record connection types or operators yet, so there's no preview. Your servers check them on every login."
          : history.isPending ? "Checking the last week…"
          : preview ? <>In the last {HISTORY_DAYS} days this would have matched <strong className="font-medium text-fg">{num(preview.matched)}</strong> of {num(preview.total)} logins{preview.matched ? `, ${num(preview.refused)} of them refused or flagged` : ""}.{preview.truncated ? " Only the most recent 1,000 logins were checked." : ""}</> : null}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy || !target}>{busy ? "Adding…" : "Add rule"}</button>
        {error && <p role="alert" className="text-[0.8125rem] text-danger-text">{error}</p>}
      </div>
    </form>
  );
}

const invalidText: Record<BuilderKind, string> = {
  address: "Use an IP address, a range like 203.0.113.0/24 or a player UUID.",
  asn: "Use a network number like AS3320.",
  isp: "Use the provider's name exactly as a decision shows it (up to 60 characters).",
  operator: "Use the operator's name exactly as /cg explain shows it (up to 55 characters).",
  country: "Choose a country.",
  type: "Choose a connection type.",
};

function TargetInput({ kind, value, onChange }: { kind: BuilderKind; value: string; onChange: (v: string) => void }) {
  switch (kind) {
    case "address":
      return <Field label="IP, range or player UUID"><input className="input mono ph-no-capture" placeholder="203.0.113.7, 203.0.113.0/24 or a UUID" value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
    case "asn":
      return <Field label="Network number (ASN)" help="Every address of a provider's network. Decisions show it next to the provider name."><input className="input mono" placeholder="AS3320" value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
    case "isp":
      return <Field label="Provider name" help="Matches the name exactly, ignoring case. Copy it from a decision, for example “Deutsche Telekom AG”."><input className="input" placeholder="Deutsche Telekom AG" value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
    case "operator":
      return <Field label="Operator name" help="The company running a VPN or proxy, as /cg explain shows it. Not every detection service reports one."><input className="input" placeholder="Operator name" value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
    case "country":
      return (
        <Field label="Country" help="Applies to the country check. For a whole country list, use Settings › Country rules.">
          <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose a country</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
      );
    case "type":
      return (
        <Field group label="Connection type" help={<>{TYPE_TEXT[(value as ConnectionType) || "TOR"]?.body} Needs a detection service that reports types: ProxyCheck v3, VPNAPI or IPHub (IP-API reports hosting only).</>}>
          <div role="radiogroup" aria-label="Connection type" className="segmented flex-wrap">
            {CONNECTION_TYPES.map((t) => <button key={t} type="button" role="radio" aria-checked={value === t} aria-pressed={value === t} onClick={() => onChange(t)}>{TYPE_TEXT[t].label}</button>)}
          </div>
        </Field>
      );
  }
}

/** A labelled control. `group` for several buttons: a <label> would forward every click to the first one. */
function Field({ label, help, children, group }: { label: string; help?: React.ReactNode; children: React.ReactNode; group?: boolean }) {
  const id = useId();
  const body = (
    <>
      <span id={id} className="text-[0.8125rem] font-medium">{label}</span>
      {children}
      {help && <span className="text-[0.8125rem] leading-relaxed text-fg-2">{help}</span>}
    </>
  );
  return group ? <div role="group" aria-labelledby={id} className="grid gap-1.5">{body}</div> : <label className="grid gap-1.5">{body}</label>;
}
