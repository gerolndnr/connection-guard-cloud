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
      for (const u of missing) known.set(u, names[u] ?? null);
      return names;
    },
    enabled: missing.length > 0,
    staleTime: Infinity,
    refetchInterval: false,
  });
  void q.data;
  return known;
}
