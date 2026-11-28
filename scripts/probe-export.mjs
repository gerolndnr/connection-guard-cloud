#!/usr/bin/env node
// Exports the connection-probe counts as one row per day, network, schema, signal, value and label, for analysis in
// pandas, DuckDB or R (docs/PROBE_DATA.md). Reads D1 through wrangler with your own login, like probe-report.mjs.
//
//   node scripts/probe-export.mjs --out probe.csv [--local] [--jsonl] [--keep-sources]
//
// Networks are replaced by pseudonyms (net_ and 8 hex digits) under a random key made for this export, so files from
// one export can be grouped by network but not linked to a network or to another export. --keep-sources keeps the IDs.
// Joint rows get one column per coarse trait, decoded for the schemas this script knows.
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

// The same query as apps/api/src/probe.ts PROBE_ROWS_SQL.
const SQL = `SELECT day, source, schema, signal, value, label, n FROM probe_daily
  UNION ALL
  SELECT w.day, w.source, w.schema, json_extract(e.value, '$.s'), json_extract(e.value, '$.v'), json_extract(e.value, '$.l'), json_extract(e.value, '$.n')
  FROM probe_windows w, json_each(w.counts) e`;

/** Joint codes, one character per trait (plugin ProbeCounts.joint). Unknown schemas are exported undecoded. */
export const JOINT = {
  1: [
    ["mss", { s: "standard", a: "access", t: "tunnel", u: null }],
    ["ping_gap", { 0: "<20", 1: "<40", 2: "<80", 3: ">=80", u: null }],
    ["session", { m: "match", x: "mismatch", u: null }],
    ["brand", { v: "vanilla", m: "modded", b: "geyser", o: "other", u: null }],
    ["locale_mismatch", { y: "true", n: "false", u: null }],
    ["new_account", { y: "true", n: "false", u: null }],
    ["login", { j: "joined", e: "left_early", n: "never_joined" }],
  ],
};
const TRAITS = [...new Set(Object.values(JOINT).flat().map(([name]) => name))];

export function decode(schema, code) {
  const layout = JOINT[schema];
  if (!layout || code.length !== layout.length) return {};
  return Object.fromEntries(layout.map(([name, values], i) => [name, values[code[i]] ?? null]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = option("--out");
  if (!out) throw new Error("--out <file> is required");
  const api = fileURLToPath(new URL("../apps/api/", import.meta.url));
  const raw = execFileSync("npx", ["wrangler", "d1", "execute", "cg", args.includes("--local") ? "--local" : "--remote", "--json", "--command", SQL.replace(/\s+/g, " ")],
    { cwd: api, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 30 });
  const key = randomBytes(32);
  const alias = (source) => (args.includes("--keep-sources") ? source : `net_${createHmac("sha256", key).update(source).digest("hex").slice(0, 8)}`);
  const rows = (JSON.parse(raw)[0]?.results ?? []).map((r) => {
    const row = { day: new Date(Number(r.day)).toISOString().slice(0, 10), source: alias(r.source), schema: Number(r.schema),
      signal: r.signal, value: r.value, label: r.label, n: Number(r.n) };
    const traits = r.signal === "joint" && r.value !== "_suppressed" ? decode(row.schema, r.value) : {};
    for (const t of TRAITS) row[`joint_${t}`] = traits[t] ?? null;
    return row;
  });
  if (args.includes("--jsonl")) {
    writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  } else {
    const columns = Object.keys(rows[0] ?? { day: 0, source: 0, schema: 0, signal: 0, value: 0, label: 0, n: 0 });
    const cell = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    writeFileSync(out, [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n");
  }
  const schemas = [...new Set(rows.map((r) => r.schema))].sort();
  console.error(`${rows.length} rows, schemas ${schemas.join(", ") || "-"}, ${new Set(rows.map((r) => r.source)).size} networks -> ${out}`);
}
