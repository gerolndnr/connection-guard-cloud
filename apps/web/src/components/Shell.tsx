import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api.ts";
import { TopNav } from "./TopNav.tsx";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try { return await api.me(); } catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
    },
    refetchInterval: false,
  });
}

export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity, refetchInterval: false });
}

export function Shell({ networkId, children }: { networkId?: string; children: ReactNode }) {
  const me = useMe();
  return (
    <div className="min-h-dvh" data-shell>
      <TopNav me={me.data ?? undefined} networkId={networkId} />
      <main className="mx-auto max-w-[1200px] px-4 pb-24 pt-8 sm:px-6">{children}</main>
    </div>
  );
}
