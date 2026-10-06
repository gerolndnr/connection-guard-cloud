import { useState } from "react";
import { CircleAlert, ExternalLink, Info, X } from "lucide-react";
import type { Note } from "../health.ts";

/** Needs-attention list: red when the operator must act, amber when it is good to know. Each note can be dismissed. */
export function Attention({ notes, onDismiss, onRemoveServer, settingsLink }: {
  notes: Note[]; onDismiss?: (n: Note) => void; onRemoveServer?: ((installId: string) => Promise<void>) | undefined;
  /** Renders a link to Settings with the given label (the router link lives with the caller). */
  settingsLink?: (label: string) => React.ReactNode;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  return (
    <ul className="divide-y divide-line">
      {notes.map((n) => (
        <li key={n.id} className="group flex gap-3 px-4 py-3.5">
          {n.tone === "action"
            ? <CircleAlert aria-label="Needs action" className="mt-0.5 size-4 shrink-0 text-danger" />
            : <Info aria-label="Note" className="mt-0.5 size-4 shrink-0 text-warn" />}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{n.title}</p>
            {n.detail && <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-fg-2">{n.detail}</p>}
            {n.command && <pre className="mono mt-2 overflow-x-auto rounded-md border border-line bg-subtle px-3 py-2 text-[0.75rem] leading-relaxed">{n.command}</pre>}
            {n.settingsLink && settingsLink && <div className="mt-1.5">{settingsLink(n.settingsLink)}</div>}
            {n.link && <a href={n.link.href} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[0.8125rem] text-fg-2 hover:text-fg">{n.link.label} <ExternalLink aria-hidden className="size-3" /></a>}
            {n.installId && onRemoveServer && (
              confirming === n.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem]">
                  <span className="text-fg-2">Remove it from this network? Its decisions are deleted.</span>
                  <button type="button" className="btn h-7 bg-danger px-2.5 text-[0.8125rem] text-white hover:brightness-110" disabled={removing}
                    onClick={async () => { setRemoving(true); try { await onRemoveServer(n.installId!); } finally { setRemoving(false); setConfirming(null); } }}>
                    {removing ? "Removing…" : "Remove"}
                  </button>
                  <button type="button" className="btn btn-ghost h-7 px-2.5 text-[0.8125rem]" onClick={() => setConfirming(null)}>Cancel</button>
                </div>
              ) : (
                <button type="button" className="mt-1.5 text-[0.8125rem] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg" onClick={() => setConfirming(n.id)}>
                  Server is gone for good? Remove it
                </button>
              )
            )}
          </div>
          {onDismiss && (
            <button type="button" className="btn btn-ghost -mr-1 -mt-1 size-7 shrink-0 p-0" aria-label={`Dismiss: ${n.title}`} title="Dismiss" onClick={() => onDismiss(n)}>
              <X className="size-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
