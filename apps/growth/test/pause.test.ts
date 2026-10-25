import { describe, expect, it } from "vitest";
import { paused } from "../src/pause";

describe("paused", () => {
  const at = (iso: string) => Date.parse(iso);
  it("skips mornings before the day and sends from it on", () => {
    expect(paused("2026-11-28", at("2026-10-26T05:00:00Z"))).toBe(true);
    expect(paused("2026-11-28", at("2026-11-27T05:00:00Z"))).toBe(true);
    expect(paused("2026-11-28", at("2026-11-28T05:00:00Z"))).toBe(false);
  });
  it("never pauses without a readable date", () => {
    expect(paused(undefined, at("2026-10-26T05:00:00Z"))).toBe(false);
    expect(paused("", at("2026-10-26T05:00:00Z"))).toBe(false);
    expect(paused("28.11.2026", at("2026-10-26T05:00:00Z"))).toBe(false);
  });
});
