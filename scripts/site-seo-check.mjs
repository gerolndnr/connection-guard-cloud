// On-page SEO checks for every URL in the built sitemap: titles, descriptions, headings, canonicals,
// social images, structured data and internal links. Usage: node scripts/site-seo-check.mjs [base]
import { chromium } from "playwright-core";
const base = process.argv[2] ?? "http://localhost:4330";
const xml = await (await fetch(`${base}/sitemap-0.xml`)).text();
const paths = [...xml.matchAll(/<loc>https:\/\/connectionguard\.net([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const links = new Set(); let problems = 0;
const warn = (p, msg) => { problems++; console.log(`  ✗ ${p}: ${msg}`); };
for (const p of paths) {
  const res = await page.goto(base + p);
  const d = await page.evaluate(() => ({
    title: document.title,
    desc: document.querySelector('meta[name="description"]')?.content ?? "",
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? "",
    og: document.querySelector('meta[property="og:image"]')?.content ?? "",
    h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()),
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
    imgsNoAlt: [...document.querySelectorAll("img:not([alt])")].length,
    links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
    words: document.querySelector("main")?.innerText.split(/\s+/).length ?? 0,
  }));
  console.log(`${p}  [${res.status()}] ${d.title.length}c title · ${d.desc.length}c desc · ${d.words} words`);
  if (res.status() !== 200) warn(p, `status ${res.status()}`);
  if (d.title.length < 30 || d.title.length > 70) warn(p, `title length ${d.title.length}: ${d.title}`);
  if (d.desc.length < 110 || d.desc.length > 165) warn(p, `description length ${d.desc.length}`);
  if (d.h1.length !== 1) warn(p, `${d.h1.length} h1`);
  if (d.canonical !== `https://connectionguard.net${p === "/" ? "/" : p}`) warn(p, `canonical ${d.canonical}`);
  if (d.imgsNoAlt) warn(p, `${d.imgsNoAlt} images without alt`);
  const og = d.og.replace("https://connectionguard.net", base);
  if (!d.og || (await fetch(og)).status !== 200) warn(p, `og:image missing ${d.og}`);
  for (const s of d.ld) { try { const j = JSON.parse(s); console.log(`    ld: ${j["@graph"].map((n) => n["@type"]).join(", ")}`); } catch { warn(p, "invalid JSON-LD"); } }
  d.links.filter((h) => h.startsWith("/")).forEach((h) => links.add(h.split("#")[0] || "/"));
}
for (const l of links) { const s = (await fetch(base + l)).status; if (s !== 200) warn(l, `internal link status ${s}`); }
console.log(`${paths.length} pages, ${links.size} internal links, ${problems} problems`);
await browser.close();
