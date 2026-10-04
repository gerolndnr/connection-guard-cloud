import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Server } from "lucide-react";
import { api, ApiError } from "../api.ts";
import { Shell, useConfig, useMe } from "../components/Shell.tsx";
import { SignIn } from "../components/SignIn.tsx";
import { Turnstile } from "../components/Turnstile.tsx";
import { ago, num, platformName } from "../format.ts";
import { track } from "../analytics.ts";

const errorText: Record<string, string> = {
  unknown_code: "This link is no longer valid. Links last 24 hours and work once. Run /cg cloud link on your server for a fresh one.",
  invalid_code: "That does not look like a link code. Codes look like 7KQM-4P2X.",
  turnstile_failed: "The browser check did not pass. Reload the page and try again.",
  dpa_outdated: "The data processing terms changed while this page was open. Reload to read the current version.",
  forbidden: "You need to be an owner or admin of that network to add servers to it.",
};

function Choice({ checked, onChange, title, sub }: { checked: boolean; onChange: () => void; title: React.ReactNode; sub?: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${checked ? "border-accent bg-accent-soft/60" : "border-line hover:border-line-strong"}`}>
      <input type="radio" name="network" checked={checked} onChange={onChange} className="size-4 accent-[var(--accent)]" />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        {sub && <span className="block text-[0.8125rem] text-fg-3">{sub}</span>}
      </span>
    </label>
  );
}

function Privacy() {
  return (
    <p className="text-[0.8125rem] leading-relaxed text-fg-3">
      Nothing changes on your server: players are checked exactly as configured, and logins never wait for this dashboard.
      To stop sending anything, set <code className="rounded bg-subtle px-1">cloud.enabled: false</code> or run <code className="rounded bg-subtle px-1">/cg cloud disable</code>.
    </p>
  );
}

export function LinkPage() {
  const { code } = useParams({ from: "/link/$code" });
  const me = useMe();
  const config = useConfig();
  const preview = useQuery({ queryKey: ["link", code], queryFn: () => api.linkPreview(code), enabled: Boolean(me.data), retry: false, refetchInterval: false });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const previewPlatform = preview.data?.install.platform;
  useEffect(() => { if (previewPlatform) track("link_page_viewed", { platform: previewPlatform }); }, [previewPlatform]);
  useEffect(() => { if (preview.isError) track("link_page_invalid"); }, [preview.isError]);

  const networks = me.data?.networks.filter((n) => n.role !== "viewer") ?? [];
  const [target, setTarget] = useState<string>("new");
  const [networkName, setNetworkName] = useState("");
  const [serverName, setServerName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState(false);
  const onToken = useCallback((t: string | null) => setToken(t), []);
  // Turnstile is optional per deployment; without a site key there is no browser check to pass.
  const turnstileOn = Boolean(config.data?.turnstile_site_key);
  // With exactly one network, adding to it is the likely intent.
  const onlyNetwork = networks.length === 1 ? networks[0]!.id : null;
  useEffect(() => { if (onlyNetwork) setTarget((t) => (t === "new" ? onlyNetwork : t)); }, [onlyNetwork]);

  if (me.isPending) return <Shell><div className="skeleton mx-auto h-72 max-w-xl" /></Shell>;
  if (!me.data) {
    return (
      <Shell>
        <div className="mx-auto max-w-md pt-6">
          <section className="card p-8">
            <h1 className="text-2xl font-semibold tracking-[-0.025em]">Link a server</h1>
            <p className="mt-2 text-fg-2">Sign in first. You come straight back to link <span className="mono text-fg">{code}</span>.</p>
            <div className="mt-8"><SignIn next={`/link/${code}`} /></div>
          </section>
          <div className="mt-4 px-2"><Privacy /></div>
        </div>
      </Shell>
    );
  }

  const ready = accepted && (Boolean(token) || !turnstileOn) && (target !== "new" || networkName.trim().length > 0) && !busy;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !config.data) return;
    setBusy(true); setError(null);
    try {
      const res = await api.claim(code, {
        ...(target === "new" ? { network_name: networkName.trim() } : { network_id: target }),
        ...(serverName.trim() ? { server_name: serverName.trim() } : {}),
        accept_dpa: true, dpa_version: config.data.dpa_version, turnstile_token: token ?? "not-configured",
      });
      setLinked(true);
      track("link_claimed", { new_network: target === "new", server_named: Boolean(serverName.trim()), platform: preview.data?.install.platform });
      await qc.invalidateQueries({ queryKey: ["me"] });
      // Straight into the setup assistant; it steps aside on its own if the server is already configured.
      window.setTimeout(() => navigate({ to: "/n/$networkId/setup", params: { networkId: res.network_id }, search: { server: res.install_id } }), 900);
    } catch (err) {
      track("link_claim_failed", { error: err instanceof ApiError ? err.code : "network" });
      setError(err instanceof ApiError ? errorText[err.code] ?? "Linking failed. Try again in a moment." : "Linking failed. Check your connection.");
      setBusy(false);
    }
  };

  const install = preview.data?.install;
  return (
    <Shell>
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Link a server</h1>
        <p className="mt-1 text-fg-2">Add this server to a network to see its decisions.</p>
        {preview.isPending && <div className="skeleton mt-6 h-24" />}
        {preview.error && (
          <p role="alert" className="mt-6 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-danger-text">{preview.error instanceof ApiError ? errorText[preview.error.code] ?? "This link could not be read." : "This link could not be read."}</p>
        )}
        {install && preview.data && (
          <form onSubmit={submit} className="mt-6 space-y-6">
            <section className="card flex gap-4 p-5">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-subtle"><Server className="size-5 text-fg-2" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-medium">{platformName[install.platform]} <span className="font-normal text-fg-2">· {install.platform_version}</span></p>
                  <p className="text-[0.8125rem] text-fg-3">installed {ago(install.created_at)}</p>
                </div>
                <p className="mono mt-0.5 text-[0.75rem] text-fg-3">Connection Guard v{install.plugin_version}</p>
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                  {([["Checked", preview.data.since_install.checks], ["VPN found", preview.data.since_install.vpn_positive], ["Refused", preview.data.since_install.denied]] as const).map(([l, v]) => (
                    <div key={l}><dt className="text-[0.75rem] text-fg-3">{l}</dt><dd className="num text-lg font-semibold">{num(v)}</dd></div>
                  ))}
                </dl>
              </div>
            </section>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Network</legend>
              {networks.map((n) => (
                <Choice key={n.id} checked={target === n.id} onChange={() => setTarget(n.id)} title={n.name} sub={`${n.servers} ${n.servers === 1 ? "server" : "servers"}`} />
              ))}
              <Choice checked={target === "new"} onChange={() => setTarget("new")} title="Create a new network" />
              {target === "new" && (
                <input className="input mt-2" placeholder="Network name, e.g. Blockhaven" maxLength={64} value={networkName} onChange={(e) => setNetworkName(e.target.value)} aria-label="Network name" autoFocus />
              )}
            </fieldset>

            <label className="block">
              <span className="text-sm font-medium">Server name <span className="font-normal text-fg-3">(optional)</span></span>
              <input className="input mt-2" placeholder="e.g. Lobby, Survival, Proxy" maxLength={64} value={serverName} onChange={(e) => setServerName(e.target.value)} />
            </label>

            <fieldset className="card p-5">
              <legend className="sr-only">Data processing</legend>
              <p className="text-sm font-medium">Data processing</p>
              <ul className="mt-3 space-y-2 text-[0.8125rem] text-fg-2">
                {["After linking, each check is sent: IP address, verified player UUID, the verdict and what each provider said.",
                  "Decisions are deleted after 30 days. Hourly totals stay for 13 months. Everything is stored in the EU.",
                  "You are the controller for your players' data; Connection Guard processes it only to show you this dashboard.",
                  "Unlinking a server deletes its decisions at once."].map((t) => (
                  <li key={t} className="flex gap-2"><Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-3" />{t}</li>
                ))}
              </ul>
              <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-line pt-4">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span>I accept the data processing agreement (version {config.data?.dpa_version}) for this server.</span>
              </label>
            </fieldset>

            {config.data && turnstileOn && <Turnstile siteKey={config.data.turnstile_site_key} onToken={onToken} />}
            {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-danger-text">{error}</p>}
            <div className="flex items-center gap-4">
              <button type="submit" className="btn btn-primary h-10 px-5" disabled={!ready || linked}>
                {linked ? <><Check className="size-4" /> Linked</> : busy ? "Linking…" : "Link server"}
              </button>
              {linked && <span role="status" className="text-[0.8125rem] text-fg-2">Opening the setup…</span>}
            </div>
            <Privacy />
          </form>
        )}
      </div>
    </Shell>
  );
}
