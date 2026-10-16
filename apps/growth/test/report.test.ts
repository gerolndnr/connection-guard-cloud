import { describe, expect, it } from "vitest";
import { mime } from "../src/mail";
import { PRODUCTS } from "../src/products";
import { buildRows, dayAverage, render, sumSeries, type ProjectData, type Series } from "../src/report";

const HALF = 1_800_000, DAY = 86_400_000;
const END = Date.UTC(2026, 9, 16, 4, 30);
/** 31 days of half-hourly points; value(daysAgo) gives the count. */
const series = (value: (daysAgo: number) => number): Series =>
  Array.from({ length: 31 * 48 }, (_, i) => { const ts = END - i * HALF; return [ts, value((END - ts) / DAY)] as [number, number]; }).reverse();

describe("dayAverage and sumSeries", () => {
  it("averages the 24 hours ending at the given time", () => {
    const s = series((d) => (d < 1 ? 10 : 4));
    expect(dayAverage(s, END)).toBe(10);
    expect(dayAverage(s, END - DAY)).toBe(4);
    expect(dayAverage(s, END - 40 * DAY)).toBeNull();
  });
  it("adds projects per timestamp and skips missing ones", () => {
    expect(sumSeries([[[1, 2], [2, 3]], null, [[1, 5]]])).toEqual([[1, 7], [2, 3]]);
    expect(sumSeries([null, []])).toBeNull();
  });
});

describe("buildRows and render", () => {
  // Connection Guard grows by one server a day on Spigot; every other project stays at 50.
  const data: ProjectData[] = PRODUCTS.flatMap((p) => p.projects).map(({ id }) => ({
    id,
    servers: id === 22911 ? series((d) => 60 - Math.floor(d)) : id === 22912 ? null : series(() => 50),
    players: series(() => 100),
  }));
  const rows = buildRows(data, END);
  const cg = rows.find((r) => r.product.key === "connection-guard")!;

  it("compares day averages, not single points", () => {
    expect(cg.servers).toBe(60 + 50); // Spigot 60 + Velocity 50; BungeeCord has no data
    expect(cg.d1).toBe(1);
    expect(cg.d7).toBe(7);
    expect(cg.d30).toBe(30);
    expect(cg.missing).toBe(1);
    expect(cg.spark).toHaveLength(30);
  });
  it("sorts by servers and leaves the predecessor out of the share", () => {
    const report = render(rows, END);
    expect(rows[0]!.servers).toBeGreaterThanOrEqual(rows[1]!.servers!);
    expect(report.subject).toBe("Growth 16 Oct 2026: Connection Guard 110 servers (+7 in 7 days)");
    expect(report.text).toContain("Incomplete today: Connection Guard (1 of 3 projects unavailable)");
    expect(report.text).toContain("VPNGuard");
    const total = rows.filter((r) => !r.product.legacy).reduce((s, r) => s + r.servers!, 0);
    expect(report.text).toContain(`${((110 / total) * 100).toFixed(1)} %`);
  });
  it("builds a valid two-part message", () => {
    const m = mime({ MAIL_FROM: "growth@connectionguard.net", MAIL_TO: "a@example.org" }, render(rows, END), new Date(END));
    expect(m).toMatch(/^From: Connection Guard Growth <growth@connectionguard\.net>\r\n/);
    expect(m).toContain("Message-ID: <");
    expect(m).toMatch(/Content-Type: text\/plain; charset=utf-8[\s\S]*Content-Type: text\/html; charset=utf-8/);
    expect(m.split("\r\n").every((line) => line.length <= 998)).toBe(true);
  });
});
