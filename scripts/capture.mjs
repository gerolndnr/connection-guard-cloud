// Captures full-page screenshots of the local dashboard with the system Chrome.
// Usage: node scripts/capture.mjs <outDir> [base]
import { chromium } from "playwright-core";
const out = process.argv[2] ?? ".impeccable/review";
const base = process.argv[3] ?? "http://localhost:8788";
const browser = await chromium.launch({ channel: "chrome" });
async function session(viewport, isMobile, colorScheme = "light") {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: isMobile ? 2 : 1, isMobile, hasTouch: isMobile, reducedMotion: "reduce", colorScheme });
  const page = await ctx.newPage();
  await page.request.post(`${base}/api/auth/dev-login`, { data: { name: "Demo Operator" }, headers: { origin: base } });
  return page;
}
for (const [name, viewport, mobile] of [["desktop", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
  const page = await session(viewport, mobile);
  await page.goto(`${base}/`); await page.waitForURL(/\/n\//); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await page.goto(page.url() + "/register"); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/${name}-register.png`, fullPage: false });
  await page.locator("tbody button").nth(4).click(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-why.png`, fullPage: false });
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Would refuse" }).click(); await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}-register-pencil.png`, fullPage: false });
  await page.locator("tbody button").first().click(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-why-pencil.png`, fullPage: false });
  // Signed-in link page with a fresh, real link code.
  const ins = await (await page.request.post(`${base}/v1/installs`, { data: { protocol: 1, platform: "BUKKIT", platform_version: "Paper 1.21.11-132", plugin_version: "0.5.0", java_version: "21.0.4" } })).json();
  await page.goto(`${base}/link/${ins.link_code}`); await page.getByText("Data processing").first().waitFor(); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}-link.png`, fullPage: true });
  const ctx = page.context(); await ctx.clearCookies();
  await page.goto(`${base}/link/ABCD-EFGH`); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/${name}-link-signed-out.png`, fullPage: true });
  await ctx.close();
}
// Dark theme: overview and a why sheet.
for (const [name, viewport, mobile] of [["desktop-dark", { width: 1440, height: 900 }, false], ["mobile-dark", { width: 390, height: 844 }, true]]) {
  const page = await session(viewport, mobile, "dark");
  await page.goto(`${base}/`); await page.waitForURL(/\/n\//); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await page.goto(page.url() + "/register"); await page.waitForLoadState("networkidle");
  await page.locator("tbody button").nth(4).click(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-why.png`, fullPage: false });
  await page.context().close();
}
await browser.close();
console.log("captured", out);
