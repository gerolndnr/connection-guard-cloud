import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api.ts";
import { Shell, useMe } from "../components/Shell.tsx";
import { Row, Section } from "../components/Form.tsx";
import { resetAnalytics, track } from "../analytics.ts";
import { SignIn } from "../components/SignIn.tsx";

export function AccountPage() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (me.isPending) return <Shell><div className="skeleton h-64" /></Shell>;
  if (!me.data) return <Shell><div className="mx-auto max-w-md"><SignIn next="/account" /></div></Shell>;
  const owned = me.data.networks.filter((n) => n.role === "owner");

  const download = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), account: me.data!.user, networks: me.data!.networks }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "connection-guard-account.json"; a.click(); URL.revokeObjectURL(a.href);
    track("account_exported");
  };
  const del = async () => {
    setBusy(true); setError(null);
    try {
      await api.deleteAccount();
      resetAnalytics();
      qc.setQueryData(["me"], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "config" });
      navigate({ to: "/" });
    } catch { setError("Deleting failed. Try again, or write to privacy@connectionguard.net."); setBusy(false); }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-3xl space-y-6 pb-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">Account</h1>
          <p className="ph-no-capture mt-1 text-fg-2">Signed in with Discord as {me.data.user.name}</p>
        </div>
        <Section title="Your data" description="What the dashboard stores about you, and how to take it with you or delete it.">
          <Row label="Export" help="Your account and the networks you belong to. Each network's page has its own, complete export.">
            <button type="button" className="btn btn-secondary" onClick={download}>Download JSON</button>
          </Row>
          <Row label={<span className="text-danger-text">Delete account</span>} help={owned.length
            ? `Also deletes ${owned.length === 1 ? "the network" : `${owned.length} networks`} you own alone (${owned.map((n) => n.name).join(", ")}), with their decisions. Networks with another owner stay.`
            : "Removes you from your networks and deletes your account."}>
            <div className="grid gap-2">
              <input className="input" placeholder="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <button type="button" className="btn bg-danger text-white hover:brightness-110" disabled={confirm !== "DELETE" || busy} onClick={del}>{busy ? "Deleting…" : "Delete my account"}</button>
              {error && <p role="alert" className="text-[0.8125rem] text-danger-text">{error}</p>}
            </div>
          </Row>
        </Section>
      </div>
    </Shell>
  );
}
