import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import "./styles.css";
import { ApiError } from "./api.ts";
import { Home } from "./routes/Home.tsx";
import { LinkPage } from "./routes/LinkPage.tsx";
import { Overview } from "./routes/Overview.tsx";
import { RegisterPage } from "./routes/RegisterPage.tsx";
import { SettingsPage } from "./routes/SettingsPage.tsx";
import { SetupPage } from "./routes/SetupPage.tsx";
import { NotFound } from "./routes/NotFound.tsx";

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

const root = createRootRoute({ component: () => <Outlet />, notFoundComponent: NotFound });
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
