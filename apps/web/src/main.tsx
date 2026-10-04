import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRootRoute, createRoute, createRouter, Outlet, useRouterState } from "@tanstack/react-router";
import "./styles.css";
import { ApiError } from "./api.ts";
import { Home } from "./routes/Home.tsx";
import { LinkPage } from "./routes/LinkPage.tsx";
import { Overview } from "./routes/Overview.tsx";
import { RegisterPage } from "./routes/RegisterPage.tsx";
import { SettingsPage } from "./routes/SettingsPage.tsx";
import { SetupPage } from "./routes/SetupPage.tsx";
import { NotFound } from "./routes/NotFound.tsx";
import { InsightsPage } from "./routes/InsightsPage.tsx";
import { NetworkPage } from "./routes/NetworkPage.tsx";
import { AccountPage } from "./routes/AccountPage.tsx";
import { InvitePage } from "./routes/InvitePage.tsx";
import { useConfig, useMe } from "./components/Shell.tsx";
import { identifyUser, setNetworkGroup, startAnalytics } from "./analytics.ts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      // Plugins sync every minute or slower; refetching faster would only burn the free tier.
      refetchInterval: 60_000,
      staleTime: 30_000,
    },
  },
});

/** Starts product analytics once the server says it is on, and keeps the account and network attached. */
function Telemetry() {
  const cfg = useConfig();
  const me = useMe();
  const networkId = useRouterState({ select: (s) => (s.matches[s.matches.length - 1]?.params as { networkId?: string } | undefined)?.networkId });
  // Wait until we know who is signed in, so a signed-in account starts with its own ID.
  const userId = me.isFetched ? (me.data?.user.id ?? null) : undefined;
  useEffect(() => {
    if (cfg.data && userId !== undefined) void startAnalytics({ key: cfg.data.posthog_key, host: cfg.data.posthog_host, userId });
  }, [cfg.data, userId]);
  useEffect(() => {
    const m = me.data;
    if (!m) return;
    identifyUser(m.user, {
      networks: m.networks.length,
      servers: m.networks.reduce((n, x) => n + x.servers, 0),
      owner_of: m.networks.filter((x) => x.role === "owner").length,
    });
  }, [me.data]);
  useEffect(() => {
    const n = me.data?.networks.find((x) => x.id === networkId);
    setNetworkGroup(n?.id, n ? { servers: n.servers } : {});
  }, [networkId, me.data]);
  return null;
}

const root = createRootRoute({ component: () => <><Telemetry /><Outlet /></>, notFoundComponent: NotFound });
const home = createRoute({ getParentRoute: () => root, path: "/", component: Home });
// ?src= tells which hint brought the operator here: the console notice, the in-game join message or /cg cloud link.
const LINK_SOURCES = ["console", "join", "command"] as const;
const linkSearch = (s: Record<string, unknown>): { src?: (typeof LINK_SOURCES)[number] } =>
  typeof s.src === "string" && (LINK_SOURCES as readonly string[]).includes(s.src) ? { src: s.src as (typeof LINK_SOURCES)[number] } : {};
const link = createRoute({ getParentRoute: () => root, path: "/link/$code", component: LinkPage, validateSearch: linkSearch });
const serverSearch = (s: Record<string, unknown>): { server?: string } =>
  typeof s.server === "string" && /^ins_[A-Za-z0-9]{20,32}$/.test(s.server) ? { server: s.server } : {};
const overview = createRoute({ getParentRoute: () => root, path: "/n/$networkId", component: Overview, validateSearch: serverSearch });
// ?q= opens the decision log with a search, e.g. a player's UUID from the insights page.
const registerSearch = (s: Record<string, unknown>): { server?: string; q?: string } => ({
  ...serverSearch(s),
  ...(typeof s.q === "string" && s.q.length <= 100 ? { q: s.q } : {}),
});
const register = createRoute({ getParentRoute: () => root, path: "/n/$networkId/register", component: RegisterPage, validateSearch: registerSearch });
const insights = createRoute({ getParentRoute: () => root, path: "/n/$networkId/insights", component: InsightsPage, validateSearch: serverSearch });

const settings = createRoute({ getParentRoute: () => root, path: "/n/$networkId/settings", component: SettingsPage, validateSearch: serverSearch });

const setup = createRoute({ getParentRoute: () => root, path: "/n/$networkId/setup", component: SetupPage, validateSearch: serverSearch });

// ?rule=<target>&effect=<ALLOW|DENY|EXEMPT> opens the rule builder prefilled (from the insights page).
const networkSearch = (s: Record<string, unknown>): { server?: string; rule?: string; effect?: "ALLOW" | "DENY" | "EXEMPT" } => ({
  ...serverSearch(s),
  ...(typeof s.rule === "string" && s.rule.length <= 80 ? { rule: s.rule } : {}),
  ...(s.effect === "ALLOW" || s.effect === "DENY" || s.effect === "EXEMPT" ? { effect: s.effect } : {}),
});
const network = createRoute({ getParentRoute: () => root, path: "/n/$networkId/network", component: NetworkPage, validateSearch: networkSearch });
const account = createRoute({ getParentRoute: () => root, path: "/account", component: AccountPage });
const invite = createRoute({ getParentRoute: () => root, path: "/invite/$token", component: InvitePage });

const router = createRouter({ routeTree: root.addChildren([home, link, overview, register, insights, settings, setup, network, account, invite]), defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
