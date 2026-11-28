import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { syncRequest, syncRequestWithProbe } from "@cg/protocol/examples";
import type { ProbeCounts } from "@cg/protocol";
import { claim, install, login, sync, syncOk } from "./helpers.ts";
import { PROBE_REPORT_SQL, PROBE_RETENTION, PROBE_WINDOWS_PER_DAY, recordProbe, rollUpProbe } from "../src/probe.ts";
import { DAY } from "../src/util.ts";

const probe = (counts: ProbeCounts["counts"] = syncRequestWithProbe.probe!.counts, schema = 1): ProbeCounts => ({ schema, logins: 6, overflow: 0, counts });
const linked = async () => {
  const ins = await install();
  const { network_id } = await (await claim(await login(), ins.link_code!)).json<{ network_id: string }>();
  return { ins, network_id };
};
const windows = () => env.DB.prepare("SELECT * FROM probe_windows").all<Record<string, number | string>>().then((r) => r.results);
const clear = () => env.DB.batch([env.DB.prepare("DELETE FROM probe_windows"), env.DB.prepare("DELETE FROM probe_daily")]);

describe("connection-probe counts", () => {
  it("stores a linked server's window once, never a retry twice, and nothing from an unlinked server", async () => {
    await clear();
    const { ins, network_id } = await linked();
    await syncOk(ins, { seq: 10, probe: probe() });
    await syncOk(ins, { seq: 10, probe: probe() }); // retried body
    const stored = await windows();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ source: network_id, schema: 1, logins: 6 });
    expect(JSON.parse(String(stored[0]!.counts))).toEqual(syncRequestWithProbe.probe!.counts);
    const unlinked = await install();
    expect((await sync(unlinked, { seq: 11, probe: probe() })).status).toBe(200);
    expect(await windows()).toHaveLength(1);
  });

  it("keeps a sync whose probe counts this version cannot read, and stores nothing from them", async () => {
    await clear();
    const { ins } = await linked();
    const res = await sync(ins, {}, { body: JSON.stringify({ ...syncRequest, seq: 12, probe: { logins: 2, overflow: 0, counts: [] } }) });
    expect(res.status).toBe(200);
    expect(await windows()).toHaveLength(0);
  });

  it("stops at the day's window limit, even for concurrent windows", async () => {
    await clear();
    const now = Date.now(), day = Math.floor(now / DAY) * DAY;
    const filler = Array.from({ length: PROBE_WINDOWS_PER_DAY - 1 }, (_, i) =>
      env.DB.prepare("INSERT INTO probe_windows VALUES (?, ?, ?, 1, 5, '[]')").bind(day, "net_fill", i));
    for (let i = 0; i < filler.length; i += 500) await env.DB.batch(filler.slice(i, i + 500));
    const results = await Promise.all(["net_a", "net_b", "net_c"].map((source) => recordProbe(env, source, probe(), now)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM probe_windows WHERE day = ?").bind(day).first<number>("n"))).toBe(PROBE_WINDOWS_PER_DAY);
    await clear();
  });

  it("rolls past days up into daily totals per network, schema, signal value and label, and reports them with today's windows", async () => {
    await clear();
    const now = Date.UTC(2026, 9, 25, 3, 17), today = Math.floor(now / DAY) * DAY;
    const wg = (n: number) => [{ s: "mss_class", v: "wireguard", l: "vpn" as const, n }, { s: "all", v: "all", l: "vpn" as const, n }];
    await recordProbe(env, "net_a", probe(wg(3)), today - DAY + 1000);
    await recordProbe(env, "net_b", probe(wg(2)), today - DAY + 2000);
    await recordProbe(env, "net_a", probe(wg(1)), today - 2 * DAY);
    await recordProbe(env, "net_a", probe(wg(7)), today + 1000); // today: stays raw
    await recordProbe(env, "net_c", probe(wg(50), 2), today - DAY + 3000); // other definitions: never mixed in
    await env.DB.prepare("INSERT INTO probe_daily VALUES (?, 'net_old', 1, 'mss_class', 'wireguard', 'vpn', 99)").bind(today - PROBE_RETENTION - DAY).run();
    await rollUpProbe(env, now);
    const daily = (await env.DB.prepare("SELECT day, source, schema, value, n FROM probe_daily WHERE signal = 'mss_class' ORDER BY day, source").all()).results;
    expect(daily).toEqual([
      { day: today - 2 * DAY, source: "net_a", schema: 1, value: "wireguard", n: 1 },
      { day: today - DAY, source: "net_a", schema: 1, value: "wireguard", n: 3 },
      { day: today - DAY, source: "net_b", schema: 1, value: "wireguard", n: 2 },
      { day: today - DAY, source: "net_c", schema: 2, value: "wireguard", n: 50 },
    ]);
    expect(await windows()).toHaveLength(1); // today's window waits for tomorrow
    const report = (await env.DB.prepare(PROBE_REPORT_SQL).bind(1).all()).results;
    expect(report).toContainEqual({ signal: "mss_class", value: "wireguard", label: "vpn", n: 13, sources: 2 });
    expect((await env.DB.prepare(PROBE_REPORT_SQL).bind(2).all()).results).toContainEqual({ signal: "mss_class", value: "wireguard", label: "vpn", n: 50, sources: 1 });
    await rollUpProbe(env, now); // a second run adds nothing
    expect((await env.DB.prepare(PROBE_REPORT_SQL).bind(1).all()).results).toContainEqual({ signal: "mss_class", value: "wireguard", label: "vpn", n: 13, sources: 2 });
  });
});
