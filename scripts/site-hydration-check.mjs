// Regression check for React hydration errors (#418) on the website, with and without a stored theme.
// Usage: node scripts/site-hydration-check.mjs [base], e.g. against `astro preview --port 4330`.
import { chromium } from "playwright-core";
const base = process.argv[2] ?? "http://localhost:4330";
const b = await chromium.launch({ channel: "chrome" });
for (const stored of [null, "light", "dark"]) for (const w of [1440, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addInitScript((t) => { try { t ? localStorage.setItem("cg-theme", t) : localStorage.removeItem("cg-theme"); } catch {} }, stored);
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message.slice(0, 60))); p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 60)));
  await p.goto(base + "/guides"); await p.waitForTimeout(1500);
  const after = await p.evaluate(() => [localStorage.getItem("cg-theme"), document.documentElement.classList.contains("dark"), document.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label")]);
  console.log(`${String(stored).padEnd(5)} ${w}px  errors=${errs.filter((e) => /418|hydrat/i.test(e)).length}  stored-after=${after[0]} dark=${after[1]} pressed=${after[2]}`);
  await ctx.close();
}
await b.close();
