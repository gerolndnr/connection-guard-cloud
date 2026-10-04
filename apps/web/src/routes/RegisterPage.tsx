import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, type RegisterEvent } from "../api.ts";
import { Shell } from "../components/Shell.tsx";
import { DecisionTable, WhySheet } from "../components/Register.tsx";

type Filter = "all" | "refused" | "would" | "errors";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" }, { id: "refused", label: "Refused" }, { id: "would", label: "Would refuse" }, { id: "errors", label: "Errors" },
];
const outcomeFor: Record<Filter, string | undefined> = { all: undefined, refused: "DENY", would: "WOULD_REFUSE", errors: "ERROR" };

export function RegisterPage() {
  const { networkId } = useParams({ from: "/n/$networkId/register" });
  const { server } = useSearch({ from: "/n/$networkId/register" });
  const [filter, setFilter] = useState<Filter>("all");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<RegisterEvent | null>(null);
  useEffect(() => { const t = window.setTimeout(() => setQ(input.trim()), 250); return () => window.clearTimeout(t); }, [input]);

  const net = useQuery({ queryKey: ["network", networkId], queryFn: () => api.network(networkId) });
  const events = useInfiniteQuery({
    queryKey: ["register", networkId, filter, q, server],
    queryFn: ({ pageParam }) => api.events(networkId, { outcome: outcomeFor[filter], q, before: pageParam, limit: 100, install: server }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_before ?? undefined,
  });
  const rows = useMemo(() => events.data?.pages.flatMap((p) => p.events) ?? [], [events.data]);

  // Rows that arrive on a background refetch get a brief highlight.
  const seen = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    const prev = seen.current;
    seen.current = ids;
    return prev ? new Set([...ids].filter((id) => !prev.has(id))) : new Set<string>();
  }, [rows]);

  const installs = net.data?.installs ?? [];
  return (
    <>
    <Shell networkId={networkId}>
      <div className={selected ? "lg:mr-[29.5rem]" : ""}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em]">Decisions</h1>
            <p className="mt-1 text-fg-2">Every checked connection, newest first. Select one to see why.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filter" className="segmented">
            {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
          </div>
          <label className="relative w-full sm:w-80">
            <span className="sr-only">Search by IP, UUID, country code or ISP</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
            <input className="input pl-9" placeholder="Search IP, UUID, country code, ISP" value={input} onChange={(e) => setInput(e.target.value)} />
          </label>
        </div>

        <div className="card mt-4 overflow-hidden">
          {events.isPending ? (
            <div className="space-y-2 p-4">{Array.from({ length: 10 }, (_, k) => <div key={k} className="skeleton h-7" />)}</div>
          ) : events.error ? (
            <p role="alert" className="px-4 py-8 text-center text-danger-text">Decisions could not be loaded. They retry every minute.</p>
          ) : rows.length === 0 ? (
            <div className="px-4 py-12 text-center text-fg-2">
              {q ? <>No decision matches <span className="mono font-medium text-fg">{q}</span>. Search works on IPs, UUIDs, two-letter country codes and ISP names.</>
                : filter === "refused" ? "Nothing refused in the last 30 days."
                : filter === "would" ? "Nothing would have been refused."
                : filter === "errors" ? "No errors."
                : "No decisions yet. They appear after the next sync of a linked server, usually within a minute."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DecisionTable events={rows} narrow={selected !== null} fresh={fresh} installs={installs} selected={selected?.id ?? null} onSelect={setSelected} />
            </div>
          )}
        </div>
        {events.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <button type="button" className="btn btn-secondary" disabled={events.isFetchingNextPage} onClick={() => events.fetchNextPage()}>
              {events.isFetchingNextPage ? "Loading…" : "Load older"}
            </button>
          </div>
        )}
      </div>
    </Shell>
    {/* Outside <main> so it stays usable while the page behind it is inert. */}
    {selected && <WhySheet event={selected} installs={installs} onClose={() => setSelected(null)} />}
    </>
  );
}
