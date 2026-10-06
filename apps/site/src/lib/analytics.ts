// Cookieless visit statistics for connectionguard.net (PostHog, EU). See docs/ANALYTICS.md.
// Nothing is stored in the browser and no profile is created: PostHog counts visitors with a daily-rotating
// server-side hash. Loaded after the page is idle so it never delays rendering. Off without a key or with
// Global Privacy Control.
import { scrubEventProperties } from "@cg/protocol/scrub";

const KEY = import.meta.env.PUBLIC_POSTHOG_KEY ?? "";
const HOST = import.meta.env.PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

type Ph = typeof import("./runtime").default;

function props(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(el.dataset)) if (k.startsWith("ph") && k !== "phEvent" && k !== "phView" && v) out[k.slice(2).replace(/^./, (c) => c.toLowerCase())] = v;
  return out;
}

function wire(ph: Ph) {
  // Page-level events declared in markup, e.g. <main data-ph-view="install_guide_opened" data-ph-platform="velocity">.
  const view = document.querySelector<HTMLElement>("[data-ph-view]");
  if (view?.dataset.phView) ph.capture(`cg_${view.dataset.phView}`, { ...props(view), page: location.pathname });
  // Explicit events for the actions that matter: <a data-ph-event="download_clicked" data-ph-destination="modrinth">.
  document.addEventListener("click", (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>("[data-ph-event]");
    if (el?.dataset.phEvent) ph.capture(`cg_${el.dataset.phEvent}`, { ...props(el), page: location.pathname });
  }, { capture: true });
  // Which questions people open.
  document.addEventListener("toggle", (e) => {
    const d = e.target as HTMLDetailsElement;
    if (d.tagName === "DETAILS" && d.open) ph.capture("cg_faq_opened", { question: d.querySelector("summary")?.textContent?.trim().slice(0, 120), page: location.pathname });
  }, { capture: true });
}

export function startSiteAnalytics() {
  if (!KEY || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  const go = () => import("./runtime").then(({ default: ph }) => {
    ph.init(KEY, {
      api_host: HOST,
      ui_host: "https://eu.posthog.com",
      defaults: "2026-08-30",
      cookieless_mode: "always",
      person_profiles: "never",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      capture_dead_clicks: true,
      capture_exceptions: true,
      capture_performance: { web_vitals: true },
      disable_session_recording: true,
      disable_surveys: true,
      respect_dnt: true,
      before_send: (ev) => {
        if (!ev) return ev;
        // Which download flow this page load showed (data/release.ts DOWNLOAD_FLOW).
        ev.properties = { ...scrubEventProperties(ev.properties), download_flow: document.documentElement.dataset.dl ?? null } as typeof ev.properties;
        return ev;
      },
    });
    ph.register({ surface: "site" });
    wire(ph);
  });
  if ("requestIdleCallback" in window) requestIdleCallback(() => void go(), { timeout: 3000 });
  else setTimeout(() => void go(), 1500);
}
