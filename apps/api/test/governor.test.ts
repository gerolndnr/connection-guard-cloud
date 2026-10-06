import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { SYNC_BUDGET_PER_DAY, computeFloor, nextSyncIn, recomputeGovernor, resetGovernorCache } from "../src/governor.ts";
import { runMaintenance } from "../src/cron.ts";
import { install } from "./helpers.ts";

describe("free-tier governor", () => {
  it("keeps the worst case under the daily sync budget", () => {
    for (const n of [1, 50, 300, 1000, 5000]) {
      const floor = computeFloor(n);
      const worstCase = (n * 86_400) / floor;
      expect(worstCase <= SYNC_BUDGET_PER_DAY || floor === 3600).toBe(true);
    }
    expect(computeFloor(10)).toBe(60);
  });

  it("lets idle installs heartbeat less often", () => {
    const state = { floor: 60, activeInstalls: 1, computedAt: 0 };
    expect(nextSyncIn(state, { busy: true, live: false })).toBe(60);
    expect(nextSyncIn(state, { busy: false, live: false })).toBe(300);
    expect(nextSyncIn(state, { busy: false, live: true })).toBe(5);
    expect(nextSyncIn(state, { busy: true, live: false, fast: true, hot: true })).toBe(5);
  });

  it("recomputes from active installs and stores the result in KV", async () => {
    await install();
    resetGovernorCache();
    const state = await recomputeGovernor(env);
    expect(state.activeInstalls).toBeGreaterThan(0);
    expect(await env.PUBLIC.get("governor:v1", "json")).toMatchObject({ floor: state.floor });
  });
});

describe("retention", () => {
  it("deletes stale unclaimed installs", async () => {
    const ins = await install();
    await env.DB.prepare("UPDATE installs SET last_seen_at = ? WHERE id = ?").bind(Date.now() - 31 * 86_400_000, ins.install_id).run();
    await runMaintenance(env);
    expect(await env.DB.prepare("SELECT id FROM installs WHERE id = ?").bind(ins.install_id).first()).toBeNull();
  });
});
