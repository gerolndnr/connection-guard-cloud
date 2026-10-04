import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Stats } from "../api.ts";
import { num } from "../format.ts";

const H = 220;
const PAD = { top: 14, right: 8, bottom: 26, left: 40 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}

/** Columns of checked connections per bucket; the refused part sits on top in the reserved red. */
export function TallyChart({ stats }: { stats: Stats }) {
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(720);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const titleId = useId();
  const series = stats.series;
  const max = niceMax(Math.max(1, ...series.map((p) => p.checks)));
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, series.length);
  const barW = Math.max(2, Math.min(24, slot - 2));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const hourly = stats.bucket_ms < 86_400_000;
  const labelEvery = Math.ceil(series.length / Math.max(1, Math.floor(innerW / 64)));
  const fmtTick = (t: number) => hourly
    ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const hovered = hover === null ? null : series[hover];
  const empty = useMemo(() => series.every((p) => p.checks === 0), [series]);
  const pencil = useMemo(() => series.some((p) => p.would_refuse > 0), [series]);
  const hatchId = `${titleId.replace(/:/g, "")}-pencil`;

  return (
    <figure className="relative m-0" aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">Connections checked per {hourly ? "hour" : "day"}, refused part highlighted</figcaption>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-fg-2">
        <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block size-2.5 rounded-[3px] bg-accent" /> Admitted</span>
        {pencil && <span className="flex items-center gap-1.5"><svg aria-hidden width="10" height="10" className="rounded-[3px]"><rect width="10" height="10" fill={`url(#${hatchId})`} /></svg> Would refuse</span>}
        <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block size-2.5 rounded-[3px] bg-danger" /> Refused</span>
      </div>
      <div ref={boxRef}>
        <svg width={width} height={H} role="img" aria-labelledby={titleId} className="block overflow-visible" onMouseLeave={() => setHover(null)}>
          <defs>
            {/* Would-refuse is a state, so it is told apart by texture as well as the amber warning hue. */}
            <pattern id={hatchId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="var(--warn-soft)" />
              <line x1="0" y1="0" x2="0" y2="4" stroke="var(--warn)" strokeWidth="1.75" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-fg-3 text-[11px]">{num(t)}</text>
            </g>
          ))}
          {series.map((p, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const admitted = Math.max(0, p.checks - p.denied - p.would_refuse);
            const hA = (admitted / max) * innerH;
            const hW = (p.would_refuse / max) * innerH;
            const hD = (p.denied / max) * innerH;
            const base = PAD.top + innerH;
            const gapW = hW > 0 && hA > 0 ? 2 : 0;
            const gapD = hD > 0 && hA + hW > 0 ? 2 : 0;
            return (
              <g key={p.t} opacity={hover === null || hover === i ? 1 : 0.45}>
                {hA > 0 && <path d={col(x, base - hA, barW, hA, hW === 0 && hD === 0)} fill="var(--accent)" />}
                {hW > 0 && <path d={col(x, base - hA - gapW - hW, barW, hW, hD === 0)} fill={`url(#${hatchId})`} />}
                {hD > 0 && <path d={col(x, base - hA - gapW - hW - gapD - hD, barW, hD, true)} fill="var(--danger)" />}
                <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="num fill-fg-3 text-[11px]">{fmtTick(p.t)}</text>
                )}
              </g>
            );
          })}
          <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="var(--line-strong)" strokeWidth={1} />
        </svg>
      </div>
      {empty && <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-fg-3">No connections checked in this period yet.</p>}
      {hovered && hover !== null && (
        <div role="status" className="pointer-events-none absolute top-10 z-10 min-w-44 rounded-lg border border-line bg-surface px-3 py-2.5 text-[0.8125rem] shadow-[var(--shadow-pop)]"
          style={{ left: Math.min(width - 170, Math.max(0, PAD.left + hover * slot + slot / 2 - 80)) }}>
          <div className="mb-1.5 font-medium">{hourly ? `${fmtTick(hovered.t)}, ${new Date(hovered.t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : fmtTick(hovered.t)}</div>
          <div className="num flex justify-between gap-4"><span className="text-fg-2">Checked</span>{num(hovered.checks)}</div>
          <div className="num flex justify-between gap-4"><span className="flex items-center gap-1.5 text-fg-2"><span className="size-2 rounded-[2px] bg-danger" />Refused</span>{num(hovered.denied)}</div>
          {pencil && <div className="num flex justify-between gap-4"><span className="flex items-center gap-1.5 text-fg-2"><span className="size-2 rounded-[2px] bg-warn" />Would refuse</span>{num(hovered.would_refuse)}</div>}
          <div className="num flex justify-between gap-4"><span className="text-fg-2">VPN found</span>{num(hovered.vpn_positive)}</div>
        </div>
      )}
    </figure>
  );
}

/** A column with a 4px rounded data end and a square baseline. */
function col(x: number, top: number, w: number, h: number, roundTop: boolean) {
  const r = roundTop ? Math.min(4, w / 2, h) : 0;
  return `M${x},${top + h}V${top + r}${r ? `Q${x},${top} ${x + r},${top}` : ""}H${x + w - r}${r ? `Q${x + w},${top} ${x + w},${top + r}` : ""}V${top + h}Z`;
}
