import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { analyticsPayload, sendEvents } from "../src/analytics.ts";

describe("server analytics", () => {
  it("builds anonymous, scrubbed PostHog batches", () => {
    const body = analyticsPayload({ ...env, POSTHOG_KEY: "phc_test" }, [
      { event: "settings_rejected", distinct_id: "ins_abc", person: false, groups: { network: "net_x" },
        properties: { message: "exemption 91.99.173.205 and 069a79f4-44e9-4726-a5be-fca90e38aaf5 is invalid" } },
      { event: "user_signed_in", distinct_id: "usr_1", properties: { method: "discord" } },
    ], 0);
    expect(body.api_key).toBe("phc_test");
    const [rejected, signedIn] = body.batch;
    expect(rejected!.properties).toMatchObject({
      distinct_id: "ins_abc", $process_person_profile: false, $groups: { network: "net_x" }, $geoip_disable: true,
      message: "exemption [ip] and [uuid] is invalid",
    });
    expect(signedIn!.properties).not.toHaveProperty("$process_person_profile");
    expect(signedIn!.properties).not.toHaveProperty("$groups");
  });

  it("sends nothing without a key or outside production", async () => {
    let calls = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as typeof fetch;
    try {
      await sendEvents({ ...env, POSTHOG_KEY: "" }, [{ event: "x", distinct_id: "a" }]);
      await sendEvents({ ...env, POSTHOG_KEY: "phc_test", ENVIRONMENT: "test" }, [{ event: "x", distinct_id: "a" }]);
      expect(calls).toBe(0);
      await sendEvents({ ...env, POSTHOG_KEY: "phc_test", ENVIRONMENT: "production" }, [{ event: "x", distinct_id: "a" }]);
      expect(calls).toBe(1);
    } finally { globalThis.fetch = real; }
  });
});
