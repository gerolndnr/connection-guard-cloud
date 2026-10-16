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

  // HTML: one fluid column (max 600 px) of table rows with inline styles, so it holds in every client without media
  // queries. The <style> block only refines: tighter padding on phones, dark mode where the client supports it.
  const K = { bg: "#f5f5f5", card: "#ffffff", line: "#e5e5e5", fg: "#171717", fg2: "#525252", fg3: "#737373", acc: "#10b981", up: "#047857", down: "#b91c1c", own: "#ecfdf5", chip: "#f5f5f5" };
  const tone = (v: number | null) => v === null || Math.round(v) === 0 ? ["fg3", K.fg3] : v > 0 ? ["up", K.up] : ["down", K.down];
  const num = (v: number | null, size: number) => { const [cls, col] = tone(v); return `<span class="${cls}" style="color:${col};font-size:${size}px;font-weight:700">${signed(v)}</span>`; };
  const chip = (label: string, v: number | null, extra = "") =>
    `<span class="chip fg2" style="display:inline-block;margin:8px 6px 0 0;padding:4px 10px;border-radius:999px;background:${K.chip};color:${K.fg2};font-size:13px;line-height:18px;white-space:nowrap">${label} ${num(v, 13)}${extra}</span>`;
  const sharePct = (r: Row) => total && r.servers !== null ? (r.servers / total) * 100 : 0;
  const tile = (label: string, v: number | null, sub = "") =>
    `<td width="33%" valign="top" style="padding:12px 8px;text-align:center;border:1px solid ${K.line};border-radius:12px" class="line">
<div class="fg3" style="font-size:12px;color:${K.fg3};text-transform:uppercase;letter-spacing:.06em">${label}</div>
<div class="kpi" style="margin-top:4px;line-height:1.1">${num(v, 24)}</div>${sub ? `<div class="fg3" style="font-size:12px;color:${K.fg3};margin-top:2px">${sub}</div>` : ""}</td>`;
  const card = (r: Row) => {
    const own = r.product.key === "connection-guard";
    const meta = [r.product.legacy ? "predecessor, not in the share" : `share ${share(r)}`, `${n(r.players)} players`].join(" · ");
    return `<tr><td class="px line${own ? " own" : ""}" style="padding:16px 24px;border-top:1px solid ${K.line};${own ? `background:${K.own};` : ""}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top"><a href="${r.platforms[0]!.url}" class="fg" style="color:${r.product.legacy ? K.fg3 : K.fg};text-decoration:none;font-size:16px;font-weight:${own ? 700 : 600}">${esc(r.product.name)}</a>
<div class="fg3" style="font-size:12px;color:${K.fg3};margin-top:2px">${esc(meta)}</div></td>
<td valign="top" align="right" style="white-space:nowrap;padding-left:12px"><div class="fg" style="font-size:22px;font-weight:700;color:${K.fg};line-height:1.1">${n(r.servers)}</div>
<div class="fg3" style="font-size:12px;color:${K.fg3}">servers</div></td></tr></table>
<div>${chip("1 d", r.d1)}${chip("7 d", r.d7, r.d7pct === null ? "" : `<span class="fg3" style="color:${K.fg3}">${pct(r.d7pct)}</span>`)}${chip("30 d", r.d30)}</div>
${r.product.legacy ? "" : `<div class="track" style="margin-top:12px;height:4px;border-radius:2px;background:${K.line};font-size:0;line-height:0"><div style="width:${sharePct(r).toFixed(1)}%;height:4px;border-radius:2px;background:${K.acc}"></div></div>`}
<div style="margin-top:8px;font-family:Menlo,Consolas,'Courier New',monospace;font-size:15px;line-height:18px;color:${K.acc};white-space:nowrap;overflow:hidden">${esc(r.spark)} <span class="fg3" style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;color:${K.fg3}">30 days</span></div>
</td></tr>`;
  };
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(subject)}</title>
<style>
@media (max-width:520px){.outer{padding:0!important}.box{border-radius:0!important;border-left:0!important;border-right:0!important}.px{padding-left:16px!important;padding-right:16px!important}.h1{font-size:22px!important}}
@media (prefers-color-scheme:dark){body,.outer{background:#0a0a0a!important}.box{background:#141414!important;border-color:#262626!important}.line{border-color:#262626!important}
.fg{color:#ededed!important}.fg2{color:#a1a1a1!important}.fg3{color:#8a8a8a!important}.own{background:#0d2a1f!important}.chip{background:#1f1f1f!important}.track{background:#262626!important}
.up{color:#34d399!important}.down{color:#f87171!important}}
</style></head>
<body style="margin:0;padding:0;background:${K.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(headline.join(" "))}</div>
<table role="presentation" class="outer" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${K.bg};padding:24px 12px"><tr><td align="center">
<table role="presentation" class="box" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${K.card};border:1px solid ${K.line};border-radius:16px;font-family:${font};color:${K.fg}">
<tr><td class="px" style="padding:24px 24px 8px">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${K.acc};font-weight:700">Growth · ${esc(date)}</div>
<div class="h1 fg" style="font-size:26px;font-weight:800;letter-spacing:-.02em;color:${K.fg};margin-top:6px;line-height:1.2">Connection Guard: ${n(cg.servers)} servers</div>
<div class="fg2" style="font-size:14px;color:${K.fg2};margin-top:4px">Share of the benchmark products: <b>${share(cg)}</b> · ${n(cg.players)} players</div>
</td></tr>
<tr><td class="px" style="padding:12px 24px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="6" border="0" style="border-collapse:separate"><tr>
${tile("1 day", cg.d1)}${tile("7 days", cg.d7, cg.d7pct === null ? "" : pct(cg.d7pct).trim().slice(1, -1))}${tile("30 days", cg.d30)}
</tr></table>
${growing ? `<div class="fg2" style="font-size:14px;color:${K.fg2};margin-top:12px">Fastest growing over 7 days: <b>${esc(growing.product.name)}</b>${esc(pct(growing.d7pct))}</div>` : ""}
<div class="fg2" style="font-size:13px;color:${K.fg2};margin-top:8px">By platform: ${cg.platforms.map((p) => `<a href="${p.url}" class="fg2" style="color:${K.fg2}">${PLATFORM[p.platform]}</a>&nbsp;${n(p.servers)}`).join(" · ")}</div>
</td></tr>
${rows.map(card).join("\n")}
${missing.length ? `<tr><td class="px" style="padding:12px 24px;border-top:1px solid ${K.line};font-size:13px;color:#b45309">Incomplete today: ${esc(missing.join("; "))}.</td></tr>` : ""}
<tr><td class="px line" style="padding:16px 24px 22px;border-top:1px solid ${K.line}">
${notes.map((x) => `<div class="fg3" style="font-size:12px;line-height:1.5;color:${K.fg3};margin-top:6px">${esc(x)}</div>`).join("")}
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
