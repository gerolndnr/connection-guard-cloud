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
  const version = config.data.dpa_version;

  async function accept() {
    setBusy(true); setError(null);
    try {
      await api.acceptDpa(networkId, version);
      await qc.invalidateQueries({ queryKey: ["network", networkId] });
    } catch (err) {
      setError(err instanceof ApiError && err.code === "dpa_outdated"
        ? "The agreement changed again while this page was open. Reload to read the current version."
        : "Could not save. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <section aria-label="Data processing agreement update" className="border-b border-line bg-subtle">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 text-[0.8125rem] sm:flex-nowrap sm:px-6">
        <FileText aria-hidden className="size-4 shrink-0 text-fg-2" />
        <div className="min-w-0 flex-1 basis-[calc(100%_-_2rem)] sm:basis-auto">
          <p><span className="font-medium">Updated data processing agreement ({version}).</span>{" "}
            From plugin 0.6.2, decisions can include the name reported at login. The cloud discards the name until{" "}
            {manager ? "you accept" : "an authorised owner or admin accepts"} the agreement for this network.{" "}
            <a href="https://connectionguard.net/avv" target="_blank" rel="noopener" className="underline underline-offset-4">Read the binding German agreement</a>
            {" · "}<a href="https://connectionguard.net/dpa" target="_blank" rel="noopener" className="underline underline-offset-4">English translation</a>.
          </p>
          {manager && <p className="mt-1 text-fg-2">By accepting, you confirm you can enter into this agreement for the server operator.</p>}
          {error && <p role="alert" className="mt-1 text-danger-text">{error}</p>}
        </div>
        {manager && (
          <button type="button" className="btn btn-primary ml-8 h-8 px-3 text-[0.8125rem] sm:ml-0" disabled={busy} onClick={accept}>
            {busy ? "Saving…" : "Accept for this network"}
          </button>
        )}
      </div>
    </section>
  );
}
