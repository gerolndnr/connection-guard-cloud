// Product analytics for the dashboard (PostHog, EU). Never sends player data: see docs/ANALYTICS.md.
//
// - No cookies or browser storage: persistence is in memory. A signed-in account starts with its random dashboard
//   user ID as the distinct ID (never the Discord name), so reloads don't mint new IDs; a reload starts a new session.
// - Session replays hide all text and inputs; tables with player data are excluded from autocapture.
// - Off when the server sends no PostHog key (only production has one), with Global Privacy Control, or after opting out.
import type { PostHog, CaptureResult } from "posthog-js/dist/module.no-external";
import { normalizePath, scrubEventProperties, scrubValue } from "@cg/protocol/scrub";

const OPT_OUT_KEY = "cg-analytics-optout";
type Props = Record<string, unknown>;

let ph: PostHog | null = null;
let starting = false;
type StartConfig = { key: string; host: string; userId: string | null };
let lastConfig: StartConfig | null = null;
const queue: ((p: PostHog) => void)[] = [];

function run(fn: (p: PostHog) => void) {
  if (ph) fn(ph); else if (starting) queue.push(fn);
}

export function analyticsOptedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === "1"; } catch { return false; }
}

function gpc(): boolean {
  return Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
}

export function analyticsAvailable(): boolean {
  return !gpc();
}

function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;
  const props = event.properties as Props;
  for (const k of ["$current_url", "$pathname", "$referrer", "$initial_current_url", "$prev_pageview_pathname"]) {
    if (typeof props[k] === "string") props[k] = normalizePath(props[k] as string);
  }
  event.properties = scrubEventProperties(props) as typeof event.properties;
  if (event.$set) event.$set = scrubValue(event.$set) as typeof event.$set;
  return event;
}

export async function startAnalytics(cfg: StartConfig) {
  lastConfig = cfg;
  if (ph || starting || !cfg.key || gpc() || analyticsOptedOut()) return;
  starting = true;
  const { default: posthog } = await import("./runtime.ts");
  posthog.init(cfg.key, {
    api_host: cfg.host,
    ui_host: "https://eu.posthog.com",
    defaults: "2026-08-30",
    persistence: "memory",
    // Without browser storage every load would mint a new anonymous ID; start as the account instead.
    ...(cfg.userId ? { bootstrap: { distinctID: cfg.userId, isIdentifiedID: true } } : {}),
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: true,
    capture_dead_clicks: true,
    capture_exceptions: true,
    capture_performance: { web_vitals: true, network_timing: true },
    respect_dnt: true,
    before_send: beforeSend,
    session_recording: { maskAllInputs: true, maskTextSelector: "*", blockSelector: ".ph-no-capture" },
    // Console output can carry addresses from API errors; the project-wide console capture stays off here.
    enable_recording_console_log: false,
  });
  posthog.register({ surface: "dashboard" });
  ph = posthog;
  starting = false;
  for (const fn of queue.splice(0)) fn(posthog);
}

/** Custom events are prefixed `cg_` so they never collide with PostHog's own `$` events or other products. */
export function track(event: string, props: Props = {}) {
  run((p) => p.capture(`cg_${event}`, props));
}

export function identifyUser(user: { id: string }, props: Props) {
  run((p) => { if (p.get_distinct_id() !== user.id) p.identify(user.id, props); else p.setPersonProperties(props); });
}

export function setNetworkGroup(networkId: string | undefined, props: Props = {}) {
  run((p) => { if (networkId) p.group("network", networkId, props); else p.resetGroups(); });
}

export function resetAnalytics() {
  run((p) => p.reset());
}

export function setAnalyticsOptOut(out: boolean) {
  try { if (out) localStorage.setItem(OPT_OUT_KEY, "1"); else localStorage.removeItem(OPT_OUT_KEY); } catch { /* private mode */ }
  if (out) run((p) => p.opt_out_capturing());
  else if (ph) ph.opt_in_capturing();
  else if (lastConfig) void startAnalytics(lastConfig);
}
