import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { syncRequest } from "@cg/protocol/examples";
import type { NetworkSignals } from "@cg/protocol";
import { ORIGIN, claim, install, login, sync, syncOk } from "./helpers.ts";
import { SIGNAL_ROWS_PER_DAY, publishSignals, recordSignals, windowCost, type PublishedSignals } from "../src/signals.ts";
import { DAY } from "../src/util.ts";

const window = (prefixes: Partial<NetworkSignals["prefixes"][number]>[]): NetworkSignals => ({
  overflow: 0,
  prefixes: prefixes.map((p) => ({ p: "198.51.100.0/24", logins: 1, accounts: 1, vpn: 0, denied: 0, banned: 0, allowed_by_rule: 0, ...p })),
});
/** A server linked to a network: only those contribute signals. */
const linked = async () => {
  const ins = await install();
  const { network_id } = await (await claim(await login(), ins.link_code!)).json<{ network_id: string }>();
  return { ins, network_id };
};
const rows = () => env.DB.prepare("SELECT * FROM network_signals ORDER BY prefix, source").all<Record<string, number | string>>().then((r) => r.results);

describe("network signals", () => {
  it("adds windows up per day, prefix and source, keeps the largest account count and never counts a retry twice", async () => {
    await env.DB.prepare("DELETE FROM network_signals").run();
    const { ins, network_id } = await linked();
    await syncOk(ins, { seq: 10, signals: window([{ logins: 4, accounts: 3, vpn: 1 }, { p: "2001:db8:1::/48", banned: 1 }]) });
    await syncOk(ins, { seq: 10, signals: window([{ logins: 4, accounts: 3, vpn: 1 }]) }); // retried body
    await syncOk(ins, { seq: 11, signals: window([{ logins: 2, accounts: 2, denied: 1 }]) });
    const stored = await rows();
    expect(stored).toHaveLength(2);
    expect(stored.find((r) => r.prefix === "198.51.100.0/24")).toMatchObject({ source: network_id, logins: 6, accounts: 3, vpn: 1, denied: 1 });
    expect(stored.find((r) => r.prefix === "2001:db8:1::/48")).toMatchObject({ banned: 1 });
  });

  it("stops storing signals for the day once they used their share of the free plan's row writes", async () => {
    await env.DB.batch([env.DB.prepare("DELETE FROM network_signals"), env.DB.prepare("DELETE FROM signal_budget")]);
    const { ins } = await linked(), today = Math.floor(Date.now() / DAY) * DAY;
    await env.DB.prepare("INSERT INTO signal_budget VALUES (?, ?)").bind(today, SIGNAL_ROWS_PER_DAY - windowCost(1)).run();
    await syncOk(ins, { seq: 20, signals: window([{}, { p: "203.0.113.0/24" }]) }); // costs 5, 3 left
    expect(await rows()).toHaveLength(0);
    await syncOk(ins, { seq: 21, signals: window([{}]) });
    expect(await rows()).toHaveLength(1);
    expect(await env.DB.prepare("SELECT rows FROM signal_budget WHERE day = ?").bind(today).first("rows")).toBe(SIGNAL_ROWS_PER_DAY);
  });

  it("ignores signals from a server that is not linked", async () => {
    await env.DB.prepare("DELETE FROM network_signals").run();
    const ins = await install();
    expect((await sync(ins, { seq: 30, signals: window([{ logins: 3, accounts: 2 }]) })).status).toBe(200);
    expect(await rows()).toHaveLength(0);
  });

  it("never lets concurrent windows reserve more than the day allows", async () => {
    const now = Date.now(), day = Math.floor(now / DAY) * DAY;
    for (const left of [windowCost(1), windowCost(1) + 1, 2 * windowCost(1) - 1]) {
      await env.DB.batch([env.DB.prepare("DELETE FROM network_signals"), env.DB.prepare("DELETE FROM signal_budget")]);
      await env.DB.prepare("INSERT INTO signal_budget VALUES (?, ?)").bind(day, SIGNAL_ROWS_PER_DAY - left).run();
      const results = await Promise.all(["fixture_a", "fixture_b", "fixture_c"].map((source) => recordSignals(env, source, window([{}]), now)));
      expect(results.filter(Boolean)).toHaveLength(1); // room for one window only
      expect(await env.DB.prepare("SELECT rows FROM signal_budget WHERE day = ?").bind(day).first<number>("rows")).toBeLessThanOrEqual(SIGNAL_ROWS_PER_DAY);
      expect(await rows()).toHaveLength(1);
    }
    // With room for both, both write.
    await env.DB.batch([env.DB.prepare("DELETE FROM network_signals"), env.DB.prepare("DELETE FROM signal_budget")]);
    await env.DB.prepare("INSERT INTO signal_budget VALUES (?, ?)").bind(day, SIGNAL_ROWS_PER_DAY - 2 * windowCost(1)).run();
    const both = await Promise.all(["fixture_a", "fixture_b"].map((source) => recordSignals(env, source, window([{}]), now)));
    expect(both).toEqual([true, true]);
    expect(await env.DB.prepare("SELECT rows FROM signal_budget WHERE day = ?").bind(day).first<number>("rows")).toBe(SIGNAL_ROWS_PER_DAY);
  });

  it("keeps a sync whose signals this version cannot read, and stores nothing from them", async () => {
    await env.DB.prepare("DELETE FROM network_signals").run();
    const ins = await install();
    const res = await sync(ins, {}, { body: JSON.stringify({ ...syncRequest, seq: 12, signals: { overflow: 0, prefixes: [{ p: "10.0.0.0/24", logins: 1 }] } }) });
    expect(res.status).toBe(200);
    expect(await rows()).toHaveLength(0);
  });

  it("publishes only prefixes several sources reported, aggregated, and drops rows older than a week", async () => {
    await env.DB.prepare("DELETE FROM network_signals").run();
    const now = Date.UTC(2026, 9, 25, 3, 17), today = Math.floor(now / DAY) * DAY;
    const insert = (day: number, prefix: string, source: string, accounts: number, extra = { vpn: 0, banned: 0, allowed_by_rule: 0 }) =>
      env.DB.prepare("INSERT INTO network_signals VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)")
        .bind(day, prefix, source, accounts * 2, accounts, extra.vpn, extra.banned, extra.allowed_by_rule).run();
    for (const source of ["net_a", "net_b", "ins_c"]) await insert(today, "198.51.100.0/24", source, 5, { vpn: 1, banned: 1, allowed_by_rule: 0 });
    await insert(today - DAY, "198.51.100.0/24", "net_a", 9); // the larger day of net_a counts
    for (const source of ["net_a", "net_b"]) await insert(today, "203.0.113.0/24", source, 50); // two sources only
    for (const source of ["net_a", "net_b", "net_c"]) await insert(today, "192.0.2.0/24", source, 1); // too few accounts
    await insert(today - 9 * DAY, "198.51.100.0/24", "net_z", 100); // older than a week
    const published = JSON.parse(await publishSignals(env, now)) as PublishedSignals;
    expect(published).toMatchObject({ as_of: "2026-10-25T03:17:00Z", window_days: 7, min_sources: 3, min_accounts: 10 });
    expect(published.prefixes).toEqual([{ p: "198.51.100.0/24", sources: 3, logins: 48, accounts: 19, vpn: 3, denied: 0, banned: 3, allowed_by_rule: 0 }]);
    expect((await rows()).some((r) => r.source === "net_z")).toBe(false);
    const res = await SELF.fetch(`${ORIGIN}/v1/intel/signals.json`);
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
    expect(await res.json()).toEqual(published);
  });
});
