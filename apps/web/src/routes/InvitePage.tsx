import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api, ApiError } from "../api.ts";
import { Shell, useConfig, useMe } from "../components/Shell.tsx";
import { SignIn } from "../components/SignIn.tsx";
import { track } from "../analytics.ts";

export function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const me = useMe();
  const config = useConfig();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const invite = useQuery({ queryKey: ["invite", token], queryFn: () => api.invite(token), enabled: Boolean(me.data), retry: false, refetchInterval: false });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    if (!config.data) return;
    setBusy(true); setError(null);
    try {
      const res = await api.acceptInvite(token, config.data.dpa_version);
      track("invite_joined");
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate({ to: "/n/$networkId", params: { networkId: res.network_id } });
    } catch (err) {
      setError(err instanceof ApiError && err.code === "dpa_outdated" ? "The terms changed. Reload the page." : "Joining failed. The invite may have been used or revoked.");
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-md">
        <div className="card px-6 py-8">
          <Users aria-hidden className="size-6 text-fg-3" />
          <h1 className="mt-3 text-xl font-semibold tracking-[-0.02em]">You were invited to a network</h1>
          {!me.data ? (
            <><p className="mt-2 text-fg-2">Sign in with Discord to see the invitation.</p><div className="mt-6"><SignIn next={`/invite/${token}`} /></div></>
          ) : invite.isPending ? <div className="skeleton mt-4 h-24" /> : invite.error ? (
            <p role="alert" className="mt-2 text-danger-text">This invite does not exist anymore. It may have expired, been used or revoked. Ask for a new one.</p>
          ) : invite.data && (
            <>
              <p className="mt-2 text-fg-2">
                <span className="ph-no-capture font-medium text-fg">{invite.data.invited_by ?? "Someone"}</span> invited you to <span className="ph-no-capture font-medium text-fg">{invite.data.network_name}</span> as {invite.data.role === "admin" ? "an admin (can change settings and rules)" : "a viewer (can look, not change)"}.
              </p>
              {invite.data.member ? (
                <button type="button" className="btn btn-primary mt-6" onClick={() => navigate({ to: "/n/$networkId", params: { networkId: invite.data!.network_id } })}>You're already a member. Open it</button>
              ) : (
                <>
                  <label className="mt-5 flex cursor-pointer items-start gap-3 text-[0.875rem]">
                    <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                    <span>I accept the <a href="https://connectionguard.net/terms" target="_blank" rel="noopener" className="underline underline-offset-4">terms of service</a> (version {config.data?.dpa_version}). Player data in this network is processed for its owner under the <a href="https://connectionguard.net/dpa" target="_blank" rel="noopener" className="underline underline-offset-4">data processing agreement</a>.</span>
                  </label>
                  <button type="button" className="btn btn-primary mt-5" disabled={!accepted || busy} onClick={join}>{busy ? "Joining…" : "Join network"}</button>
                </>
              )}
              {error && <p role="alert" className="mt-3 text-[0.8125rem] text-danger-text">{error}</p>}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
