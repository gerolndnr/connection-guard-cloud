import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { errorReport, syncRequest } from "@cg/protocol/examples";
import { analyticsPayload } from "../src/analytics.ts";
import { exceptionEvents } from "../src/plugin.ts";
import { api, claim, install, login, syncOk } from "./helpers.ts";

type ErrorView = { fingerprint: string; type: string; context: string; top_frame: string; count: number; plugin_version: string };

describe("plugin error reports", () => {
  it("stores linked servers' reports, adds up counts and never counts a retried sync twice", async () => {
    const ins = await install();
    const cookie = await login("Owner");
    const { network_id } = await (await claim(cookie, ins.link_code!)).json<{ network_id: string }>();
    await syncOk(ins, { seq: 1, plugin_version: "0.5.2", errors: [errorReport] });
    await syncOk(ins, { seq: 1, plugin_version: "0.5.2", errors: [errorReport] }); // retry of the same sync
    await syncOk(ins, { seq: 2, plugin_version: "0.5.2", errors: [{ ...errorReport, count: 3, last_at: errorReport.last_at + 1000 }] });

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
});
