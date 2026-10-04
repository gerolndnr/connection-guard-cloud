// Verifies the website's analytics locally: intercepts PostHog requests, prints the events and fails if the
// site stores anything in the browser or sends personal data. Build with PUBLIC_POSTHOG_KEY=phc_localtest first.
// Usage: node scripts/site-analytics-check.mjs [base]
import { chromium } from "playwright-core";
import { gunzipSync } from "node:zlib";
const base = process.argv[2] ?? "http://localhost:4330";
const browser = await chromium.launch({ channel: "chrome" });
// PostHog drops events from user agents that look like bots, such as HeadlessChrome.
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" });
await ctx.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
await ctx.route(/modrinth\.com/, (r) => r.abort());
const events = [];
const decode = (req) => {
  const buf = req.postDataBuffer(); if (!buf) return [];
  let text;
  try { text = gunzipSync(buf).toString(); } catch { text = buf.toString(); }
  if (text.startsWith("data=")) text = Buffer.from(decodeURIComponent(text.slice(5)), "base64").toString();
  try { const j = JSON.parse(text); return Array.isArray(j) ? j : j.batch ?? [j]; } catch { return []; }
};
await ctx.route(/posthog\.com|t\.connectionguard\.net/, async (route) => {
  const req = route.request();
  if (req.method() === "POST" && !/\/flags\//.test(req.url())) events.push(...decode(req).filter((e) => e?.event));
  if (/\/(flags|decide)\//.test(req.url())) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ featureFlags: {}, sessionRecording: false, supportedCompression: ["gzip-js"] }) });
  if (/\.js(\?|$)/.test(req.url())) return route.continue();
  return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":1}' });
});
// Like uBlock Origin with EasyPrivacy: these file names are blocked, so nothing may depend on them.
const BLOCKED = [/\/dead-clicks-autocapture\.js/, /\/posthog-recorder\.js/, /:\/\/posthog\./];
const externalScripts = [];
ctx.on("request", (r) => {
  const u = r.url();
  if (r.resourceType() === "script" && !u.startsWith(base) && /posthog|t\.connectionguard\.net/.test(u)) externalScripts.push(u);
});
await ctx.route((url) => BLOCKED.some((re) => re.test(url.toString())), (r) => r.abort("blockedbyclient"));
const page = await ctx.newPage();
await page.goto(base + "/");
await page.waitForTimeout(3500);
await page.locator('a[data-ph-cta="compare"]').click();
await page.locator("details summary").first().click();
await page.waitForTimeout(4000);
await page.goto(base + "/download");
await page.waitForTimeout(3000);
await page.locator('a[data-ph-destination="modrinth"]').first().click({ modifiers: ["Meta"] });
await page.waitForTimeout(4000);
await page.goto(base + "/velocity-anti-vpn");
await page.waitForTimeout(4000);
await page.goto(base + "/privacy");
await page.waitForTimeout(2500);
const storage = await page.evaluate(() => ({ cookies: document.cookie, local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
const cookies = await ctx.cookies(base);
let bad = 0;
for (const e of events) {
  const p = e.properties ?? {};
  console.log(`${e.event.padEnd(22)} ${p.$pathname ?? ""} ${JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith("$") && k !== "token" && k !== "distinct_id")))}`);
  if (JSON.stringify(e).match(/\b\d{1,3}(\.\d{1,3}){3}\b/)) { bad++; console.log("  ✗ contains an IPv4 address"); }
}
const kinds = new Set(events.map((e) => e.event));
console.log("cookieless:", events.every((e) => e.properties?.$cookieless_mode === true), "distinct ids:", [...new Set(events.map((e) => e.properties?.distinct_id))].join(", "));
console.log("browser storage:", JSON.stringify(storage), "cookies:", cookies.length);
if (cookies.length || storage.cookies || storage.local.some((k) => k !== "cg-theme") || storage.session.length) { bad++; console.log("✗ stored data in the browser"); }
for (const k of ["$pageview", "cg_cta_clicked", "cg_faq_opened", "cg_download_clicked", "cg_install_guide_opened"]) if (!kinds.has(k)) { bad++; console.log(`✗ missing ${k}`); }
if (externalScripts.length) { bad++; console.log(`✗ scripts loaded from PostHog: ${[...new Set(externalScripts)].join(", ")}`); }
console.log(`${events.length} events, ${bad} problems`);
await browser.close();
process.exit(bad ? 1 : 0);
