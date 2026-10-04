import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import type { Install, Role } from "../api.ts";
import { num, serverName } from "../format.ts";
import { hasQuotaKey, isConfigured, switchToEnforce } from "../setup.ts";

const dismissKey = (networkId: string) => `cg-checklist-dismissed:${networkId}`;
const readDismissed = (networkId: string) => { try { return localStorage.getItem(dismissKey(networkId)) === "1"; } catch { return false; } };

/** First-run checklist on the overview. Every item is derived from what the servers report, never from clicks alone. */
export function SetupChecklist({ networkId, installs, role, hasDecisions, wouldRefuse }: {
  networkId: string; installs: Install[]; role: Role; hasDecisions: boolean; wouldRefuse: number;
}) {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(() => readDismissed(networkId));
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const reporting = installs.filter((i) => i.status?.config);
  if (dismissed || role === "viewer" || installs.length === 0) return null;

  const unconfigured = reporting.find((i) => !isConfigured(i.status?.config, i.status?.managed));
  const missingKey = reporting.find((i) => !hasQuotaKey(i.status?.config));
  const observing = installs.filter((i) => i.status?.mode === "OBSERVE");
  const items = [
    { id: "link", title: "Link your server", done: true, body: null as React.ReactNode, action: null as React.ReactNode },
    {
      id: "setup", title: "Choose what to keep out", done: reporting.length > 0 && !unconfigured,
      body: "VPNs, countries, and how strict to start. Takes a minute.",
      action: unconfigured ? <Link to="/n/$networkId/setup" params={{ networkId }} search={{ server: unconfigured.id }} className="btn btn-primary h-8 no-underline">Start setup</Link> : null,
    },
    {
      id: "key", title: "Add a free API key", done: reporting.length > 0 && !missingKey,
      body: missingKey ? `${serverName(missingKey)} has 100 lookups a day without a key. When they run out, players get in unchecked.` : null,
      action: missingKey ? <Link to="/n/$networkId/settings" params={{ networkId }} search={{ server: missingKey.id }} hash="vpn" className="btn btn-secondary h-8 no-underline">Add key</Link> : null,
    },
    {
      id: "first", title: "See your first decision", done: hasDecisions,
      body: "Join your server once. Your own login shows up under Decisions with the reason.", action: null,
    },
    {
      id: "enforce", title: "Switch to Enforce", done: installs.length > 0 && observing.length === 0,
      body: observing.length === 0 ? null : wouldRefuse > 0
        ? <>{num(wouldRefuse)} {wouldRefuse === 1 ? "connection" : "connections"} would have been refused in the last 24 hours. <Link to="/n/$networkId/register" params={{ networkId }} className="font-medium text-fg">Review them</Link>, then switch.</>
        : "Watch for a few days. When the would-refuse entries look right, start refusing.",
      action: observing.length > 0 && hasDecisions ? (
        <button type="button" className="btn btn-secondary h-8" disabled={switching} onClick={async () => {
          setSwitching(true); setSwitchError(null);
          try { for (const i of observing) await switchToEnforce(i.id); await qc.invalidateQueries(); }
          catch { setSwitchError("Could not switch. Try again from Settings."); }
          finally { setSwitching(false); }
        }}>{switching ? "Switching…" : observing.length > 1 ? `Enforce on ${observing.length} servers` : "Switch to Enforce"}</button>
      ) : null,
    },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  const next = items.find((i) => !i.done);

  return (
    <section aria-labelledby="checklist-h" className="card mt-4 overflow-hidden">
      <div className="flex items-center gap-4 border-b border-line px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 id="checklist-h" className="text-sm font-medium">Finish setting up</h2>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label="Setup progress">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(done / items.length) * 100}%` }} />
            </div>
            <span className="num text-[0.8125rem] text-fg-3">{done} of {items.length}</span>
          </div>
        </div>
        <button type="button" className="btn btn-ghost size-8 p-0" aria-label="Hide checklist" title="Hide checklist"
          onClick={() => { setDismissed(true); try { localStorage.setItem(dismissKey(networkId), "1"); } catch { /* private mode */ } }}>
          <X className="size-4" />
        </button>
      </div>
      <ol className="divide-y divide-line">
        {items.map((item) => {
          const isNext = item === next;
          return (
            <li key={item.id} className={`flex gap-3 px-5 ${isNext ? "py-4" : "py-3"}`}>
              <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${item.done ? "border-accent bg-accent text-white" : isNext ? "border-fg" : "border-line-strong"}`}>
                {item.done && <Check className="size-3" strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={item.done ? "text-fg-3 line-through decoration-line-strong" : "font-medium"}>{item.title}<span className="sr-only">{item.done ? " (done)" : ""}</span></p>
                {isNext && item.body && <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-fg-2">{item.body}</p>}
                {isNext && item.id === "enforce" && switchError && <p role="alert" className="mt-1 text-[0.8125rem] text-danger-text">{switchError}</p>}
              </div>
              {isNext && item.action && <div className="shrink-0 self-center">{item.action}</div>}
              {!isNext && !item.done && item.action && <div className="hidden shrink-0 self-center sm:block">{item.action}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
