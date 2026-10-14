import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { errorReport, syncRequest } from "@cg/protocol/examples";
import { analyticsPayload } from "../src/analytics.ts";
import { exceptionEvents, isNetworkFailure, networkFailureRows } from "../src/plugin.ts";
import { networkFailureSummaries } from "../src/cron.ts";
import { api, claim, install, login, syncOk } from "./helpers.ts";

type ErrorView = { fingerprint: string; type: string; context: string; top_frame: string; count: number; plugin_version: string };

describe("plugin error reports", () => {
  it("stores linked servers' reports, adds up counts and never counts a retried sync twice", async () => {
    const ins = await install();
    const cookie = await login("Owner");
    const { network_id } = await (await claim(cookie, ins.link_code!)).json<{ network_id: string }>();
    // Recent timestamps: the dashboard shows the last 7 days, and the example report is from 4 October 2026.
    const report = { ...errorReport, first_at: Date.now() - 120_000, last_at: Date.now() - 60_000 };
    await syncOk(ins, { seq: 1, plugin_version: "0.5.2", errors: [report] });
    await syncOk(ins, { seq: 1, plugin_version: "0.5.2", errors: [report] }); // retry of the same sync
    await syncOk(ins, { seq: 2, plugin_version: "0.5.2", errors: [{ ...report, count: 3, last_at: report.last_at + 1000 }] });

    const view = await (await api(cookie, `/networks/${network_id}`)).json<{ installs: { id: string; errors: ErrorView[] }[] }>();
    const errors = view.installs.find((i) => i.id === ins.install_id)!.errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ fingerprint: errorReport.fingerprint, type: "java.lang.IllegalStateException", context: "LOOKUP",
      top_frame: "IpQueryVpnProvider.parse:88", count: 40, plugin_version: "0.5.2" });
  });

  it("accepts reports from unlinked servers without storing them, and syncs without reports as before", async () => {
    const ins = await install();
    expect((await syncOk(ins, { seq: 1, errors: [errorReport] })).next_sync_in).toBeGreaterThan(0);
    const rows = await env.DB.prepare("SELECT count(*) AS n FROM install_errors WHERE install_id = ?").bind(ins.install_id).first<{ n: number }>();
    expect(rows!.n).toBe(0);
    const { errors: _none, ...old } = { ...syncRequest, errors: undefined };
    expect((await syncOk(ins, { ...old, seq: 2 })).next_sync_in).toBeGreaterThan(0);
  });

  it("forwards each report to error tracking without a person and without player data", () => {
    const events = exceptionEvents({ id: "ins_abc", network_id: null, platform: "BUKKIT", java_version: "21.0.4" },
      { plugin_version: "0.5.2", errors: [errorReport] });
    const [e] = analyticsPayload({ ...env, POSTHOG_KEY: "phc_test" }, events, 0).batch;
    expect(e!.event).toBe("$exception");
    expect(e!.properties).toMatchObject({
      distinct_id: "ins_abc", $process_person_profile: false, $exception_fingerprint: `cg-${errorReport.fingerprint}`,
      context: "LOOKUP", count: 37, java_major: 21, linked: false,
    });
    const frames = ((e!.properties as Record<string, unknown>).$exception_list as { stacktrace: { frames: { function: string; lineno: number; in_app: boolean }[] } }[])[0]!.stacktrace.frames;
    expect(frames[0]).toMatchObject({ function: "IpQueryVpnProvider.parse", lineno: 88, in_app: true });
  });

  it("keeps network failures out of error tracking and counts them per day and service", async () => {
    const timeout = { ...errorReport, type: "java.io.InterruptedIOException", cause_type: "java.io.IOException", context: "LOOKUP" as const,
      frames: [
        { class: "com.github.gerolndnr.connectionguard.libs.okhttp3.internal.connection.RealCall", method: "timeoutExit", line: 398 },
        { class: "com.github.gerolndnr.connectionguard.core.http.ProviderHttp", method: "readText", line: 56 },
        { class: "com.github.gerolndnr.connectionguard.core.vpn.ZowiVpnProvider", method: "lambda$getVpnResult$1", line: 24 },
      ] };
    const dns = { ...errorReport, fingerprint: "0123456789abcdef", type: "java.net.UnknownHostException", cause_type: null, context: "SYNC" as const };
    const events = exceptionEvents({ id: "ins_abc", network_id: "net_1", platform: "BUKKIT", java_version: "21.0.4" },
      { plugin_version: "0.6.1", errors: [timeout, dns, errorReport] });
    expect(events.map((e) => e.event)).toEqual(["$exception"]); // a bug that merely saw a timeout still goes to error tracking
    const now = Date.UTC(2026, 9, 14, 12);
    expect(networkFailureRows({ errors: [timeout, timeout, dns] }, now)).toEqual(expect.arrayContaining([
      { day: Date.UTC(2026, 9, 14), source: "ZowiVpnProvider", type: "java.io.InterruptedIOException", count: 74 },
      expect.objectContaining({ type: "java.net.UnknownHostException", count: 37 }),
    ]));

    // Two servers report the same failure; the next day's report sends one summary and clears the rows.
    const a = await install(), b = await install();
    await syncOk(a, { seq: 1, plugin_version: "0.6.1", errors: [timeout] });
    await syncOk(b, { seq: 1, plugin_version: "0.6.1", errors: [timeout, dns] });
    const [summary, ...rest] = await networkFailureSummaries(env, Date.now() + 86_400_000);
    expect(rest).toHaveLength(0);
    expect(summary).toMatchObject({ event: "network_failures_daily", person: false,
      properties: { total: 111, reports: 3, by_source: { ZowiVpnProvider: 74 } } });
    const left = await env.DB.prepare("SELECT count(*) AS n FROM network_failures").first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it("treats only network failures in lookups and syncs as expected", () => {
    expect(isNetworkFailure({ type: "java.net.SocketTimeoutException", cause_type: null, context: "LOOKUP" })).toBe(true);
    expect(isNetworkFailure({ type: "java.io.IOException", cause_type: "java.net.ConnectException", context: "SYNC" })).toBe(true);
    expect(isNetworkFailure({ type: "java.net.SocketTimeoutException", cause_type: null, context: "STARTUP" })).toBe(false);
    expect(isNetworkFailure({ type: "java.lang.IllegalArgumentException", cause_type: null, context: "LOOKUP" })).toBe(false);
    expect(isNetworkFailure({ type: "java.nio.file.FileSystemException", cause_type: null, context: "SYNC" })).toBe(false);
    expect(isNetworkFailure({ type: "java.lang.IllegalStateException", cause_type: "java.net.SocketTimeoutException", context: "LOOKUP" })).toBe(false);
  });
});
