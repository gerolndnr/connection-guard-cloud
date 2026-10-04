// Screenshots of the dashboard's network tools against a local `wrangler dev` seeded with scripts/seed-demo.mjs.
// Usage: node scripts/capture-network.mjs [outDir] [base]
import { chromium } from "playwright-core";
const out = process.argv[2] ?? "apps/web/.impeccable/review";
const base = process.argv[3] ?? "http://localhost:8788";
const browser = await chromium.launch({ channel: "chrome" });
const errors = [];
async function session(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.request.post(`${base}/api/auth/dev-login`, { data: { name }, headers: { origin: base } });
  return page;
}
for (const [n, vp, m] of [["desktop", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
  const p = await session("Demo Operator", vp, m);
  await p.goto(`${base}/`); await p.waitForURL(/\/n\//); await p.waitForLoadState("networkidle");
  const net = p.url().split("?")[0];
  await p.screenshot({ path: `${out}/overview-${n}.png`, fullPage: true });
  // A refused decision and its fixes.
  await p.goto(`${net}/register`); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Refused" }).click(); await p.waitForTimeout(800);
  await p.locator("tbody button").first().click(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/fixes-${n}.png` });
  await p.getByRole("button", { name: /Allow this IP address/ }).click(); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/fixes-done-${n}.png` });
  await p.getByRole("button", { name: "Close" }).click();
  // Settings simulation.
  await p.goto(`${net}/settings`); await p.waitForLoadState("networkidle");
  await p.getByRole("link", { name: /Proxy/ }).first().click(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Block selected" }).click();
  await p.getByPlaceholder("Search countries").fill("Germany");
  await p.getByRole("button", { name: /Germany/ }).first().click();
  await p.waitForTimeout(3000);
  await p.getByRole("button", { name: "Who?" }).click().catch(() => {});
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/simulation-${n}.png` });
  // Network page.
  await p.goto(`${net}/network`); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Invite a viewer" }).click(); await p.waitForTimeout(600);
  const inviteUrl = await p.locator("input[readonly]").inputValue();
  await p.screenshot({ path: `${out}/network-${n}.png`, fullPage: true });
  // Invite as someone else.
  const q = await session(`Moderator ${n}`, vp, m);
  await q.goto(inviteUrl.replace("https://app.connectionguard.net", base).replace("http://localhost:8787", base)); await q.waitForLoadState("networkidle");
  await q.screenshot({ path: `${out}/invite-${n}.png` });
  await q.close();
  await p.goto(`${base}/account`); await p.waitForLoadState("networkidle");
  await p.screenshot({ path: `${out}/account-${n}.png`, fullPage: true });
  await p.context().close();
}
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
