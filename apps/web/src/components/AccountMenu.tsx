import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import type { Me } from "../api.ts";
import { analyticsAvailable, analyticsOptedOut, setAnalyticsOptOut } from "../analytics.ts";

/** Avatar button with the account name, the usage-data choice and sign out. */
export function AccountMenu({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(() => !analyticsOptedOut());
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" aria-label="Account" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}
        className="ph-no-capture grid size-8 place-items-center rounded-full transition-shadow hover:ring-2 hover:ring-line-strong">
        {me.user.avatar
          ? <img src={me.user.avatar} alt="" className="size-7 rounded-full" />
          : <span className="grid size-7 place-items-center rounded-full bg-fg text-xs font-semibold text-surface">{me.user.name.slice(0, 1)}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-72 rounded-lg border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)]">
          <p className="ph-no-capture truncate px-2.5 pb-2 pt-1.5 text-sm font-medium">{me.user.name}</p>
          <div className="border-t border-line px-2.5 py-2.5">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span>
                <span className="block text-[0.8125rem] font-medium">Share usage data</span>
                <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-fg-3">
                  {analyticsAvailable()
                    ? "Anonymous clicks and errors help improve the dashboard. Never your players' data."
                    : "Off: your browser asks sites not to track (Global Privacy Control)."}
                </span>
              </span>
              <input type="checkbox" role="switch" className="mt-0.5 size-4 accent-[var(--accent)]" disabled={!analyticsAvailable()}
                checked={sharing && analyticsAvailable()} onChange={(e) => { setSharing(e.target.checked); setAnalyticsOptOut(!e.target.checked); }} />
            </label>
            <a href="https://connectionguard.net/privacy" className="mt-2 inline-block text-[0.75rem] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">What is collected</a>
          </div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }}
            className="flex w-full items-center gap-2 rounded-md border-t border-line px-2.5 py-2 text-left text-[0.8125rem] text-fg-2 hover:bg-subtle hover:text-fg">
            <LogOut aria-hidden className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
