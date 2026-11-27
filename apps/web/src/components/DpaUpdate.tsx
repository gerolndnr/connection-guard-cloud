import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { api, ApiError } from "../api.ts";
import { useConfig } from "./Shell.tsx";

/**
 * Shown on a network's pages while it has not accepted the current data processing agreement. Managers accept it here;
 * viewers see who can. Until then the cloud stores decisions without the newly covered data (player names).
 */
export function DpaUpdate({ networkId }: { networkId: string }) {
  const net = useQuery({ queryKey: ["network", networkId], queryFn: () => api.network(networkId) });
  const config = useConfig();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!net.data || net.data.dpa_current !== false || !config.data) return null;
  const manager = net.data.role !== "viewer";

  async function accept() {
    setBusy(true); setError(null);
    try {
      await api.acceptDpa(networkId, config.data!.dpa_version);
      await qc.invalidateQueries({ queryKey: ["network", networkId] });
    } catch (err) {
      setError(err instanceof ApiError && err.code === "dpa_outdated"
        ? "The agreement changed again while this page was open. Reload to read the current version."
        : "Could not save. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <div role="status" className="border-b border-line bg-subtle">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[0.8125rem] sm:px-6">
        <FileText aria-hidden className="size-4 shrink-0 text-fg-2" />
        <p className="min-w-0 flex-1">
          <span className="font-medium">Updated data processing agreement.</span>{" "}
          Plugins from 0.6.2 send the name a player reported at login, so decisions show who it was. Until{" "}
          {manager ? "you accept" : "an owner or admin accepts"} the new version, names are dropped on arrival.{" "}
          <a href="https://connectionguard.net/dpa" target="_blank" rel="noopener" className="underline underline-offset-4">Read the agreement</a>
          {error && <span role="alert" className="ml-2 text-danger-text">{error}</span>}
        </p>
        {manager && (
          <button type="button" className="btn btn-primary h-8 px-3 text-[0.8125rem]" disabled={busy} onClick={accept}>
            {busy ? "Saving…" : "Accept for this network"}
          </button>
        )}
      </div>
    </div>
  );
}
