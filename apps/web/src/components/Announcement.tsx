import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, TriangleAlert, X } from "lucide-react";
import { api } from "../api.ts";

const KEY = "cg-announcement-dismissed";

/** A message for every user (maintenance, incidents, changes to sub-processors), set by the operator in KV. */
export function Announcement() {
  const q = useQuery({ queryKey: ["announcement"], queryFn: api.announcement, staleTime: 5 * 60_000, refetchInterval: 15 * 60_000 });
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const a = q.data?.announcement;
  if (!a || dismissed === a.id) return null;
  const tone = a.tone === "danger" ? "border-danger/30 bg-danger-soft text-danger-text" : a.tone === "warn" ? "border-warn/30 bg-warn-soft text-warn-text" : "border-line bg-subtle text-fg";
  return (
    <div role="status" className={`border-b ${tone}`}>
      <div className="mx-auto flex max-w-[1200px] items-start gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-6">
        {a.tone === "danger" || a.tone === "warn" ? <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Info aria-hidden className="mt-0.5 size-4 shrink-0" />}
        <p className="min-w-0 flex-1">{a.text}{a.url && <> <a href={a.url} className="font-medium underline underline-offset-4">Details</a></>}</p>
        <button type="button" className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss" onClick={() => { try { localStorage.setItem(KEY, a.id); } catch { /* private mode */ } setDismissed(a.id); }}><X className="size-4" /></button>
      </div>
    </div>
  );
}
