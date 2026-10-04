// Renders the site's social preview images (1200×630) and app icons into apps/site/public with the system Chrome.
// Usage: node scripts/site-images.mjs
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../apps/site/", import.meta.url));
const font = (p) => readFileSync(`${site}node_modules/@fontsource-variable/${p}`).toString("base64");
const sans = font("geist/files/geist-latin-wght-normal.woff2");
const mono = font("geist-mono/files/geist-mono-latin-wght-normal.woff2");

// slug → [headline, subline]
const PAGES = {
  home: ["Keep VPN alts off your Minecraft server.", "Free, open-source anti-VPN, proxy and country rules."],
  download: ["Download Connection Guard", "One free JAR for Paper, Spigot, BungeeCord and Velocity."],
  velocity: ["Anti-VPN for Velocity", "Check every player once, at the proxy."],
  bungeecord: ["Anti-VPN for BungeeCord", "Block VPNs and proxies before players reach a backend."],
  paper: ["Anti-VPN for Paper and Spigot", "Block VPNs, proxies and countries on a single server."],
  guides: ["Guides for server owners", "VPNs, proxies and country rules, explained."],
  "guide-vpn": ["How to block VPNs on a Minecraft server", "What works, what doesn't, and how to avoid false positives."],
  "guide-countries": ["How to block countries on a Minecraft server", "Blocklists, allowlists and what to tell players."],
  privacy: ["Privacy, in plain language", "What is sent where. No cookies on this site."],
};

const mark = `<svg viewBox="0 0 32 32" width="44" height="44"><rect width="32" height="32" rx="8" fill="#0a0a0a" stroke="#2e2e2e"/><path d="M10 16.5l4 4 8-9" fill="none" stroke="#10b981" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const base = `<style>
@font-face{font-family:G;src:url(data:font/woff2;base64,${sans}) format("woff2");font-weight:100 900}
@font-face{font-family:M;src:url(data:font/woff2;base64,${mono}) format("woff2");font-weight:100 900}
*{margin:0;box-sizing:border-box}body{background:#000;color:#ededed;font-family:G;-webkit-font-smoothing:antialiased}
</style>`;
const card = ([h, sub]) => `${base}<div style="width:1200px;height:630px;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;border-top:6px solid #10b981">
  <div style="display:flex;align-items:center;gap:18px;font-size:30px;font-weight:600;letter-spacing:-.01em">${mark}Connection Guard</div>
  <div><div style="font-size:${h.length > 34 ? 68 : 80}px;font-weight:600;letter-spacing:-.045em;line-height:1.03;max-width:1000px;text-wrap:balance">${h}</div>
  <div style="margin-top:26px;font-size:32px;color:#a1a1a1;letter-spacing:-.01em">${sub}</div></div>
  <div style="display:flex;gap:14px;font-family:M;font-size:22px;color:#a1a1a1">
    ${["Free · MIT", "Paper", "Spigot", "BungeeCord", "Velocity"].map((t, i) => `<span style="padding:9px 18px;border-radius:999px;border:1px solid ${i ? "#2e2e2e" : "rgba(16,185,129,.45)"};color:${i ? "#a1a1a1" : "#34d399"};background:${i ? "#0a0a0a" : "rgba(16,185,129,.12)"}">${t}</span>`).join("")}
  </div></div>`;
const icon = (size, radius) => `${base}<style>body{background:transparent}</style><svg viewBox="0 0 32 32" width="${size}" height="${size}" style="display:block"><rect width="32" height="32" rx="${radius}" fill="#0a0a0a"/><path d="M10 16.5l4 4 8-9" fill="none" stroke="#10b981" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

mkdirSync(`${site}public/og`, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [slug, text] of Object.entries(PAGES)) {
  await page.setContent(card(text)); await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${site}public/og/${slug}.png` });
}
// Square icons: Apple adds its own rounding, so the touch icon is full-bleed.
for (const [file, size, radius] of [["apple-touch-icon.png", 180, 0], ["icon-192.png", 192, 8], ["icon-512.png", 512, 8], ["favicon-32.png", 32, 8]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(icon(size, radius));
  await page.screenshot({ path: `${site}public/${file}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log("images written");
