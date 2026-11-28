// Player Intelligence settings for a network, shared by the Players page, the page tabs and the decision sheet.
import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";

export function useIntel(networkId: string | undefined) {
  return useQuery({
    queryKey: ["intel", networkId],
    queryFn: () => api.intel(networkId!),
    enabled: Boolean(networkId),
    // What Intel Cloud offers changes with a release, not by the minute.
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });
}

/** Player Intelligence can be used on this network right now (offered and the agreement accepted). */
export const intelReady = (s: { available: boolean; offered: boolean; agreement_accepted: boolean } | undefined) =>
  Boolean(s?.available && s.offered && s.agreement_accepted);

const UUID = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i;

/** A Minecraft UUID with or without dashes, as the dashed lower-case form; null for anything else. */
export function parseUuid(input: string): string | null {
  const m = UUID.exec(input.trim());
  return m ? m.slice(1).join("-").toLowerCase() : null;
}
