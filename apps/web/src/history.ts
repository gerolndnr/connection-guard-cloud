// Recent decisions for client-side analysis: the settings simulation, the rule preview and the insights page.
// Pages through the decision log (200 per request) and stops at the window or the page cap.
import { useQuery } from "@tanstack/react-query";
import { api, type RegisterEvent } from "./api.ts";

export const HISTORY_DAYS = 7;
const PAGE = 200;
const MAX_PAGES = 5;

export interface History {
  events: RegisterEvent[];
  since: number;
  /** True when the page cap cut the window short: older decisions in the window were not loaded. */
  truncated: boolean;
}

export async function loadHistory(networkId: string, install?: string, days = HISTORY_DAYS): Promise<History> {
  const since = Date.now() - days * 24 * 3_600_000;
  const events: RegisterEvent[] = [];
  let before: number | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await api.events(networkId, { install, limit: PAGE, before });
    events.push(...res.events.filter((e) => e.at >= since));
    if (!res.next_before || res.next_before < since) return { events, since, truncated: false };
    before = res.next_before;
  }
  return { events, since, truncated: true };
}

export function useHistory(networkId: string, opts: { install?: string | undefined; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["history", networkId, opts.install ?? "all"],
    enabled: opts.enabled ?? true,
    staleTime: 5 * 60_000,
    refetchInterval: false,
    queryFn: () => loadHistory(networkId, opts.install),
  });
}
