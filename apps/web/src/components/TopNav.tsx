import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import { api, type Me } from "../api.ts";
import { serverName } from "../format.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { AccountMenu } from "./AccountMenu.tsx";
import { resetAnalytics } from "../analytics.ts";

function Slash() {
  return <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 text-line-strong"><path d="M16.88 3.549L7.12 20.451" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

/** Sticky top bar: wordmark / network / server switcher, then theme and account; page tabs below. */
export function TopNav({ me, networkId }: { me?: Me | undefined; networkId?: string | undefined }) {
  const network = me?.networks.find((n) => n.id === networkId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { server?: string };
  const net = useQuery({ queryKey: ["network", networkId], queryFn: () => api.network(networkId!), enabled: Boolean(networkId) });
  const installs = net.data?.installs ?? [];
  const keep = search.server ? { server: search.server } : {};
  // Five tabs fit a 360 px phone with the tighter padding; the row scrolls instead of widening the page if not.
  const tab = "relative shrink-0 whitespace-nowrap px-2.5 py-3 text-[0.8125rem] font-medium text-fg-2 no-underline transition-colors hover:text-fg sm:px-3";
  const active = { className: "!text-fg after:absolute after:inset-x-2.5 after:-bottom-px sm:after:inset-x-3 after:h-0.5 after:rounded-full after:bg-fg", "aria-current": "page" as const };

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-0.5 px-4 sm:gap-1.5 sm:px-6">
        <Link to="/" className="flex items-center gap-2 whitespace-nowrap text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg no-underline">
          Connection Guard
        </Link>
        {network && (
          <>
            <span className="hidden items-center sm:flex"><Slash /></span>
            <span className="ph-no-capture hidden max-w-48 truncate text-sm font-medium sm:inline">{network.name}</span>
            {installs.length > 1 && (
              <>
                <Slash />
                <label className="relative">
                  <span className="sr-only">Server</span>
                  <select
                    value={search.server ?? ""}
                    onChange={(e) => navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, server: e.target.value || undefined }) } as never)}
                    className="h-8 max-w-[6.75rem] appearance-none truncate rounded-md bg-transparent pl-2 pr-7 text-sm text-fg-2 transition-colors hover:bg-subtle hover:text-fg focus:bg-subtle sm:max-w-none"
                  >
                    <option value="">{installs.length} servers</option>
                    {installs.map((i) => <option key={i.id} value={i.id}>{serverName(i)}</option>)}
                  </select>
                  <ChevronsUpDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" />
                </label>
              </>
            )}
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
          <ThemeToggle />
          {me && (
            <AccountMenu me={me} onSignOut={async () => {
              await api.logout().catch(() => {});
              resetAnalytics();
              // setQueryData notifies mounted components (clear() alone does not), so the UI signs out
              // immediately even when we are already on "/" and no route remount happens.
              qc.setQueryData(["me"], null);
              qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "config" });
              navigate({ to: "/" });
            }} />
          )}
        </div>
      </div>
      {networkId && (
        <nav aria-label="Pages" className="mx-auto flex max-w-[1200px] overflow-x-auto px-1 [scrollbar-width:none] sm:px-3">
          <Link to="/n/$networkId" params={{ networkId }} search={keep} activeOptions={{ exact: true, includeSearch: false }} className={tab} activeProps={active}>Overview</Link>
          <Link to="/n/$networkId/register" params={{ networkId }} search={keep} activeOptions={{ includeSearch: false }} className={tab} activeProps={active}>Decisions</Link>
          <Link to="/n/$networkId/insights" params={{ networkId }} search={keep} activeOptions={{ includeSearch: false }} className={tab} activeProps={active}>Insights</Link>
          <Link to="/n/$networkId/settings" params={{ networkId }} search={keep} activeOptions={{ includeSearch: false }} className={tab} activeProps={active}>Settings</Link>
          <Link to="/n/$networkId/network" params={{ networkId }} search={keep} activeOptions={{ includeSearch: false }} className={tab} activeProps={active}>Network</Link>
        </nav>
      )}
    </header>
  );
}
