import { afterEach, describe, expect, it, vi } from "vitest";
import { namesFor } from "../src/players.ts";

// Each test uses its own UUIDs/names: the edge cache persists across tests in this worker.
type Reply = { status: number; body?: unknown } | "throw";
const real = globalThis.fetch;
let calls: string[] = [];

function stub(reply: (url: URL) => Reply) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.host);
    const r = reply(url);
    if (r === "throw") throw new DOMException("timed out", "TimeoutError");
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
}

afterEach(() => { globalThis.fetch = real; vi.restoreAllMocks(); });

describe("player name lookup", () => {
  it("reads the name from the session server", async () => {
    stub(() => ({ status: 200, body: { id: "x", name: "Alpha_1" } }));
    expect(await namesFor(["0a000000-0000-4000-8000-000000000001"])).toEqual({ "0a000000-0000-4000-8000-000000000001": "Alpha_1" });
    expect(calls).toEqual(["sessionserver.mojang.com"]);
  });

  it("falls back to minecraftservices when the session server refuses", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stub((url) => url.host === "sessionserver.mojang.com" ? { status: 429 } : { status: 200, body: { id: "x", name: "Beta" } });
    expect(await namesFor(["0a000000-0000-4000-8000-000000000002"])).toEqual({ "0a000000-0000-4000-8000-000000000002": "Beta" });
    expect(calls).toEqual(["sessionserver.mojang.com", "api.minecraftservices.com"]);
  });

  it("leaves out a failed lookup, logs no identity and does not cache the failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const uuid = "0a000000-0000-4000-8000-000000000003";
    stub((url) => url.host === "sessionserver.mojang.com" ? { status: 403 } : "throw");
    expect(await namesFor([uuid])).toEqual({});
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("sessionserver.mojang.com 403");
    expect(logged).toContain("api.minecraftservices.com TimeoutError");
    expect(logged).not.toContain("0a000000");
    // Mojang recovers: the next request asks again instead of serving a cached "no name".
    stub(() => ({ status: 200, body: { id: "x", name: "Gamma" } }));
    expect(await namesFor([uuid])).toEqual({ [uuid]: "Gamma" });
  });

  it("caches a definite answer, including 'no such profile'", async () => {
    stub(() => ({ status: 204 }));
    const uuid = "0a000000-0000-4000-8000-000000000004";
    expect(await namesFor([uuid])).toEqual({ [uuid]: null });
    stub(() => ({ status: 200, body: { name: "Late" } }));
    expect(await namesFor([uuid])).toEqual({ [uuid]: null });
    expect(calls).toEqual([]);
  });

  it("never asks Mojang for offline-mode UUIDs", async () => {
    stub(() => ({ status: 200, body: { name: "Nope" } }));
    const offline = "0a000000-0000-3000-8000-000000000005";
    expect(await namesFor([offline, "not-a-uuid"])).toEqual({ [offline]: null });
    expect(calls).toEqual([]);
  });

});
