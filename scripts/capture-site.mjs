// Captures the marketing site (apps/site) at desktop and mobile widths, light and dark.
// Usage: node scripts/capture-site.mjs <outDir> [base]
import { chromium } from "playwright-core";
const out = process.argv[2] ?? "apps/site/.impeccable/review";
const base = process.argv[3] ?? "http://localhost:4330";
const browser = await chromium.launch({ channel: "chrome" });
for (const scheme of ["light", "dark"]) {
  for (const [name, viewport, mobile] of [["desktop", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    for (const [slug, path] of [["home", "/"], ["download", "/download"], ["privacy", "/privacy"], ["404", "/nope"], ["velocity", "/velocity-anti-vpn"], ["guide-vpn", "/guides/block-vpn-minecraft-server"], ["guides", "/guides"]]) {
      if (scheme === "dark" && slug !== "home") continue;
      await page.goto(base + path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/${slug}-${name}-${scheme}.png`, fullPage: true });
      if (slug === "home") await page.screenshot({ path: `${out}/${slug}-${name}-${scheme}-fold.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) console.log(`OVERFLOW ${slug} ${name} ${scheme}: ${overflow}px`);
    }
    if (errors.length) console.log(`ERRORS ${name} ${scheme}:`, errors);
    await ctx.close();
  }
}
await browser.close();
