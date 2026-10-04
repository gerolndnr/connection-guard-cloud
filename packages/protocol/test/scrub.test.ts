import { describe, expect, it } from "vitest";
import { normalizePath, scrubString, scrubValue } from "../src/scrub.ts";

describe("privacy scrub", () => {
  it.each([
    ["91.99.173.205", "[ip]"],
    ["Refused 185.3.241.112 (VPN)", "Refused [ip] (VPN)"],
    ["2a06:98c1:3121::5", "[ip]"],
    ["fe80::1", "[ip]"],
    ["::1", "[ip]"],
    ["2001:db8:0:0:0:0:2:1", "[ip]"],
    ["069a79f4-44e9-4726-a5be-fca90e38aaf5", "[uuid]"],
    ["069a79f444e94726a5befca90e38aaf5", "[uuid]"],
    ["https://app.connectionguard.net/link/7KQM-4P2X", "https://app.connectionguard.net/link/:code"],
  ])("removes %s", (input, out) => expect(scrubString(input)).toBe(out));

  it.each(["12:04:51", "a::before", "Checked 436 · last 24 hours", "v0.4.11", "1.21.11"])("keeps %s", (s) => expect(scrubString(s)).toBe(s));

  it("walks nested properties", () => {
    expect(scrubValue({ $el_text: "91.99.173.205", list: ["fe80::1", 3], deep: { u: "069a79f4-44e9-4726-a5be-fca90e38aaf5" } }))
      .toEqual({ $el_text: "[ip]", list: ["[ip]", 3], deep: { u: "[uuid]" } });
  });

  it("normalizes dashboard paths", () => {
    expect(normalizePath("https://app.connectionguard.net/n/net_ab12CD34ef/settings?server=ins_ZZ99xx11yy22zz33aa44"))
      .toBe("https://app.connectionguard.net/n/:network/settings?server=:server");
  });
});

describe("event properties", () => {
  it("keeps analytics IDs but scrubs everything else", async () => {
    const { scrubEventProperties } = await import("../src/scrub.ts");
    const id = "01a10731-95f8-7d89-856c-6ced9a2f41a4";
    expect(scrubEventProperties({ distinct_id: id, $session_id: id, $window_id: id, $device_id: id, $anon_distinct_id: id, uuid: id, $el_text: "91.99.173.205", note: id }))
      .toEqual({ distinct_id: id, $session_id: id, $window_id: id, $device_id: id, $anon_distinct_id: id, uuid: id, $el_text: "[ip]", note: "[uuid]" });
  });
});
