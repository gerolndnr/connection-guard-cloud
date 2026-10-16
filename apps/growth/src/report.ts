// Turns bStats chart data into the morning growth report: per product the average of the last 24 hours, its change
// against 1, 7 and 30 days before, a 30-day sparkline and the share of servers. Pure functions, tested without network.
import { NOT_ON_BSTATS, PRODUCTS, bstatsPage, type Platform, type Product } from "./products";

export type Series = [number, number][]; // [timestamp ms, value], one point every 30 minutes
export type ProjectData = { id: number; servers: Series | null; players: Series | null };

const HOUR = 3_600_000, DAY = 24 * HOUR;

/** Mean of the points in (end - 24 h, end], or null when there are none. */
export function dayAverage(series: Series, end: number): number | null {
  const pts = series.filter(([ts]) => ts > end - DAY && ts <= end);
  return pts.length ? pts.reduce((s, [, v]) => s + v, 0) / pts.length : null;
}

/** The product's series: its projects' points added up per timestamp (projects without data are left out). */
export function sumSeries(list: (Series | null)[]): Series | null {
  const present = list.filter((s): s is Series => s !== null && s.length > 0);
  if (!present.length) return null;
  const sums = new Map<number, number>();
  for (const s of present) for (const [ts, v] of s) sums.set(ts, (sums.get(ts) ?? 0) + v);
  return [...sums.entries()].sort((a, b) => a[0] - b[0]);
}

export type Row = {
  product: Product; servers: number | null; d1: number | null; d7: number | null; d30: number | null; d7pct: number | null;
  players: number | null; spark: string; platforms: { platform: Platform; servers: number | null; url: string }[]; missing: number;
};

const SPARK = "▁▂▃▄▅▆▇█";
/** One character per day for the last 30 days, scaled between the series' own min and max. */
export function sparkline(series: Series, end: number): string {
  const days = Array.from({ length: 30 }, (_, i) => dayAverage(series, end - (29 - i) * DAY));
  const known = days.filter((v): v is number => v !== null);
  if (!known.length) return "";
  const lo = Math.min(...known), hi = Math.max(...known);
  return days.map((v) => v === null ? " " : SPARK[hi === lo ? 3 : Math.round(((v - lo) / (hi - lo)) * (SPARK.length - 1))]).join("");
}

const diff = (now: number | null, then: number | null) => now === null || then === null ? null : now - then;

export function buildRows(data: ProjectData[], end: number): Row[] {
  const byId = new Map(data.map((d) => [d.id, d]));
  return PRODUCTS.map((product) => {
    const parts = product.projects.map((p) => byId.get(p.id));
    const servers = sumSeries(parts.map((d) => d?.servers ?? null));
    const players = sumSeries(parts.map((d) => d?.players ?? null));
    const now = servers ? dayAverage(servers, end) : null;
    const week = servers ? dayAverage(servers, end - 7 * DAY) : null;
    return {
      product,
      servers: now,
      d1: servers ? diff(now, dayAverage(servers, end - DAY)) : null,
      d7: diff(now, week),
      d30: servers ? diff(now, dayAverage(servers, end - 30 * DAY)) : null,
      d7pct: now !== null && week ? (now - week) / week : null,
      players: players ? dayAverage(players, end) : null,
      spark: servers ? sparkline(servers, end) : "",
      platforms: product.projects.map((p) => {
        const s = byId.get(p.id)?.servers;
        return { platform: p.platform, servers: s ? dayAverage(s, end) : null, url: bstatsPage(p) };
      }),
      missing: parts.filter((d) => !d || d.servers === null).length,
    };
  }).sort((a, b) => (b.servers ?? -1) - (a.servers ?? -1));
}

// ------------------------------------------------------------------ rendering
const n = (v: number | null) => v === null ? "–" : Math.round(v).toLocaleString("en-US");
const signed = (v: number | null) => {
  if (v === null) return "–";
  const r = Math.round(v); // sign after rounding: −0.3 is "±0", not "−0"
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toLocaleString("en-US")}`;
};
const pct = (v: number | null) => v === null ? "" : ` (${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v * 100).toFixed(1)} %)`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const PLATFORM: Record<Platform, string> = { bukkit: "Spigot/Paper", bungeecord: "BungeeCord", velocity: "Velocity" };

export type Report = { subject: string; text: string; html: string };

export function render(rows: Row[], end: number): Report {
  const date = new Date(end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const market = rows.filter((r) => !r.product.legacy);
  const total = market.reduce((s, r) => s + (r.servers ?? 0), 0);
  const cg = rows.find((r) => r.product.key === "connection-guard")!;
  const share = (r: Row) => total && r.servers !== null ? `${((r.servers / total) * 100).toFixed(1)} %` : "–";
  const growing = market.filter((r) => r.d7pct !== null && (r.servers ?? 0) >= 5).sort((a, b) => b.d7pct! - a.d7pct!)[0];
  const subject = `Growth ${date}: Connection Guard ${n(cg.servers)} servers (${signed(cg.d7)} in 7 days)`;

  const headline = [
    `Connection Guard: ${n(cg.servers)} servers, ${signed(cg.d1)} in 1 day, ${signed(cg.d7)}${pct(cg.d7pct)} in 7 days, ${signed(cg.d30)} in 30 days. Share of the benchmark products: ${share(cg)}.`,
    growing ? `Fastest growing over 7 days: ${growing.product.name}${pct(growing.d7pct)}.` : "",
  ].filter(Boolean);
  const missing = rows.filter((r) => r.missing > 0).map((r) => `${r.product.name} (${r.missing} of ${r.product.projects.length} projects unavailable)`);

  const notes = [
    "Servers and players: average of the last 24 hours, compared with the 24 hours ending 1, 7 and 30 days earlier, so the time of day does not matter.",
    "A product's number is the sum of its bStats projects (Spigot/Paper, BungeeCord, Velocity). A network that runs it on its proxy and its game servers counts more than once, as bStats counts installs, not networks.",
    "Only servers that leave bStats on report; the real numbers are higher for every product.",
    `In the benchmark but not on bStats: ${NOT_ON_BSTATS.join(", ")}. The predecessor LNDNR Anti-VPN is not part of the share.`,
    "Source: bStats public API (bstats.org/api/v1), read by the growth worker in connection-guard-cloud.",
  ];

  // plain text
  const pad = (s: string, w: number) => s.length >= w ? s : s + " ".repeat(w - s.length);
  const lpad = (s: string, w: number) => s.length >= w ? s : " ".repeat(w - s.length) + s;
  const text = [
    ...headline, "",
    `${pad("Product", 30)}${lpad("Servers", 8)}${lpad("1 d", 7)}${lpad("7 d", 7)}${lpad("30 d", 7)}${lpad("Share", 8)}${lpad("Players", 9)}  30 days`,
    ...rows.map((r) => `${pad(r.product.name, 30)}${lpad(n(r.servers), 8)}${lpad(signed(r.d1), 7)}${lpad(signed(r.d7), 7)}${lpad(signed(r.d30), 7)}${lpad(r.product.legacy ? "" : share(r), 8)}${lpad(n(r.players), 9)}  ${r.spark}`),
    "",
    `Connection Guard by platform: ${cg.platforms.map((p) => `${PLATFORM[p.platform]} ${n(p.servers)}`).join(", ")}`,
    ...(missing.length ? ["", `Incomplete today: ${missing.join("; ")}.`] : []),
    "", ...notes.map((x) => `- ${x}`),
  ].join("\n");

  // HTML: inline styles only, a plain table that every mail client renders
  const cell = "padding:6px 10px;border-bottom:1px solid #e5e5e5;text-align:right;white-space:nowrap";
  const delta = (v: number | null) => `<span style="color:${v === null || Math.round(v) === 0 ? "#737373" : v > 0 ? "#047857" : "#b91c1c"}">${signed(v)}</span>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#171717">
<div style="max-width:760px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:24px">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#10b981;font-weight:600">Growth · ${esc(date)}</div>
<h1 style="font-size:22px;margin:6px 0 4px">Connection Guard: ${n(cg.servers)} servers <span style="font-weight:500">${delta(cg.d7)} in 7 days</span></h1>
${headline.map((h) => `<p style="margin:6px 0;font-size:14px;color:#404040">${esc(h)}</p>`).join("")}
<table style="border-collapse:collapse;width:100%;margin-top:16px;font-size:14px">
<tr style="color:#737373;font-size:12px"><th style="${cell};text-align:left">Product</th><th style="${cell}">Servers</th><th style="${cell}">1 d</th><th style="${cell}">7 d</th><th style="${cell}">30 d</th><th style="${cell}">Share</th><th style="${cell}">Players</th><th style="${cell};text-align:left">30 days</th></tr>
${rows.map((r) => `<tr style="${r.product.key === "connection-guard" ? "background:#ecfdf5;font-weight:600" : r.product.legacy ? "color:#737373" : ""}">
<td style="${cell};text-align:left"><a href="${r.platforms[0]!.url}" style="color:inherit">${esc(r.product.name)}</a></td><td style="${cell}">${n(r.servers)}</td><td style="${cell}">${delta(r.d1)}</td><td style="${cell}">${delta(r.d7)}</td><td style="${cell}">${delta(r.d30)}</td><td style="${cell}">${r.product.legacy ? "" : share(r)}</td><td style="${cell}">${n(r.players)}</td><td style="${cell};text-align:left;font-family:Menlo,Consolas,monospace;color:#10b981;letter-spacing:-1px">${esc(r.spark)}</td></tr>`).join("\n")}
</table>
<p style="font-size:13px;color:#404040;margin:14px 0 0">Connection Guard by platform: ${cg.platforms.map((p) => `<a href="${p.url}" style="color:inherit">${PLATFORM[p.platform]}</a> ${n(p.servers)}`).join(" · ")}</p>
${missing.length ? `<p style="font-size:13px;color:#b45309;margin:10px 0 0">Incomplete today: ${esc(missing.join("; "))}.</p>` : ""}
<ul style="font-size:12px;color:#737373;margin:18px 0 0;padding-left:18px">${notes.map((x) => `<li style="margin:4px 0">${esc(x)}</li>`).join("")}</ul>
</div></body></html>`;
  return { subject, text, html };
}
