// Screenshots of the settings page (light/dark, desktop/mobile) against the local dev backend.
import { chromium } from "playwright-core";
const out = process.argv[2] ?? ".impeccable/review";
const base = process.argv[3] ?? "http://localhost:8788";
const b = await chromium.launch({ channel: "chrome" });
for (const [name, viewport, mobile, scheme] of [["desktop", { width: 1440, height: 900 }, false, "light"], ["mobile", { width: 390, height: 844 }, true, "light"], ["desktop-dark", { width: 1440, height: 900 }, false, "dark"]]) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce", colorScheme: scheme });
  const p = await ctx.newPage();
  await p.request.post(`${base}/api/auth/dev-login`, { data: { name: "Demo Operator" }, headers: { origin: base } });
  await p.goto(`${base}/`); await p.waitForURL(/\/n\//);
  const net = new URL(p.url()).pathname.split("/")[2];
  await p.goto(`${base}/n/${net}/settings`); await p.waitForLoadState("networkidle");
  await p.screenshot({ path: `${out}/${name}-settings-picker.png`, fullPage: true });
  await p.locator("main a").first().click(); await p.getByText("Protection mode").first().waitFor(); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${name}-settings.png`, fullPage: true });
  // Make a change so the save bar and validation show.
  await p.getByRole("radio", { name: /Enforce/ }).check();
  await p.getByRole("switch", { name: "Use IPHub" }).click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${name}-settings-dirty.png`, fullPage: false });
  await ctx.close();
}
await b.close();
console.log("captured settings");
