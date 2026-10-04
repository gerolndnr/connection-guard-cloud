import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleAlert, CircleCheck, ExternalLink, LoaderCircle, WifiOff, X } from "lucide-react";
import { SECRET_PATHS, type ConfigSnapshot } from "@cg/protocol";
import { api, ApiError, type Install, type ServerConfig } from "../api.ts";
import { Shell } from "../components/Shell.tsx";
import { StatusDot } from "../components/Badge.tsx";
import { Choice, CountryPicker, Row, Section, SecretField, Segmented, Switch, TagInput, type SecretEdit } from "../components/Form.tsx";
import { ago, num, platformName, serverName } from "../format.ts";
import { PROVIDERS } from "../providers.ts";
import { SIMULATED_PATHS, simulate, type SimulationResult } from "../simulate.ts";
import { usePlayerNames } from "../players.ts";
import type { RegisterEvent } from "../api.ts";

type Values = Record<string, boolean | number | string | string[]>;
type Secrets = Record<string, SecretEdit>;
type SecretState = { set: boolean; hint: string | null };


const FAILURE: { value: "OPEN" | "CLOSED" | "OBSERVE"; title: string; body: string }[] = [
  { value: "OPEN", title: "Let in", body: "Recommended. Players are not locked out while a service is down." },
  { value: "CLOSED", title: "Refuse", body: "Strict. Nobody new gets in while lookups fail." },
  { value: "OBSERVE", title: "Let in and log", body: "Players get in, and the decision is marked for review." },
];

const isSecretState = (v: unknown): v is SecretState => typeof v === "object" && v !== null && !Array.isArray(v) && "set" in v;

/** Effective values as the form's starting point; secrets are kept apart. */
function initialValues(snapshot: ConfigSnapshot): Values {
  const out: Values = {};
  for (const [k, v] of Object.entries(snapshot)) if (!isSecretState(v)) out[k] = v as Values[string];
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function ApplyStatus({ cfg, server }: { cfg: ServerConfig; server: string }) {
  if (cfg.error) {
    return (
      <div role="alert" className="flex gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
        <div><p className="font-medium text-danger-text">{server} rejected the last change</p><p className="mt-0.5 text-[0.8125rem] text-fg-2">{cfg.error.message} Its previous settings are still active.</p></div>
      </div>
    );
  }
  if (cfg.pending) {
    return (
      <div role="status" className="flex gap-3 rounded-lg border border-line bg-subtle px-4 py-3">
        {cfg.online ? <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-fg-2 motion-reduce:animate-none" /> : <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />}
        <div>
          <p className="font-medium">{cfg.online ? `Waiting for ${server} to apply your changes…` : `${server} is offline`}</p>
          <p className="mt-0.5 text-[0.8125rem] text-fg-2">{cfg.online ? "Servers check in every 15 seconds while this page is open. No restart needed." : "Your changes are saved and apply as soon as it reconnects."}</p>
        </div>
      </div>
    );
  }
  if (cfg.desired && !cfg.desired.reset && cfg.managed.length > 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line px-4 py-3 text-[0.8125rem] text-fg-2">
        <CircleCheck aria-hidden className="size-4 shrink-0 text-accent" />
        <span>Applied on {server}{cfg.desired.updated_by ? `, last changed by ${cfg.desired.updated_by}` : ""} {ago(cfg.desired.updated_at)}. {cfg.managed.length} {cfg.managed.length === 1 ? "setting comes" : "settings come"} from the dashboard, the rest from config.yml.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line px-4 py-3 text-[0.8125rem] text-fg-2">
      <CircleCheck aria-hidden className="size-4 shrink-0 text-fg-3" />
      <span>All settings currently come from config.yml on {server}. Changes you save here take priority over it.</span>
    </div>
  );
}

function ServerPicker({ networkId, installs }: { networkId: string; installs: Install[] }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-[-0.025em]">Settings</h1>
      <p className="mt-1 text-fg-2">Choose the server to configure. You can apply the result to all servers when saving.</p>
      <ul className="card mt-6 divide-y divide-line overflow-hidden">
        {installs.map((i) => (
          <li key={i.id}>
            <Link to="/n/$networkId/settings" params={{ networkId }} search={{ server: i.id }} className="flex items-center gap-3 px-5 py-4 no-underline transition-colors hover:bg-subtle">
              <StatusDot tone={i.online ? "ok" : "danger"} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{serverName(i)}</p>
                <p className="truncate text-[0.8125rem] text-fg-3">{platformName[i.platform]} · {i.status?.mode === "ENFORCE" ? "Enforcing" : i.status?.mode === "OBSERVE" ? "Observing" : "No report yet"}</p>
              </div>
              <ChevronRight aria-hidden className="size-4 text-fg-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsPage() {
  const { networkId } = useParams({ from: "/n/$networkId/settings" });
  const { server } = useSearch({ from: "/n/$networkId/settings" });
  const net = useQuery({ queryKey: ["network", networkId], queryFn: () => api.network(networkId) });
  const installs = net.data?.installs ?? [];
  const installId = server ?? (installs.length === 1 ? installs[0]!.id : undefined);
  const install = installs.find((i) => i.id === installId);

  if (net.isPending) return <Shell networkId={networkId}><div className="skeleton h-64" /></Shell>;
  if (!installId || !install) return <Shell networkId={networkId}><ServerPicker networkId={networkId} installs={installs} /></Shell>;
  return <Shell networkId={networkId}><ServerSettings key={installId} networkId={networkId} install={install} serverCount={installs.length} /></Shell>;
}

function ServerSettings({ networkId, install, serverCount }: { networkId: string; install: Install; serverCount: number }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cfgQ = useQuery({
    queryKey: ["config", install.id],
    queryFn: () => api.serverConfig(install.id),
    refetchInterval: (q) => (q.state.data?.pending ? 3000 : 30_000),
  });
  const stats = useQuery({ queryKey: ["stats", networkId, "24h", install.id], queryFn: () => api.stats(networkId, "24h", install.id) });
  const cfg = cfgQ.data;
  const effective = cfg?.effective ?? null;

  const base = useMemo(() => (effective ? initialValues(effective) : null), [effective]);
  const [values, setValues] = useState<Values | null>(null);
  const [secrets, setSecrets] = useState<Secrets>({});
  const [applyTo, setApplyTo] = useState<"server" | "network">("server");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // The change just saved, so the bottom bar can follow it until the server confirms or refuses.
  const [lastSave, setLastSave] = useState<{ version: number; at: number; others: number; reset?: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  // "Block selected" with no country picked yet still shows the picker.
  const [blockOpen, setBlockOpen] = useState(false);
  const saveVersion = lastSave?.version ?? 0;
  const saveRejected = Boolean(lastSave && cfgQ.data?.error?.version === saveVersion);
  const saveApplied = Boolean(lastSave && !saveRejected && (cfgQ.data?.applied_version ?? 0) >= saveVersion && !cfgQ.data?.pending);
  useEffect(() => {
    if (!lastSave || saveApplied || saveRejected) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [lastSave, saveApplied, saveRejected]);
  useEffect(() => {
    // Applied: the server's report is the truth again. Refused: the form keeps the edits, shown as unsaved, to fix and retry.
    if (saveApplied || saveRejected) setSavedValues(null);
  }, [saveApplied, saveRejected]);
  useEffect(() => {
    if (!saveApplied) return;
    const t = window.setTimeout(() => setLastSave(null), 6000);
    return () => window.clearTimeout(t);
  }, [saveApplied]);
  // After saving, compare against what was saved, not the server's report: until the server has
  // applied it, its report still shows the old values and the form would look unsaved.
  const [savedValues, setSavedValues] = useState<Values | null>(null);
  const compareTo = savedValues ?? base;
  const dirtyFields = compareTo && values ? Object.keys(values).filter((k) => !same(values[k], compareTo[k])) : [];
  const dirtySecrets = Object.entries(secrets).filter(([, e]) => e.mode !== "keep" && !(e.mode === "set" && e.value === ""));
  const dirty = dirtyFields.length > 0 || dirtySecrets.length > 0;
  // Adopt fresh server values unless the user is mid-edit or a save is still on its way.
  useEffect(() => { if (base && !dirty && !savedValues) setValues(base); }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  // What-if: replay the last 7 days of this server's decisions against the edited settings.
  const simRelevant = dirtyFields.some((f) => SIMULATED_PATHS.includes(f));
  const history = useQuery({
    queryKey: ["history", networkId, install.id],
    enabled: simRelevant,
    staleTime: 5 * 60_000,
    refetchInterval: false,
    queryFn: async () => {
      const since = Date.now() - 7 * 24 * 3_600_000;
      const out: RegisterEvent[] = [];
      let before: number | undefined;
      for (let page = 0; page < 5; page++) {
        const res = await api.events(networkId, { install: install.id, limit: 200, before });
        out.push(...res.events.filter((e) => e.at >= since));
        if (!res.next_before || res.next_before < since) break;
        before = res.next_before;
      }
      return out;
    },
  });
  const simulation = useMemo(() => (simRelevant && history.data && values ? simulate(history.data, values) : null), [simRelevant, history.data, values]);

  const name = serverName(install);
  if (cfgQ.isPending) return <div className="skeleton h-64" />;
  if (cfgQ.error) return <p role="alert" className="text-danger-text">Settings could not be loaded. They retry automatically.</p>;
  if (!cfg) return null;
  const canEdit = cfg.role !== "viewer";

  if (!effective || !values) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Settings</h1>
        <div className="card mt-6 px-6 py-8 text-center">
          <p className="font-medium">Waiting for {name} to report its settings</p>
          <p className="mx-auto mt-1 max-w-md text-fg-2">This happens on its next sync. If it does not show up, the server runs a Connection Guard version without dashboard settings; update it to 0.5 or newer.</p>
        </div>
      </div>
    );
  }

  const v = <T,>(path: string) => values[path] as T;
  const set = (path: string, value: Values[string]) => setValues({ ...values, [path]: value });
  const managed = (path: string) => cfg.managed.includes(path) || dirtyFields.includes(path);
  const secretState = (path: string) => effective[path] as SecretState | undefined;
  const secretEdit = (path: string): SecretEdit => secrets[path] ?? { mode: "keep" };
  const hasKey = (path: string) => { const e = secretEdit(path); return e.mode === "set" ? e.value.length > 0 : e.mode === "clear" ? false : Boolean(secretState(path)?.set); };

  const enabledProviders = PROVIDERS.filter((p) => v<boolean>(`provider.vpn.${p.key}.enabled`));
  const geoType = v<string>("behavior.geo.type");
  const geoList = v<string[]>("behavior.geo.list") ?? [];
  const geoMode = geoType === "WHITELIST" ? "allow" : geoList.length > 0 || blockOpen ? "block" : "off";
  const observing = v<string>("operation.mode") === "OBSERVE";
  const wouldRefuse = stats.data?.totals.would_refuse ?? 0;

  // Mirrors the plugin's own validation, in words an operator understands.
  const errors: Record<string, string> = {};
  for (const p of PROVIDERS) if (p.keyRequired && v<boolean>(`provider.vpn.${p.key}.enabled`) && !hasKey(p.keyPath!)) errors[`provider.vpn.${p.key}.enabled`] = `${p.name} needs an API key.`;
  if (enabledProviders.length > 0 && v<number>("required-positive-flags") > enabledProviders.length) errors["required-positive-flags"] = `Only ${enabledProviders.length} ${enabledProviders.length === 1 ? "provider is" : "providers are"} enabled.`;
  if (geoMode === "allow" && geoList.length === 0) errors["behavior.geo.list"] = "Pick at least one country, or nobody can join.";
  for (const scope of ["vpn", "geo"]) if (v<boolean>(`behavior.${scope}.send-webhook.enabled`) && !hasKey(`behavior.${scope}.send-webhook.url`)) errors[`behavior.${scope}.send-webhook.enabled`] = "Add the Discord webhook URL.";
  const hasErrors = Object.keys(errors).length > 0;

  const save = async () => {
    if (!dirty || hasErrors) return;
    setSaving(true); setSaveError(null);
    const keep = new Set([...cfg.managed.filter((p) => !(SECRET_PATHS as readonly string[]).includes(p)), ...dirtyFields]);
    const body = {
      values: Object.fromEntries([...keep].filter((k) => k in values).map((k) => [k, values[k]])),
      secrets: Object.fromEntries(dirtySecrets.map(([k, e]) => [k, e.mode === "set" ? e.value : ""])),
      apply_to: applyTo,
    };
    try {
      const res = await api.saveConfig(install.id, body);
      setSavedValues(values);
      setLastSave({ version: res.versions[install.id] ?? 0, at: Date.now(), others: Object.keys(res.versions).length - 1 });
      setNow(Date.now());
      setSecrets({});
      await qc.invalidateQueries({ queryKey: ["config"] });
    } catch (err) {
      setSaveError(err instanceof ApiError && err.issues.length ? err.issues.map((i) => `${i.path}: ${i.message}`).join("; ") : "Saving failed. Try again in a moment.");
    } finally { setSaving(false); }
  };
  const reset = async () => {
    setConfirmReset(false);
    const res = await api.resetConfig(install.id);
    setLastSave({ version: res.version, at: Date.now(), others: 0, reset: true });
    setNow(Date.now());
    setSecrets({});
    await qc.invalidateQueries({ queryKey: ["config", install.id] });
  };

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">Settings</h1>
          <p className="mt-1 text-fg-2">
            {name} · {platformName[install.platform]}
            {serverCount > 1 && <> · <button type="button" className="underline decoration-line-strong underline-offset-4 hover:text-fg" onClick={() => navigate({ to: "/n/$networkId/settings", params: { networkId }, search: {} })}>switch server</button></>}
          </p>
        </div>
      </div>
      <div className="mt-6"><ApplyStatus cfg={cfg} server={name} /></div>
      {!canEdit && <p className="mt-4 text-[0.8125rem] text-fg-2">You can view these settings. Owners and admins can change them.</p>}

      <fieldset disabled={!canEdit || saving} className="mt-6 space-y-6">
        <Section id="mode" title="Protection mode" managed={managed("operation.mode")} description="Start by observing. Switch to enforce when the decisions look right.">
          <div className="px-6 py-4">
            <Choice name="Protection mode" value={v<string>("operation.mode") as "OBSERVE" | "ENFORCE"} onChange={(m) => set("operation.mode", m)} options={[
              { value: "OBSERVE", title: "Observe", body: "Check every player and log the result, but let everyone in." },
              { value: "ENFORCE", title: "Enforce", body: "Refuse players who use a VPN or come from a blocked country." },
            ]} />
            {observing && wouldRefuse > 0 && (
              <p className="mt-3 text-[0.8125rem] text-fg-2">In the last 24 hours, <span className="font-medium text-fg">{num(wouldRefuse)}</span> connections would have been refused. <Link to="/n/$networkId/register" params={{ networkId }} search={{ server: install.id }}>Review them</Link></p>
            )}
          </div>
        </Section>

        <Section id="vpn" title="VPN and proxy detection" description="Each enabled service is asked about new IP addresses. Results are cached, so most logins cost no lookup at all.">
          {PROVIDERS.map((p) => (
            <Row key={p.key} managed={managed(`provider.vpn.${p.key}.enabled`)} error={errors[`provider.vpn.${p.key}.enabled`]}
              label={<>{p.name}{p.signup && <a href={p.signup} target="_blank" rel="noreferrer" className="text-fg-3 hover:text-fg" aria-label={`${p.name} website`}><ExternalLink className="size-3.5" /></a>}</>}
              help={p.body}>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch label={`Use ${p.name}`} checked={v<boolean>(`provider.vpn.${p.key}.enabled`) ?? false} onChange={(on) => set(`provider.vpn.${p.key}.enabled`, on)} />
                  <span className="text-[0.8125rem] text-fg-2">{v<boolean>(`provider.vpn.${p.key}.enabled`) ? "On" : "Off"}</span>
                </div>
                {p.keyPath && v<boolean>(`provider.vpn.${p.key}.enabled`) && (
                  <SecretField state={secretState(p.keyPath)} edit={secretEdit(p.keyPath)} onEdit={(e) => setSecrets({ ...secrets, [p.keyPath!]: e })}
                    placeholder={`${p.name} API key${p.keyRequired ? "" : " (optional)"}`} />
                )}
              </div>
            </Row>
          ))}
          <Row label="Votes needed" managed={managed("required-positive-flags")} error={errors["required-positive-flags"]}
            help="How many enabled services must agree before a player counts as using a VPN.">
            <select className="input w-auto pr-8" value={v<number>("required-positive-flags")} onChange={(e) => set("required-positive-flags", Number(e.target.value))}>
              {Array.from({ length: Math.max(1, enabledProviders.length, v<number>("required-positive-flags")) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} of {Math.max(enabledProviders.length, 1)}</option>
              ))}
            </select>
          </Row>
          <Row label="If no service answers" managed={managed("failure-policy.vpn")} help="Happens when services are down or a daily limit is used up.">
            <Segmented name="VPN failure policy" value={v<string>("failure-policy.vpn") as "OPEN"} onChange={(x) => set("failure-policy.vpn", x)} options={FAILURE} />
          </Row>
        </Section>

        <Section id="countries" title="Country rules" managed={managed("behavior.geo.type") || managed("behavior.geo.list")} description="Block connections from some countries, or allow only a few.">
          <div className="px-6 py-4">
            <div role="group" aria-label="Country rule" className="segmented">
              {([["off", "Off"], ["block", "Block selected"], ["allow", "Allow only selected"]] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={geoMode === id} onClick={() => {
                  setBlockOpen(id === "block");
                  if (id === "off") setValues({ ...values, "behavior.geo.type": "BLACKLIST", "behavior.geo.list": [] });
                  else set("behavior.geo.type", id === "allow" ? "WHITELIST" : "BLACKLIST");
                }}>{label}</button>
              ))}
            </div>
            {(geoMode !== "off" || geoType === "BLACKLIST") && geoMode !== "off" && (
              <div className="mt-4">
                <p className="mb-2 text-[0.8125rem] text-fg-2">{geoMode === "allow" ? "Players from any other country are refused." : "Players from these countries are refused."}</p>
                <CountryPicker selected={geoList} onChange={(list) => set("behavior.geo.list", list)} />
                {errors["behavior.geo.list"] && <p role="alert" className="mt-1.5 text-[0.8125rem] text-danger-text">{errors["behavior.geo.list"]}</p>}
              </div>
            )}
            {geoMode === "off" && (
              <button type="button" className="mt-4 text-[0.8125rem] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg" onClick={() => setBlockOpen(true)}>
                Add a country to block
              </button>
            )}
          </div>
          {geoMode !== "off" && (
            <>
              <Row label="Country lookup" managed={managed("provider.geo.service")} help="Where the country of an IP address comes from.">
                <select className="input" value={v<string>("provider.geo.service")} onChange={(e) => set("provider.geo.service", e.target.value)}>
                  <option value="IP-API">IP-API (free, no key)</option>
                  <option value="ProxyCheck">ProxyCheck (uses its key above)</option>
                  <option value="Local">Local database (imported on the server)</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </Row>
              <Row label="If the country is unknown" managed={managed("failure-policy.geo")}>
                <Segmented name="Country failure policy" value={v<string>("failure-policy.geo") as "OPEN"} onChange={(x) => set("failure-policy.geo", x)} options={FAILURE} />
              </Row>
            </>
          )}
        </Section>

        <Section id="actions" title="When a player is flagged" description={observing ? "These apply once you switch to Enforce; in Observe mode players are only logged." : undefined}>
          {(["vpn", "geo"] as const).map((scope) => {
            const label = scope === "vpn" ? "VPN or proxy" : "Blocked country";
            return (
              <Row key={scope} label={label} help={scope === "vpn" ? "A player connects through a VPN or proxy." : "A player connects from a country your rules refuse."}
                managed={["kick-player", "notify-staff", "send-webhook.enabled"].some((k) => managed(`behavior.${scope}.${k}`))} error={errors[`behavior.${scope}.send-webhook.enabled`]}>
                <div className="space-y-3">
                  {([["kick-player", "Refuse the connection"], ["notify-staff", "Notify staff in chat"], ["send-webhook.enabled", "Post to Discord"]] as const).map(([key, text]) => (
                    <label key={key} className="flex items-center gap-3">
                      <Switch label={`${label}: ${text}`} checked={v<boolean>(`behavior.${scope}.${key}`) ?? false} onChange={(on) => set(`behavior.${scope}.${key}`, on)} />
                      <span>{text}</span>
                    </label>
                  ))}
                  {v<boolean>(`behavior.${scope}.send-webhook.enabled`) && (
                    <SecretField type="url" state={secretState(`behavior.${scope}.send-webhook.url`)} edit={secretEdit(`behavior.${scope}.send-webhook.url`)}
                      onEdit={(e) => setSecrets({ ...secrets, [`behavior.${scope}.send-webhook.url`]: e })} placeholder="https://discord.com/api/webhooks/…" />
                  )}
                </div>
              </Row>
            );
          })}
          <p className="px-6 py-3 text-[0.75rem] text-fg-3">Console commands on a hit (for example bans) can only be set in config.yml, for safety.</p>
        </Section>

        <Section id="exemptions" title="Exemptions" description="Player names or IP addresses that are never checked. Useful for staff who travel or use a work VPN.">
          <Row label="Skip the VPN check" managed={managed("behavior.vpn.exemptions")}>
            <TagInput values={v<string[]>("behavior.vpn.exemptions") ?? []} onChange={(x) => set("behavior.vpn.exemptions", x)} placeholder="Name or IP, then Enter" />
          </Row>
          <Row label="Skip country rules" managed={managed("behavior.geo.exemptions")}>
            <TagInput values={v<string[]>("behavior.geo.exemptions") ?? []} onChange={(x) => set("behavior.geo.exemptions", x)} placeholder="Name or IP, then Enter" />
          </Row>
        </Section>

        <Section id="cache" title="Cache" description="How long a result is reused before an IP address is checked again. Longer saves daily lookups.">
          {([["provider.cache.expiration.vpn", "VPN results"], ["provider.cache.expiration.geo", "Country results"]] as const).map(([path, label]) => (
            <Row key={path} label={label} managed={managed(path)}>
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={8760} className="input w-28" value={Math.round((v<number>(path) ?? 60) / 60)}
                  onChange={(e) => set(path, Math.min(525_600, Math.max(1, Math.round(Number(e.target.value) || 1) * 60)))} />
                <span className="text-fg-2">hours</span>
              </div>
            </Row>
          ))}
        </Section>

        {canEdit && cfg.managed.length > 0 && (
          <section className="card flex flex-wrap items-center justify-between gap-3 border-danger/30 px-6 py-4">
            <div>
              <p className="font-medium">Use config.yml only</p>
              <p className="text-[0.8125rem] text-fg-2">Removes every dashboard setting from {name}. The file on the server was never changed.</p>
            </div>
            {confirmReset
              ? <div className="flex gap-2"><button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button><button type="button" className="btn bg-danger text-white hover:brightness-110" onClick={reset}>Remove dashboard settings</button></div>
              : <button type="button" className="btn btn-secondary text-danger-text" onClick={() => setConfirmReset(true)}>Reset to config.yml</button>}
          </section>
        )}
      </fieldset>

      {canEdit && !dirty && lastSave && (
        <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
            {saveRejected ? (
              <>
                <CircleAlert aria-hidden className="size-5 shrink-0 text-danger" />
                <p className="min-w-0 flex-1 text-[0.8125rem]"><span className="font-medium text-danger-text">{name} refused the change.</span> <span className="text-fg-2">{cfgQ.data?.error?.message} Its previous settings are still active.</span></p>
              </>
            ) : saveApplied ? (
              <>
                <CircleCheck aria-hidden className="size-5 shrink-0 text-accent" />
                <p className="min-w-0 flex-1 text-[0.8125rem]"><span className="font-medium">{lastSave.reset ? `${name} uses config.yml again.` : `Applied on ${name}.`}</span> <span className="text-fg-2">Active now, no restart needed.</span></p>
              </>
            ) : (
              <>
                {cfgQ.data?.online === false
                  ? <WifiOff aria-hidden className="size-5 shrink-0 text-warn" />
                  : <LoaderCircle aria-hidden className="size-5 shrink-0 animate-spin text-fg-2 motion-reduce:animate-none" />}
                <div className="min-w-0 flex-1 text-[0.8125rem]">
                  <p className="font-medium">
                    Saved. {cfgQ.data?.online === false ? `${name} is offline and applies it when it reconnects.` : `Waiting for ${name} to apply it…`}
                    {cfgQ.data?.online !== false && <span className="num ml-1.5 font-normal text-fg-3">{Math.max(0, Math.round((now - lastSave.at) / 1000))} s</span>}
                  </p>
                  <p className="text-fg-2">
                    {cfgQ.data?.online === false ? "Nothing else to do." : "Servers check in every 15 seconds while this page is open, so this usually takes under half a minute."}
                    {lastSave.others > 0 && ` Also sent to ${lastSave.others} other ${lastSave.others === 1 ? "server" : "servers"}.`}
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
                    <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(95, ((now - lastSave.at) / 30_000) * 100)}%` }} />
                  </div>
                </div>
              </>
            )}
            <button type="button" className="btn btn-ghost size-8 shrink-0 p-0" aria-label="Hide" title="Hide" onClick={() => setLastSave(null)}><X className="size-4" /></button>
          </div>
        </div>
      )}

      {canEdit && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            {simRelevant && !hasErrors && <Impact result={simulation} loading={history.isFetching} />}
            <p className="min-w-0 flex-1 text-[0.8125rem]">
              {hasErrors ? <span className="text-danger-text">Fix the highlighted settings to save.</span>
                : saveError ? <span className="text-danger-text">{saveError}</span>
                : <span className="text-fg-2">{dirtyFields.length + dirtySecrets.length} unsaved {dirtyFields.length + dirtySecrets.length === 1 ? "change" : "changes"}</span>}
            </p>
            {serverCount > 1 && (
              <label className="flex items-center gap-2 text-[0.8125rem] text-fg-2">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={applyTo === "network"} onChange={(e) => setApplyTo(e.target.checked ? "network" : "server")} />
                Apply to all {serverCount} servers
              </label>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => { setValues(compareTo); setSecrets({}); setSaveError(null); }}>Discard</button>
            <button type="button" className="btn btn-primary" disabled={hasErrors || saving} onClick={save}>
              {saving ? <><LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> Saving…</> : "Save and apply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The save bar's what-if line: how these settings would have treated the last 7 days of logins. */
function Impact({ result, loading }: { result: SimulationResult | null; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const players = usePlayerNames(result?.changed.slice(0, 8).map((c) => c.event.uuid) ?? []);
  if (!result) return <p className="w-full text-[0.8125rem] text-fg-3">{loading ? "Checking the last 7 days…" : ""}</p>;
  if (result.total === 0) return <p className="w-full text-[0.8125rem] text-fg-3">No logins in the last 7 days to compare with.</p>;
  const diff = result.refusedAfter - result.refusedBefore;
  return (
    <div className="w-full">
      <p className="text-[0.8125rem]">
        <span className="font-medium">With these settings, {num(result.refusedAfter)} of {num(result.total)} logins</span>
        <span className="text-fg-2"> in the last 7 days would have been refused ({diff === 0 ? "no change" : diff > 0 ? `${num(diff)} more` : `${num(-diff)} fewer`}).</span>
        {result.changed.length > 0 && (
          <button type="button" className="ml-2 font-medium underline decoration-line-strong underline-offset-4 hover:text-fg" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Who?"}
          </button>
        )}
      </p>
      {open && (
        <ul className="ph-no-capture mt-2 max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface text-[0.8125rem]">
          {result.changed.slice(0, 8).map((c) => (
            <li key={c.event.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">{(c.event.uuid && players.get(c.event.uuid)) || <span className="mono">{c.event.ip}</span>}</span>
              <span className={`shrink-0 ${c.after === "refused" ? "text-danger-text" : "text-accent-text"}`}>{c.after === "refused" ? "would be refused" : "would get in"} · {c.why}</span>
            </li>
          ))}
          {result.changed.length > 8 && <li className="px-3 py-2 text-fg-3">and {num(result.changed.length - 8)} more</li>}
        </ul>
      )}
      {result.unknown > 0 && <p className="mt-1 text-[0.75rem] text-fg-3">Estimate: a newly enabled service was not asked for {num(result.unknown)} of these logins.</p>}
    </div>
  );
}
