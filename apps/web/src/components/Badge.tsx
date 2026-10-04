import { Ban, Check, Eye, TriangleAlert } from "lucide-react";
import type { Verdict } from "../format.ts";

const conf: Record<Verdict, { label: string; cls: string; Icon: typeof Check }> = {
  admitted: { label: "Admitted", cls: "badge-admitted", Icon: Check },
  refused: { label: "Refused", cls: "badge-refused", Icon: Ban },
  "would-refuse": { label: "Would refuse", cls: "badge-would", Icon: Eye },
  error: { label: "Error", cls: "badge-error", Icon: TriangleAlert },
};

/** Verdict pill: color plus icon plus word, never color alone. */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { label, cls, Icon } = conf[verdict];
  return <span className={`badge ${cls}`}><Icon aria-hidden className="size-3" strokeWidth={2.5} />{label}</span>;
}

export function StatusDot({ tone }: { tone: "ok" | "warn" | "danger" | "idle" }) {
  const color = { ok: "text-accent", warn: "text-warn", danger: "text-danger", idle: "text-fg-3" }[tone];
  return (
    <span aria-hidden className={`relative inline-flex size-2 ${color}`}>
      {tone === "ok" && <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-40 motion-reduce:hidden" />}
      <span className="relative size-2 rounded-full bg-current" />
    </span>
  );
}
