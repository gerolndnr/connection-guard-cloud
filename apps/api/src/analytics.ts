// Server-side product events (PostHog, EU) for the activation funnel and active-server counts.
// Never contains player data: no IPs, UUIDs, names, setting values or keys. See docs/ANALYTICS.md.
// Uses one subrequest per call, sent after the response (waitUntil), so it costs no extra Worker request.
import type { Context } from "hono";
import { scrubEventProperties } from "@cg/protocol/scrub";
import type { AppEnv, Env } from "./env.ts";

export interface ServerEvent {
  event: string;
  distinct_id: string;
  properties?: Record<string, unknown>;
  groups?: { network?: string | null };
  /** Installs are not people: no person profile is created for them. */
  person?: boolean;
}

function payload(env: Env, events: ServerEvent[], now: number) {
  return {
    api_key: env.POSTHOG_KEY,
    batch: events.map((e) => {
      const groups = e.groups?.network ? { network: e.groups.network } : undefined;
      return {
        // Custom events are prefixed `cg_`, PostHog's own (`$groupidentify`) are not.
        event: e.event.startsWith("$") ? e.event : `cg_${e.event}`,
        timestamp: new Date(now).toISOString(),
        properties: {
          ...scrubEventProperties(e.properties ?? {}),
          distinct_id: e.distinct_id,
          $lib: "connection-guard-api",
          $geoip_disable: true,
          ...(e.person === false ? { $process_person_profile: false } : {}),
          ...(groups ? { $groups: groups } : {}),
          surface: "api",
        },
      };
    }),
  };
}

/** Sends events now; resolves when done (or failed). Analytics never throws. */
export async function sendEvents(env: Env, events: ServerEvent[], now = Date.now()): Promise<void> {
  if (!env.POSTHOG_KEY || env.ENVIRONMENT !== "production" || events.length === 0) return;
  try {
    await fetch(`${env.POSTHOG_HOST || "https://eu.i.posthog.com"}/batch/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload(env, events, now)),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* best effort */ }
}

/** Fire and forget from a request handler: sent after the response. */
export function capture(c: Context<AppEnv>, ...events: ServerEvent[]) {
  if (!c.env.POSTHOG_KEY || c.env.ENVIRONMENT !== "production") return;
  let waitUntil: ((p: Promise<unknown>) => void) | undefined;
  try { const ctx = c.executionCtx; waitUntil = ctx.waitUntil.bind(ctx); } catch { return; }
  waitUntil(sendEvents(c.env, events));
}

export { payload as analyticsPayload };
