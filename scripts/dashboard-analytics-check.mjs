// Verifies the dashboard's analytics against a local `wrangler dev --var POSTHOG_KEY:phc_localtest` seeded with
// scripts/seed-demo.mjs: intercepts every PostHog request (events and session replay), prints the events and fails
// if any payload contains an IP address or UUID, if anything but the opt-out flag is stored, or if opting out
// does not stop capture. Usage: node scripts/dashboard-analytics-check.mjs [base]
import { chromium } from "playwright-core";
import { gunzipSync } from "node:zlib";
const base = process.argv[2] ?? "http://localhost:8788";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error("local dev server only");
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" });
// PostHog ignores automated browsers; this check needs it to behave as for a person.
await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
const bodies = []; const events = []; let replayBatches = 0; let replaySample = "";
const decode = (buf) => {
  if (!buf) return "";
  let text; try { text = gunzipSync(buf).toString(); } catch { text = buf.toString(); }
  if (text.startsWith("data=")) text = Buffer.from(decodeURIComponent(text.slice(5)), "base64").toString();
  return text;
};
await ctx.route(/posthog\.com/, async (route) => {
  const req = route.request(); const url = req.url();
  // Remote config as the PostHog project would send it with session replay switched on.
  if (/\/array\/[^/]+\/config(\.js)?$/.test(url)) {
    const cfg = { sessionRecording: { endpoint: "/s/" }, autocapture_opt_out: false, autocaptureExceptions: true, capturePerformance: { web_vitals: true }, heatmaps: true, supportedCompression: ["gzip-js"] };
    return url.endsWith(".js")
      ? route.fulfill({ status: 200, contentType: "application/javascript", body: `(function(){window._POSTHOG_REMOTE_CONFIG=window._POSTHOG_REMOTE_CONFIG||{};window._POSTHOG_REMOTE_CONFIG["phc_localtest"]={config:${JSON.stringify(cfg)},siteApps:[]}})()` })
      : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cfg) });
  }
  if (/\/flags\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ featureFlags: {}, sessionRecording: { endpoint: "/s/" }, supportedCompression: ["gzip-js"], autocapture_opt_out: false, capturePerformance: { web_vitals: true } }) });
  if (req.method() === "POST") {
    const text = decode(req.postDataBuffer()); bodies.push(text);
    if (/\/s\//.test(url)) { replayBatches++; replaySample ||= text; }
    try {
      const j = JSON.parse(text); const list = Array.isArray(j) ? j : j.batch ?? [j];
      for (const e of list) if (e.event && e.event !== "$snapshot") events.push(e);
    } catch { /* not JSON */ }
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":1}' });
  }
  return route.continue();
});
const page = await ctx.newPage();
await page.request.post(`${base}/api/auth/dev-login`, { data: { name: "Demo Operator" }, headers: { origin: base } });
await page.goto(`${base}/`); await page.waitForURL(/\/n\//); await page.waitForTimeout(2500);
await page.getByRole("button", { name: "Last 7 days" }).click().catch(() => {});
await page.goto(page.url().split("?")[0] + "/register"); await page.waitForTimeout(2000);
await page.locator("tbody button").nth(2).click(); await page.waitForTimeout(800);
await page.getByRole("button", { name: "Close" }).click().catch(() => {});
await page.getByRole("button", { name: "Refused" }).click().catch(() => {});
await page.getByPlaceholder(/search|ip/i).first().fill("185.3.241.112").catch(() => {});
await page.waitForTimeout(1500);
await page.goto(page.url().replace("/register", "/settings")); await page.waitForTimeout(2500);
// Give session replay time to flush a full snapshot.
await page.mouse.move(500, 400); await page.mouse.wheel(0, 500); await page.waitForTimeout(9000);
const before = events.length;
// Opt out: nothing more may be sent.
await page.getByRole("button", { name: "Account" }).click();
await page.getByRole("switch").uncheck();
await page.waitForTimeout(500);
const afterOptOut = events.length;
await page.goto(page.url().replace("/settings", "")); await page.waitForTimeout(4000);
const leakedAfterOptOut = events.length - afterOptOut;
const storage = await page.evaluate(() => ({ cookies: document.cookie, local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));

const all = bodies.join("\n");
const ip = all.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)?.filter((m) => !/^\d+\.\d+\.\d+\.\d+$/.test(m) || !m.startsWith("0.")) ?? [];
// PostHog's own IDs are UUIDv7 ("xxxxxxxx-xxxx-7xxx-..."); player UUIDs are v3/v4.
const uuid = (all.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) ?? []).filter((u) => u[14] !== "7");
let bad = 0;
for (const e of events) {
  const p = e.properties ?? {};
  const own = Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith("$") && !["token", "distinct_id", "surface"].includes(k)));
  console.log(`${String(e.event).padEnd(24)} ${String(p.$pathname ?? "").padEnd(28)} ${JSON.stringify(own).slice(0, 110)}`);
}
console.log(`distinct ids: ${[...new Set(events.map((e) => e.properties?.distinct_id))].join(", ")}`);
console.log(`groups: ${JSON.stringify([...new Set(events.map((e) => JSON.stringify(e.properties?.$groups ?? {})))])}`);
console.log(`replay batches: ${replayBatches}`);
// Masked replays carry text only as asterisks: no readable words from the page may appear.
for (const word of ["Decisions", "Settings", "Overview", "Admitted", "Refused"]) if (replaySample.includes(`"${word}`) || replaySample.includes(`>${word}<`)) { bad++; console.log(`✗ replay contains readable text: ${word}`); }
if (replayBatches === 0) { bad++; console.log("✗ no session replay was recorded"); }
console.log(`browser storage: ${JSON.stringify(storage)}`);
if (ip.length) { bad++; console.log(`✗ IP-like strings sent: ${[...new Set(ip)].slice(0, 5).join(", ")}`); }
if (uuid.length) { bad++; console.log(`✗ UUIDs sent: ${[...new Set(uuid)].slice(0, 3).join(", ")}`); }
if (all.includes("Demo Operator")) { bad++; console.log("✗ account name sent"); }
if (storage.cookies.split(";").some((c) => c.trim() && !c.trim().startsWith("cg_"))) { bad++; console.log("✗ cookies set"); }
if (storage.local.some((k) => !["cg-theme", "cg-analytics-optout", "cg-dismissed", "__ph_opt_in_out_"].some((ok) => k.startsWith(ok))) || storage.session.length) { bad++; console.log("✗ storage used: " + JSON.stringify(storage)); }
if (leakedAfterOptOut) { bad++; console.log(`✗ ${leakedAfterOptOut} events after opting out`); }
if (events.some((e) => typeof e.properties?.distinct_id === "string" && !e.properties.distinct_id.startsWith("usr_"))) { bad++; console.log("✗ signed-in events without the account ID"); }
if (!events.some((e) => e.event === "cg_decision_opened")) { bad++; console.log("✗ no cg_decision_opened"); }
console.log(`${events.length} events (${before} before opt-out), ${bad} problems`);
await browser.close();
process.exit(bad ? 1 : 0);
