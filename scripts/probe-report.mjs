#!/usr/bin/env node
// Which connection-probe traits are worth building? Reads the totals from D1 through wrangler (your own login) and
// prints, per signal value, how often it occurred on VPN, hosting, clean and unlabelled logins, its lift (rate on VPN
// logins / rate on clean logins) and how many clean or unlabelled logins it would add if it were right.
//
//   node scripts/probe-report.mjs [--local] [--min 20] [--json report.json]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const minimum = Number(option("--min", "20"));

// The same query as apps/api/src/probe.ts PROBE_REPORT_SQL, which the API tests run.
const SQL = `SELECT signal, value, label, SUM(n) AS n, MAX(sources) AS sources FROM (
  SELECT signal, value, label, n, sources FROM probe_daily
  UNION ALL
  SELECT json_extract(e.value, '$.s'), json_extract(e.value, '$.v'), json_extract(e.value, '$.l'), json_extract(e.value, '$.n'), 1
  FROM probe_windows w, json_each(w.counts) e
) GROUP BY signal, value, label ORDER BY signal, value, label`;

const api = fileURLToPath(new URL("../apps/api/", import.meta.url));
const out = execFileSync("npx", ["wrangler", "d1", "execute", "cg", args.includes("--local") ? "--local" : "--remote", "--json", "--command", SQL.replace(/\s+/g, " ")],
  { cwd: api, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const rows = JSON.parse(out)[0]?.results ?? [];
const LABELS = ["vpn", "hosting", "clean", "unlabelled"];
const totals = Object.fromEntries(LABELS.map((l) => [l, Number(rows.find((r) => r.signal === "all" && r.label === l)?.n ?? 0)]));
const table = new Map();
for (const r of rows) {
  if (r.signal === "all") continue;
  const key = `${r.signal}\u0000${r.value}`;
  const row = table.get(key) ?? { signal: r.signal, value: r.value, sources: 0, ...Object.fromEntries(LABELS.map((l) => [l, 0])) };
  row[r.label] += Number(r.n); row.sources = Math.max(row.sources, Number(r.sources));
  table.set(key, row);
}
const rate = (n, total) => (total ? n / total : null);
const report = [...table.values()].map((row) => {
  const vpn = rate(row.vpn, totals.vpn), clean = rate(row.clean, totals.clean);
  const lift = vpn === null || clean === null ? null : clean === 0 ? (vpn > 0 ? Infinity : null) : vpn / clean;
  return { ...row, vpn_rate: vpn, clean_rate: clean, lift, would_add: row.clean + row.unlabelled, enough: row.vpn + row.clean >= minimum };
}).sort((a, b) => a.signal.localeCompare(b.signal) || (b.lift ?? -1) - (a.lift ?? -1));

const pct = (x) => (x === null ? "-" : `${(100 * x).toFixed(1)}%`);
console.log(`logins: ${LABELS.map((l) => `${l}=${totals[l]}`).join(", ")}`);
console.log(`${"signal".padEnd(28)} ${"value".padEnd(12)} ${"vpn".padStart(7)} ${"host".padStart(7)} ${"clean".padStart(7)} ${"unlab".padStart(7)} ${"vpn%".padStart(7)} ${"clean%".padStart(7)} ${"lift".padStart(6)} nets  would add`);
let last = "";
for (const r of report) {
  if (r.signal !== last) { console.log(); last = r.signal; }
  const lift = r.lift === null ? "-" : r.lift === Infinity ? "inf" : r.lift.toFixed(1);
  console.log(`${r.signal.padEnd(28)} ${r.value.slice(0, 12).padEnd(12)} ${String(r.vpn).padStart(7)} ${String(r.hosting).padStart(7)} ${String(r.clean).padStart(7)} `
    + `${String(r.unlabelled).padStart(7)} ${pct(r.vpn_rate).padStart(7)} ${pct(r.clean_rate).padStart(7)} ${lift.padStart(6)} ${String(r.sources).padStart(4)}  ${r.would_add}${r.enough ? "" : "  (few)"}`);
}
const json = option("--json");
if (json) writeFileSync(json, JSON.stringify({ totals, rows: report.map((r) => ({ ...r, lift: r.lift === Infinity ? null : r.lift })) }, null, 1));
