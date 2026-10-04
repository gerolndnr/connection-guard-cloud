// Insights: patterns in the last week of decisions across the network, each with a next step.
import { useEffect, useMemo } from "react";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { api } from "../api.ts";
import { Shell } from "../components/Shell.tsx";
import { ago, countryName, ms, num, pct } from "../format.ts";
import { HISTORY_DAYS, useHistory } from "../history.ts";
import { compareServices, networksBehindFlags, playersOnManyAddresses } from "../insights.ts";
import { usePlayerNames } from "../players.ts";
import { PROVIDERS } from "../providers.ts";
import { track } from "../analytics.ts";

function Card({ id, title, description, children }: { id: string; title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden" aria-labelledby={id}>
      <div className="border-b border-line px-5 py-4">
        <h2 id={id} className="text-base font-semibold tracking-[-0.01em]">{title}</h2>
        <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-fg-2">{description}</p>
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-5 py-8 text-center text-fg-2">{children}</p>;
const countries = (list: string[]) => (list.length === 0 ? "–" : list.length <= 2 ? list.map(countryName).join(", ") : `${countryName(list[0]!)} +${list.length - 1}`);
const serviceName = (id: string) => PROVIDERS.find((p) => p.key === id)?.name ?? (id === "ipqualityscore" ? "IPQualityScore" : id);

export function InsightsPage() {
  const { networkId } = useParams({ from: "/n/$networkId/insights" });
  const { server } = useSearch({ from: "/n/$networkId/insights" });
  const net = useQuery({ queryKey: ["network", networkId], queryFn: () => api.network(networkId) });
  const history = useHistory(networkId, { install: server });
  const events = history.data?.events;
  const networks = useMemo(() => (events ? networksBehindFlags(events) : []), [events]);
  const players = useMemo(() => (events ? playersOnManyAddresses(events) : []), [events]);
  const services = useMemo(() => (events ? compareServices(events) : []), [events]);
  const names = usePlayerNames(players.map((p) => p.uuid));
  const manage = net.data ? net.data.role !== "viewer" : false;
  useEffect(() => { track("insights_viewed"); }, []);

  return (
    <Shell networkId={networkId}>
      <div className="mx-auto max-w-5xl space-y-6 pb-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em]">Insights</h1>
          <p className="mt-1 text-fg-2">
            Patterns in the last {HISTORY_DAYS} days of decisions{server ? " on this server" : " across your servers"}
            {events ? ` · ${num(events.length)} ${events.length === 1 ? "login" : "logins"}` : ""}
            {history.data?.truncated ? " (the most recent 1,000)" : ""}.
          </p>
        </div>

        {history.isPending ? <div className="space-y-4">{[0, 1, 2].map((k) => <div key={k} className="skeleton h-48" />)}</div>
          : history.error ? <p role="alert" className="text-danger-text">Decisions could not be loaded. Reload the page to try again.</p> : (
          <>
            <Card id="networks-h" title="Networks behind VPN flags"
              description="Provider networks where detection services flagged a VPN or proxy. A network with many ordinary logins as well is often a home, mobile or school provider: trusting it usually fixes more than it risks.">
              {networks.length === 0 ? <Empty>No VPN or proxy flags in the last {HISTORY_DAYS} days.</Empty> : (
                <div className="relative overflow-x-auto">
                  <table className="table">
                    <thead><tr>
                      <th scope="col">Network</th><th scope="col" className="text-right">Flagged</th><th scope="col" className="hidden text-right sm:table-cell">Refused</th>
                      <th scope="col" className="text-right">Ordinary logins</th><th scope="col" className="hidden md:table-cell">Countries</th>
                      {manage && <th scope="col"><span className="sr-only">Actions</span></th>}
                    </tr></thead>
                    <tbody>
                      {networks.map((n) => (
                        <tr key={n.asn}>
                          <td><span className="block max-w-[16rem] truncate font-medium">{n.isp ?? "Unknown provider"}</span><span className="mono text-[0.75rem] text-fg-3">AS{n.asn}</span></td>
                          <td className="num text-right">{num(n.flagged)}</td>
                          <td className="num hidden text-right sm:table-cell">{num(n.refused)}</td>
                          <td className={`num text-right ${n.clean > n.flagged ? "font-medium text-accent-text" : ""}`}>{num(n.clean)}</td>
                          <td className="hidden text-[0.8125rem] text-fg-2 md:table-cell">{countries(n.countries)}</td>
                          {manage && (
                            <td className="whitespace-nowrap text-right">
                              <Link to="/n/$networkId/network" params={{ networkId }} search={{ rule: `ASN:${n.asn}`, effect: n.clean > n.flagged ? "EXEMPT" : "DENY" }} hash="rules"
                                className="btn btn-ghost h-8 px-2.5 text-[0.8125rem] no-underline" onClick={() => track("insight_rule_opened", { insight: "network", effect: n.clean > n.flagged ? "EXEMPT" : "DENY" })}>
                                {n.clean > n.flagged ? "Trust" : "Refuse"}<span className="hidden sm:inline"> network</span> <ArrowRight aria-hidden className="size-3.5" />
                              </Link>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card id="players-h" title="Players on many addresses"
              description="Verified players who joined from three or more addresses. Hopping between VPN servers looks like this, and so do travel and mobile networks, so look at their decisions before you act.">
              {players.length === 0 ? <Empty>No verified player joined from three or more addresses in the last {HISTORY_DAYS} days.</Empty> : (
                <div className="ph-no-capture relative overflow-x-auto">
                  <table className="table">
                    <thead><tr>
                      <th scope="col">Player</th><th scope="col" className="text-right">Addresses</th><th scope="col" className="hidden sm:table-cell">Countries</th>
                      <th scope="col" className="text-right">Refused</th><th scope="col" className="hidden text-right md:table-cell">Last login</th><th scope="col"><span className="sr-only">Decisions</span></th>
                    </tr></thead>
                    <tbody>
                      {players.map((p) => (
                        <tr key={p.uuid}>
                          <td>{names.get(p.uuid) ? <span className="font-medium">{names.get(p.uuid)}</span> : <span className="mono whitespace-nowrap text-[0.8125rem]" title={p.uuid}>{p.uuid.slice(0, 8)}…{p.uuid.slice(-4)}</span>}</td>
                          <td className="num text-right">{num(p.addresses)}</td>
                          <td className="hidden text-[0.8125rem] text-fg-2 sm:table-cell">{countries(p.countries)}</td>
                          <td className="num text-right">{p.refused ? `${num(p.refused)} of ${num(p.logins)}` : "–"}</td>
                          <td className="hidden text-right text-[0.8125rem] text-fg-2 md:table-cell">{ago(p.last)}</td>
                          <td className="whitespace-nowrap text-right">
                            <Link to="/n/$networkId/register" params={{ networkId }} search={{ ...(server ? { server } : {}), q: p.uuid }}
                              className="btn btn-ghost h-8 px-2.5 text-[0.8125rem] no-underline" aria-label="Their decisions"><span className="hidden sm:inline">Decisions</span> <ArrowRight aria-hidden className="size-3.5" /></Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card id="services-h" title="Detection services compared"
              description={<>How each VPN detection service answered. <strong className="font-medium text-fg">Disagreed</strong> counts logins where another service also answered and came to the other verdict. Services often disagree on hosting and relay networks; a high share is a reason to require more than one vote, not proof that one service is wrong.</>}>
              {services.length === 0 ? <Empty>No VPN lookups in the last {HISTORY_DAYS} days.</Empty> : (
                <div className="relative overflow-x-auto">
                  <table className="table">
                    <thead><tr>
                      <th scope="col">Service</th><th scope="col" className="text-right">Answered</th><th scope="col" className="text-right">Flagged</th>
                      <th scope="col" className="text-right">Median time</th><th scope="col" className="hidden text-right sm:table-cell">From cache</th><th scope="col" className="text-right">Disagreed</th>
                    </tr></thead>
                    <tbody>
                      {services.map((s) => (
                        <tr key={s.id}>
                          <td className="font-medium">{serviceName(s.id)}</td>
                          <td className="num text-right">{pct(s.asked ? s.answered / s.asked : null, 0)} <span className="text-fg-3">of {num(s.asked)}</span></td>
                          <td className="num text-right">{pct(s.answered ? s.positive / s.answered : null)}</td>
                          <td className="num text-right">{ms(s.medianMs)}</td>
                          <td className="num hidden text-right sm:table-cell">{pct(s.asked ? s.cached / s.asked : null, 0)}</td>
                          <td className="num text-right">{s.comparable ? <>{num(s.disagreed)} <span className="text-fg-3">of {num(s.comparable)}</span></> : <span className="text-fg-3" title="Only one service answered these logins">–</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </Shell>
  );
}
