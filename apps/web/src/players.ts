// Minecraft names for player UUIDs, resolved by the API at Mojang and remembered for this page view.
import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";

const known = new Map<string, string | null>();

export function usePlayerNames(uuids: (string | null | undefined)[]): Map<string, string | null> {
  const missing = [...new Set(uuids.filter((u): u is string => Boolean(u)))].filter((u) => !known.has(u)).sort().slice(0, 40);
  const q = useQuery({
    queryKey: ["players", missing.join(",")],
    queryFn: async () => {
      const { names } = await api.players(missing);
      // A UUID the API left out could not be looked up right now; it stays unknown and is asked again later.
      for (const u of missing) if (u in names) known.set(u, names[u] ?? null);
      return names;
    },
    enabled: missing.length > 0,
    // Answered UUIDs leave `missing`, so this only re-asks for ones whose lookup failed, at most every 5 minutes.
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });
  void q.data;
  return known;
}
