import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConfig } from "./Shell.tsx";
import { api } from "../api.ts";
import { track } from "../analytics.ts";

function DiscordMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
      <path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14.1 14.1 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.1-.8-9.5-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.4 8 10.4s2.2 1.1 2.2 2.5-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.5 2.2-2.5 2.2 1.1 2.2 2.5-1 2.4-2.2 2.4Z" />
    </svg>
  );
}

export function SignIn({ next }: { next: string }) {
  const config = useConfig();
  const qc = useQueryClient();
  const [name, setName] = useState("Dev Operator");
  const [busy, setBusy] = useState(false);
  const href = `/api/auth/discord/start?next=${encodeURIComponent(next)}`;
  return (
    <div className="space-y-4">
      <a href={config.data?.discord_enabled === false ? undefined : href} onClick={() => track("sign_in_clicked", { method: "discord" })} aria-disabled={config.data?.discord_enabled === false}
        className={`btn btn-discord h-10 w-full no-underline ${config.data?.discord_enabled === false ? "pointer-events-none opacity-50" : ""}`}>
        <DiscordMark /> Sign in with Discord
      </a>
      <p className="text-center text-[0.8125rem] text-fg-3">
        {config.data?.discord_enabled === false ? "Discord sign-in is not configured on this instance yet." : <>We only read your Discord name and avatar. No email, no servers, no messages. <a href="https://connectionguard.net/privacy" className="underline decoration-line-strong underline-offset-4 hover:text-fg">Privacy policy</a></>}
      </p>
      {config.data?.dev_login && (
        <form className="flex items-end gap-2 border-t border-line pt-4"
          onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api.devLogin(name); await qc.invalidateQueries(); } finally { setBusy(false); } }}>
          <label className="grid flex-1 gap-1.5 text-[0.8125rem] text-fg-3">
            <span>Local development only</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn btn-secondary" disabled={busy}>Dev sign-in</button>
        </form>
      )}
    </div>
  );
}
