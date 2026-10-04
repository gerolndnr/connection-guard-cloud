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
const link = createRoute({ getParentRoute: () => root, path: "/link/$code", component: LinkPage });
const serverSearch = (s: Record<string, unknown>): { server?: string } =>
  typeof s.server === "string" && /^ins_[A-Za-z0-9]{20,32}$/.test(s.server) ? { server: s.server } : {};
const overview = createRoute({ getParentRoute: () => root, path: "/n/$networkId", component: Overview, validateSearch: serverSearch });
const register = createRoute({ getParentRoute: () => root, path: "/n/$networkId/register", component: RegisterPage, validateSearch: serverSearch });

const settings = createRoute({ getParentRoute: () => root, path: "/n/$networkId/settings", component: SettingsPage, validateSearch: serverSearch });

const setup = createRoute({ getParentRoute: () => root, path: "/n/$networkId/setup", component: SetupPage, validateSearch: serverSearch });

const router = createRouter({ routeTree: root.addChildren([home, link, overview, register, settings, setup]), defaultPreload: "intent" });

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
