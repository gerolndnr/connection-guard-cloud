import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CircleCheck, ExternalLink, Globe, KeyRound, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { supportsPath, type ConfigSnapshot } from "@cg/protocol";
import { api, ApiError, type Install, type RegisterEvent } from "../api.ts";
import { Shell } from "../components/Shell.tsx";
import { VerdictBadge } from "../components/Badge.tsx";
import { CountryPicker, Switch } from "../components/Form.tsx";
import { clock, explain, isPrivateIp, ms, num, serverName, verdict, versionAtLeast } from "../format.ts";
import { isConfigured, lookupsPerDay } from "../setup.ts";
import { dailyCapacity, failoverCoverage, failoverOrder, isValidKey, providersFor, type ProviderInfo } from "../providers.ts";
import { track } from "../analytics.ts";

type CountryMode = "off" | "block" | "allow";
type Step = "goals" | "providers" | "mode" | "apply" | "verify";
const STEPS: Step[] = ["goals", "providers", "mode"];

function Progress({ step }: { step: Step }) {
  const i = Math.min(STEPS.indexOf(step) === -1 ? 3 : STEPS.indexOf(step), 3);
  return (
    <div aria-hidden className="flex gap-1.5">
      {STEPS.map((s, n) => <span key={s} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${n <= Math.min(i, 2) ? "bg-accent" : "bg-line"}`} />)}
    </div>
  );
}

function StepFrame({ step, title, lead, children, onBack, onNext, nextLabel = "Continue", nextDisabled, footnote }: {
  step: Step; title: string; lead: React.ReactNode; children: React.ReactNode; onBack?: (() => void) | undefined; onNext: () => void;
  nextLabel?: string; nextDisabled?: boolean; footnote?: React.ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  return (
    <div>
      <Progress step={step} />
      <p className="mt-6 text-[0.8125rem] font-medium text-fg-3">Step {STEPS.indexOf(step) + 1} of {STEPS.length}</p>
      <h1 ref={heading} tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-[-0.025em] outline-none">{title}</h1>
      <p className="mt-2 max-w-prose text-fg-2">{lead}</p>
      <div className="mt-6">{children}</div>
      <div className="mt-8 flex items-center justify-between gap-3">
        {onBack ? <button type="button" className="btn btn-ghost" onClick={onBack}><ArrowLeft className="size-4" /> Back</button> : <span />}
        <button type="button" className="btn btn-primary h-10 px-5" disabled={nextDisabled} onClick={onNext}>{nextLabel} <ArrowRight className="size-4" /></button>
      </div>
      {footnote && <p className="mt-4 text-right text-[0.8125rem] text-fg-3">{footnote}</p>}
    </div>
  );
}

function OptionCard({ checked, onToggle, icon, title, body, children, role = "checkbox" }: {
  checked: boolean; onToggle: () => void; icon: React.ReactNode; title: string; body: string; children?: React.ReactNode; role?: "checkbox" | "radio";
}) {
  return (
    <div className={`rounded-xl border transition-colors ${checked ? "border-accent bg-accent-soft/50" : "border-line bg-surface hover:border-line-strong"}`}>
      <button type="button" role={role} aria-checked={checked} onClick={onToggle} className="flex w-full items-start gap-4 px-5 py-4 text-left">
        <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-lg border ${checked ? "border-accent/40 bg-surface text-accent-text" : "border-line bg-subtle text-fg-2"}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-fg-2">{body}</span>
        </span>
        <span aria-hidden className={`mt-1 grid size-5 shrink-0 place-items-center ${role === "radio" ? "rounded-full" : "rounded-md"} border ${checked ? "border-accent bg-accent text-white" : "border-line-strong"}`}>
          {checked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </button>
      {checked && children && <div className="border-t border-line px-5 py-4">{children}</div>}
    </div>
  );
}

export function SetupPage() {
  const { networkId } = useParams({ from: "/n/$networkId/setup" });
  const { server } = useSearch({ from: "/n/$networkId/setup" });
  const net = useQuery({ queryKey: ["network", networkId], queryFn: () => api.network(networkId) });
  const install = net.data?.installs.find((i) => i.id === server) ?? (net.data?.installs.length === 1 ? net.data.installs[0] : undefined);
  if (net.isPending) return <Shell networkId={networkId}><div className="skeleton mx-auto h-72 max-w-xl" /></Shell>;
  if (!install) return <Shell networkId={networkId}><p className="text-fg-2">Choose a server under <Link to="/n/$networkId/settings" params={{ networkId }}>Settings</Link>.</p></Shell>;
  return <Shell networkId={networkId}><div className="mx-auto max-w-xl pb-16"><Assistant networkId={networkId} install={install} /></div></Shell>;
}

function Assistant({ networkId, install }: { networkId: string; install: Install }) {
  const navigate = useNavigate();
  const name = serverName(install);
  const [step, setStep] = useState<Step>("goals");
  const [forced, setForced] = useState(false);
  const cfgQ = useQuery({
    queryKey: ["config", install.id],
    queryFn: () => api.serverConfig(install.id),
    // Polling this also keeps the server on its fast check-in pace while the assistant is open.
    refetchInterval: step === "apply" || step === "verify" || !forced ? 3000 : 15_000,
  });
  const stats = useQuery({ queryKey: ["stats", networkId, "24h", install.id], queryFn: () => api.stats(networkId, "24h", install.id) });
  const snapshot: ConfigSnapshot | null = cfgQ.data?.effective ?? null;
  const configured = isConfigured(snapshot, cfgQ.data?.managed);
  const available = providersFor(snapshot);
  // Plugins from 0.5.2 ask services one after another unless config.yml switches that off; the assistant keeps it as is.
  const failover = snapshot?.["provider.vpn-failover.enabled"] === true
    || (!supportsPath(snapshot, "provider.vpn-failover.enabled") && versionAtLeast(install.plugin_version, "0.5.2"));

  // Choices, prefilled with the server's current values (or the shipped defaults until it reports).
  const [vpn, setVpn] = useState(true);
  const [countryMode, setCountryMode] = useState<CountryMode>("off");
  const [countries, setCountries] = useState<string[]>([]);
  // Services: prefilled from the server; ProxyCheck alone on a fresh install.
  const [selected, setSelected] = useState<Record<string, boolean>>({ proxycheck: true });
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [votes, setVotes] = useState(1);
  const [mode, setMode] = useState<"OBSERVE" | "ENFORCE">("OBSERVE");
  const [version, setVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState(0);
  const prefilled = useRef(false);
  useEffect(() => {
    if (!snapshot || prefilled.current) return;
    prefilled.current = true;
    const list = (snapshot["behavior.geo.list"] as string[] | undefined) ?? [];
    setCountries(list);
    setCountryMode(snapshot["behavior.geo.type"] === "WHITELIST" ? "allow" : list.length ? "block" : "off");
    setMode((snapshot["operation.mode"] as "OBSERVE" | "ENFORCE") ?? "OBSERVE");
    const fromServer = Object.fromEntries(providersFor(snapshot).map((p) => [p.key, snapshot[`provider.vpn.${p.key}.enabled`] === true]));
    if (Object.values(fromServer).some(Boolean)) setSelected(fromServer);
    setVotes(Number(snapshot["required-positive-flags"] ?? 1));
  }, [snapshot]);

  const perDay = stats.data ? lookupsPerDay(stats.data.totals.lookups, install) : null;
  const keyOnServer = (p: ProviderInfo) => p.keyPath ? (snapshot?.[p.keyPath] as { set: boolean; hint: string | null } | undefined) : undefined;
  const chosen = available.filter((p) => selected[p.key]);
  const typedKey = (p: ProviderInfo) => (keys[p.key] ?? "").trim();
  const willHaveKey = (p: ProviderInfo) => typedKey(p).length > 0 || Boolean(keyOnServer(p)?.set);
  const providerErrors = Object.fromEntries(chosen.flatMap((p) => {
    if (typedKey(p) && !isValidKey(typedKey(p))) return [[p.key, "That does not look like an API key. Keys contain only letters, digits and dashes."]];
    if (p.keyRequired && !willHaveKey(p)) return [[p.key, `${p.name} only works with an API key.`]];
    return [];
  })) as Record<string, string>;
  const providersOk = chosen.length > 0 && Object.keys(providerErrors).length === 0;

  const apply = async () => {
    setStep("apply"); setError(null);
    const on = vpn ? chosen : [];
    const values: Record<string, unknown> = {
      "operation.mode": mode,
      "behavior.geo.type": countryMode === "allow" ? "WHITELIST" : "BLACKLIST",
      "behavior.geo.list": countryMode === "off" ? [] : countries,
    };
    for (const p of available) values[`provider.vpn.${p.key}.enabled`] = on.includes(p);
    if (on.length > 0 && !failover) values["required-positive-flags"] = Math.min(Math.max(1, votes), on.length);
    const secrets = Object.fromEntries(on.filter((p) => p.keyPath && typedKey(p)).map((p) => [p.keyPath!, typedKey(p)]));
    if (countryMode !== "off" && snapshot?.["provider.geo.service"] === "Disabled") values["provider.geo.service"] = "IP-API";
    track("setup_finished", { install_id: install.id,
      vpn, providers: on.map((p) => p.key), keys_entered: Object.keys(secrets).length, votes: on.length && !failover ? values["required-positive-flags"] : 0, failover,
      country_mode: countryMode, countries: countryMode === "off" ? 0 : countries.length, mode, platform: install.platform,
    });
    try {
      const res = await api.saveConfig(install.id, { values, secrets, apply_to: "server" });
      setVersion(res.versions[install.id] ?? null);
    } catch (err) {
      setError(err instanceof ApiError && err.issues.length ? err.issues.map((i) => i.message).join(" ") : "Saving failed. Check your connection and try again.");
    }
  };

  // Applied (or rejected) as reported by the server.
  const cfg = cfgQ.data;
  const applied = version !== null && cfg && cfg.applied_version >= version && !cfg.pending;
  const rejected = version !== null && cfg?.error?.version === version ? cfg.error.message : null;
  useEffect(() => { if (applied && step === "apply") { setSince(Date.now()); } }, [applied, step]);

  // Funnel: which step people reach, what they choose (never keys or country names), and how it ends.
  const startedAt = useRef(Date.now());
  useEffect(() => { track("setup_step_viewed", { install_id: install.id, step, platform: install.platform }); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (applied) track("setup_applied", { install_id: install.id, seconds: Math.round((Date.now() - startedAt.current) / 1000), mode }); }, [applied]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (rejected) track("setup_rejected", { install_id: install.id }); }, [rejected]);
  useEffect(() => { if (configured && !forced && cfgQ.data) track("setup_already_configured", { install_id: install.id }); }, [configured, forced, Boolean(cfgQ.data)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cfgQ.isPending) return <div className="skeleton h-72" />;

  if (configured && !forced && step === "goals") {
    return (
      <div className="card px-6 py-8 text-center">
        <CircleCheck aria-hidden className="mx-auto size-8 text-accent" />
        <h1 className="mt-3 text-xl font-semibold tracking-[-0.02em]">{name} is already set up</h1>
        <p className="mx-auto mt-2 max-w-md text-fg-2">It has its own settings from config.yml{cfg?.managed.length ? " or the dashboard" : ""}. Review them in Settings; the assistant would only change things you already chose.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/n/$networkId/settings" params={{ networkId }} search={{ server: install.id }} className="btn btn-primary no-underline">Review settings</Link>
          <Link to="/n/$networkId" params={{ networkId }} className="btn btn-secondary no-underline">Go to overview</Link>
        </div>
        <button type="button" className="mt-4 text-[0.8125rem] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg" onClick={() => setForced(true)}>Run the setup anyway</button>
      </div>
    );
  }

  const connecting = !snapshot && (
    <p role="status" className="mb-6 flex items-center gap-2 rounded-lg border border-line bg-subtle px-3 py-2 text-[0.8125rem] text-fg-2">
      <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" /> Connecting to {name}… You can already make your choices.
    </p>
  );

  if (step === "goals") {
    return (
      <>{connecting}
        <StepFrame step="goals" title="What should Connection Guard keep out?" lead={<>Choose what to check when a player joins <span className="font-medium text-fg">{name}</span>. You can change this any time.</>}
          onNext={() => setStep(vpn ? "providers" : "mode")} nextDisabled={countryMode === "allow" && countries.length === 0}
          footnote={<Link to="/n/$networkId" params={{ networkId }} className="text-fg-3 no-underline hover:text-fg">Skip setup</Link>}>
          <div className="space-y-3">
            <OptionCard checked={vpn} onToggle={() => setVpn(!vpn)} icon={<ShieldCheck className="size-4.5" />}
              title="VPNs and proxies" body="Recommended. Stops ban evasion and alt accounts that hide behind a VPN, proxy or hosting provider." />
            <OptionCard checked={countryMode !== "off"} onToggle={() => setCountryMode(countryMode === "off" ? "block" : "off")} icon={<Globe className="size-4.5" />}
              title="Players from certain countries" body="Optional. Block a few countries, or allow only the ones your community is from.">
              <div role="group" aria-label="Country rule" className="segmented">
                <button type="button" aria-pressed={countryMode === "block"} onClick={() => setCountryMode("block")}>Block these</button>
                <button type="button" aria-pressed={countryMode === "allow"} onClick={() => setCountryMode("allow")}>Allow only these</button>
              </div>
              <div className="mt-3"><CountryPicker selected={countries} onChange={setCountries} /></div>
              {countryMode === "allow" && countries.length === 0 && <p className="mt-2 text-[0.8125rem] text-warn-text">Pick at least one country, or nobody could join.</p>}
            </OptionCard>
          </div>
          {!vpn && countryMode === "off" && <p className="mt-4 text-[0.8125rem] text-warn-text">With nothing selected, Connection Guard only logs connections.</p>}
        </StepFrame>
      </>
    );
  }

  if (step === "providers") {
    const order = (snapshot?.["provider.vpn-failover.order"] as string[] | undefined) ?? [];
    const chain = failoverOrder(chosen, order);
    const coverage = failover ? failoverCoverage(chain.map((p) => ({ info: p, hasKey: willHaveKey(p) }))) : null;
    const capacity = failover
      ? (coverage && coverage.firstLimit !== null && !coverage.uncappedFallback ? { limit: coverage.firstLimit, by: coverage.first, keyless: !willHaveKey(coverage.first) } : null)
      : dailyCapacity(chosen.map((p) => ({ info: p, hasKey: willHaveKey(p) })));
    const short = capacity !== null && perDay !== null && capacity.limit < perDay * 1.2;
    return (
      <>{connecting}
        <StepFrame step="providers" title="Which services should check players?"
          lead={failover
            ? "Each new IP address goes to the first service you pick; the next one only steps in when it fails or its limit is used up. Returning players are answered from the cache."
            : "Each new IP address is checked by every service you pick. Returning players are answered from the cache, so most logins cost nothing."}
          onBack={() => setStep("goals")} onNext={() => setStep("mode")} nextDisabled={!providersOk}>
          <div className="space-y-3">
            {available.map((p) => {
              const on = Boolean(selected[p.key]);
              const server = keyOnServer(p);
              return (
                <OptionCard key={p.key} checked={on} onToggle={() => setSelected({ ...selected, [p.key]: !on })}
                  icon={p.keyPath ? <KeyRound className="size-4.5" /> : <ShieldCheck className="size-4.5" />}
                  title={`${p.name}${p.key === "proxycheck" ? " (recommended)" : ""}`} body={p.body}>
                  {p.keyPath ? (
                    <div>
                      <label className="block">
                        <span className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-[0.8125rem]">
                          <span className="font-medium">{p.name} API key{p.keyRequired ? "" : " (optional)"}</span>
                          {p.signup && <a href={p.signup} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg-2 hover:text-fg">Get a free key <ExternalLink className="size-3" /></a>}
                        </span>
                        <input className="input mono" type="password" autoComplete="off" spellCheck={false}
                          placeholder={server?.set ? `Already set (…${server.hint ?? ""}). Paste a new key to replace it.` : `Paste your ${p.name} API key`}
                          value={keys[p.key] ?? ""} onChange={(e) => setKeys({ ...keys, [p.key]: e.target.value.trim() })} />
                      </label>
                      {providerErrors[p.key]
                        ? <p className="mt-1.5 text-[0.8125rem] text-danger-text">{providerErrors[p.key]}</p>
                        : <p className="mt-1.5 text-[0.75rem] text-fg-3">{server?.set && !typedKey(p) ? "The server keeps its current key." : "Sent to your server once, then deleted from the cloud."}</p>}
                    </div>
                  ) : (
                    <p className="text-[0.8125rem] text-fg-2">{p.nonCommercial ? "No key needed. Allowed for non-commercial servers only." : "No key needed."}</p>
                  )}
                </OptionCard>
              );
            })}
          </div>

          {chosen.length === 0 && <p className="mt-4 text-[0.8125rem] text-warn-text">Pick at least one service, or turn off VPN checks in the previous step.</p>}

          {failover && chain.length >= 2 && (
            <div className="mt-5 rounded-lg border border-line px-4 py-3">
              <p className="font-medium">Asked in this order</p>
              <p className="mt-0.5 text-[0.8125rem] text-fg-2">
                {chain.map((p) => p.name).join(" → ")}. {coverage?.uncappedFallback
                  ? `When ${coverage.first.name}'s daily limit is used up, ${coverage.uncappedFallback.name} takes over, so players stay checked.`
                  : "When one limit is used up, the next service takes over."} You can change the order in the settings.
              </p>
            </div>
          )}

          {!failover && chosen.length >= 2 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">Treat a player as VPN when</p>
                <p className="text-[0.8125rem] text-fg-2">One is the strictest. More agreeing services means fewer false alarms.</p>
              </div>
              <select className="input w-auto pr-8" value={Math.min(votes, chosen.length)} onChange={(e) => setVotes(Number(e.target.value))} aria-label="Services that must agree">
                {chosen.map((_, i) => <option key={i} value={i + 1}>{i + 1} of {chosen.length} {i === 0 ? "agrees" : "agree"}</option>)}
              </select>
            </div>
          )}

          {capacity && (
            <div className={`mt-5 flex gap-3 rounded-lg border px-4 py-3 ${short ? "border-warn/40 bg-warn-soft" : "border-line bg-subtle"}`}>
              <KeyRound aria-hidden className={`mt-0.5 size-4 shrink-0 ${short ? "text-warn" : "text-fg-3"}`} />
              <p className="text-[0.8125rem] leading-relaxed text-fg-2">
                {failover && chain.length > 1 ? (
                  <>{capacity.by.name} answers about <span className="num font-medium text-fg">{num(capacity.limit)}</span> new IP addresses a day{capacity.keyless && capacity.by.keyPath ? " without a key" : ""}; then the next services take over until their limits are used up too.</>
                ) : (
                  <>Your selection allows about <span className="num font-medium text-fg">{num(capacity.limit)}</span> new IP addresses a day,
                  limited by {capacity.by.name}{capacity.keyless && capacity.by.keyPath ? " without a key" : ""}.</>
                )}
                {perDay !== null && <> {name} needs about <span className="num font-medium text-fg">{num(perDay)}</span>.</>}
                {short && capacity.keyless && " Add a free key to stay covered."}
                {" "}When {failover && chain.length > 1 ? "every limit" : "the limit"} is reached, players are let in unchecked.
              </p>
            </div>
          )}
        </StepFrame>
      </>
    );
  }

  if (step === "mode") {
    return (
      <>{connecting}
        <StepFrame step="mode" title="Start gently?" lead="Watching first shows you what would happen, so you can catch surprises before a real player is locked out."
          onBack={() => setStep(vpn ? "providers" : "goals")} onNext={apply} nextLabel="Finish setup" nextDisabled={vpn && !providersOk}>
          <div role="radiogroup" aria-label="Protection mode" className="space-y-3">
            <OptionCard role="radio" checked={mode === "OBSERVE"} onToggle={() => setMode("OBSERVE")} icon={<Sparkles className="size-4.5" />}
              title="Watch first (recommended)" body="Everyone gets in. You see who would have been refused, and we suggest switching once it looks right." />
            <OptionCard role="radio" checked={mode === "ENFORCE"} onToggle={() => setMode("ENFORCE")} icon={<ShieldCheck className="size-4.5" />}
              title="Protect right away" body="Refuse flagged players from the next login on. Best if you already know you have a VPN problem." />
          </div>
        </StepFrame>
      </>
    );
  }

  if (step === "apply") {
    const items: [string, boolean][] = [
      ["Settings saved", version !== null],
      [`${name} picked them up`, Boolean(applied)],
    ];
    return (
      <div className="card px-6 py-8">
        <Progress step="apply" />
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.025em]">{rejected ? "The server refused the settings" : applied ? "You're protected" : "Applying your settings…"}</h1>
        <p className="mt-2 text-fg-2">{rejected ? rejected : applied ? `${name} uses the new settings. No restart was needed.` : cfg?.online === false ? `${name} is offline right now. Your settings are saved and apply as soon as it reconnects.` : "Your server checks in every 15 seconds while this page is open."}</p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-danger-text">{error}</p>}
        <ul className="mt-6 space-y-3">
          {items.map(([label, done]) => (
            <li key={label} className="flex items-center gap-3">
              {done ? <CircleCheck aria-hidden className="size-5 text-accent" /> : <LoaderCircle aria-hidden className="size-5 animate-spin text-fg-3 motion-reduce:animate-none" />}
              <span className={done ? "" : "text-fg-2"}>{label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap justify-end gap-2">
          {rejected || error
            ? <button type="button" className="btn btn-secondary" onClick={() => setStep("goals")}><ArrowLeft className="size-4" /> Change choices</button>
            : <Link to="/n/$networkId" params={{ networkId }} className="btn btn-ghost no-underline">Go to overview</Link>}
          {applied && <button type="button" className="btn btn-primary h-10 px-5" onClick={() => setStep("verify")}>Try it out <ArrowRight className="size-4" /></button>}
        </div>
      </div>
    );
  }

  return <Verify networkId={networkId} install={install} since={since} onDone={() => navigate({ to: "/n/$networkId", params: { networkId } })} />;
}

/** The proof: the operator joins their own server and watches their check arrive. */
function Verify({ networkId, install, since, onDone }: { networkId: string; install: Install; since: number; onDone: () => void }) {
  const events = useQuery({
    queryKey: ["verify", install.id, since],
    queryFn: () => api.events(networkId, { install: install.id, limit: 5 }),
    refetchInterval: (q) => (q.state.data?.events.some((e) => e.at >= since - 5000) ? false : 3000),
  });
  const mine: RegisterEvent | undefined = events.data?.events.find((e) => e.at >= since - 5000);
  const seen = Boolean(mine);
  useEffect(() => { if (seen) track("setup_verified", { install_id: install.id, seconds: Math.round((Date.now() - since) / 1000), local_ip: mine ? isPrivateIp(mine.ip) : false }); }, [seen]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = serverName(install);
  return (
    <div className="card px-6 py-8">
      <Progress step="verify" />
      {!mine ? (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.025em]">Try it: join {name}</h1>
          <p className="mt-2 text-fg-2">Connect with Minecraft as you normally would. Your own login shows up here within about 20 seconds, with the reason Connection Guard let you in.</p>
          <div role="status" className="mt-6 flex items-center gap-3 rounded-lg border border-dashed border-line-strong px-4 py-5 text-fg-2">
            <span className="relative flex size-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-50 motion-reduce:hidden" /><span className="relative size-2.5 rounded-full bg-accent" /></span>
            Waiting for the next login on {name}…
          </div>
          <div className="mt-8 flex justify-end"><button type="button" className="btn btn-ghost" onClick={() => { track("setup_verify_skipped", { install_id: install.id, seconds: Math.round((Date.now() - since) / 1000) }); onDone(); }}>Skip, go to overview</button></div>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.025em]">It works</h1>
          <p className="mt-2 text-fg-2">Connection Guard checked this login in <span className="num font-medium text-fg">{ms(mine.duration_ms)}</span>. Every login from now on shows up under Decisions.</p>
          <div className="ph-no-capture sheet-in mt-6 rounded-xl border border-line">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <span className="mono font-medium">{mine.ip}</span>
              <VerdictBadge verdict={verdict(mine)} />
            </div>
            <p className="px-5 py-4 text-[0.875rem] leading-relaxed">{explain(mine)}</p>
            {isPrivateIp(mine.ip) && (
              <p className="border-t border-line bg-subtle px-5 py-3 text-[0.8125rem] leading-relaxed text-fg-2">
                You joined from a local address ({mine.ip}), which no provider can look up, so it was let in. Players connecting over the internet are checked normally.
              </p>
            )}
            <p className="border-t border-line px-5 py-2.5 text-[0.75rem] text-fg-3">{clock(mine.at)} · {name}</p>
          </div>
          <div className="mt-8 flex justify-end"><button type="button" className="btn btn-primary h-10 px-5" onClick={onDone}>Go to overview <ArrowRight className="size-4" /></button></div>
        </>
      )}
    </div>
  );
}
