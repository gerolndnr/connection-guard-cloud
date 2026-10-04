import { Link, Navigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Shell, useMe } from "../components/Shell.tsx";
import { SignIn } from "../components/SignIn.tsx";

function ConsoleLine() {
  return (
    <figure className="m-0">
      <pre className="mono overflow-x-auto rounded-lg border border-line bg-[#0a0a0a] px-4 py-3 text-[0.75rem] leading-relaxed text-[#a1a1a1]">
        <span className="text-[#6b6b6b]">[12:04:51 INFO] </span>Link this server to your Connection Guard dashboard:{"\n"}
        <span className="text-[#6b6b6b]">[12:04:51 INFO] </span><span className="text-[#34d399]">https://app.connectionguard.net/link/7KQM-4P2X</span>
      </pre>
      <figcaption className="mt-2 text-[0.75rem] text-fg-3">Example console output. Your link is different and lasts 24 hours.</figcaption>
    </figure>
  );
}

const STEPS = [
  { title: "Start your server", body: "Connection Guard prints a link. Until you open it, only anonymous totals leave your server: no IPs, no player data." },
  { title: "Open the link and sign in", body: "Name your network and accept the data processing terms. Lost the link? Run /cg cloud link." },
  { title: "See every decision", body: "Totals since installation appear right away, individual decisions from the next sync on." },
];

function HowItWorks() {
  return (
    <section aria-labelledby="how" className="card p-6">
      <h2 id="how" className="text-sm font-medium">How linking works</h2>
      <ol className="mt-5 space-y-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span aria-hidden className="mono grid size-6 shrink-0 place-items-center rounded-full border border-line-strong text-[0.75rem] text-fg-2">{i + 1}</span>
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-fg-2">{s.body}</p>
              {i === 0 && <div className="mt-3"><ConsoleLine /></div>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 border-t border-line pt-4 text-[0.8125rem] text-fg-3">
        Logins never wait on this dashboard. Turn it off any time with <code className="rounded bg-subtle px-1 py-0.5">cloud.enabled: false</code>.
      </p>
    </section>
  );
}

export function Home() {
  const me = useMe();
  if (me.isPending) return <Shell><div className="skeleton mx-auto h-64 max-w-md" /></Shell>;
  const data = me.data;
  if (data && data.networks.length === 1) return <Navigate to="/n/$networkId" params={{ networkId: data.networks[0]!.id }} replace />;

  if (!data) {
    return (
      <Shell>
        <div className="mx-auto grid max-w-5xl items-start gap-6 pt-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-10">
          <section className="card p-8">
            <h1 className="text-2xl font-semibold tracking-[-0.025em]">Sign in to Connection Guard</h1>
            <p className="mt-2 text-fg-2">See every connection your servers checked, who was refused and why. Free and optional; your plugin works without it.</p>
            <div className="mt-8"><SignIn next="/" /></div>
          </section>
          <HowItWorks />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">{data.networks.length ? "Your networks" : `Welcome, ${data.user.name}`}</h1>
        {data.networks.length > 1 ? (
          <ul className="card mt-6 divide-y divide-line overflow-hidden">
            {data.networks.map((n) => (
              <li key={n.id}>
                <Link to="/n/$networkId" params={{ networkId: n.id }} className="flex items-center justify-between gap-3 px-5 py-4 no-underline transition-colors hover:bg-subtle">
                  <div>
                    <p className="font-medium">{n.name}</p>
                    <p className="text-[0.8125rem] text-fg-3">{n.servers} {n.servers === 1 ? "server" : "servers"} · {n.role}</p>
                  </div>
                  <ChevronRight aria-hidden className="size-4 text-fg-3" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="mt-2 text-fg-2">You have no linked servers yet. Start a server with Connection Guard 0.5 or newer and open the link it prints.</p>
            <div className="mt-6"><HowItWorks /></div>
          </>
        )}
      </div>
    </Shell>
  );
}
