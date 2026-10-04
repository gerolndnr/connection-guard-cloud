// End-to-end: real Velocity + plugin + browser through link, setup assistant and the "try it" step.
// Usage: node scripts/e2e-setup.mjs <velocity-fixture-dir> <screenshot-dir> <path/to/backend_client.cjs>
// The fixture dir holds velocity.jar, velocity.toml (bind 127.0.0.1:25599, offline mode) and
// plugins/connection-guard.jar with cloud.endpoint pointing at the local `wrangler dev`.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const [e2eDir, outDir, clientScript] = process.argv.slice(2);
const base = "http://localhost:8788";
const t0 = Date.now();
const log = (m) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s] ${m}`);
const java = (await new Promise((r) => { const p = spawn("/usr/libexec/java_home", ["-v", "21"]); let o = ""; p.stdout.on("data", (d) => (o += d)); p.on("close", () => r(o.trim())); })) + "/bin/java";
const proxy = spawn(java, ["-Xmx256m", "-Dterminal.jline=false", "-Dterminal.ansi=false", "-jar", "velocity.jar"], { cwd: e2eDir });
let consoleText = "";
proxy.stdout.on("data", (d) => (consoleText += d));
const waitFor = async (fn, ms, what) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 500)); } throw new Error("timeout: " + what); };
const browser = await chromium.launch({ channel: "chrome" });
try {
  const code = await waitFor(() => consoleText.match(/\/link\/([0-9A-Z]{4}-[0-9A-Z]{4})/)?.[1], 90_000, "link code");
  log("console printed link " + code);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" })).newPage();
  await page.request.post(`${base}/api/auth/dev-login`, { data: { name: "Demo Operator" }, headers: { origin: base } });
  await page.goto(`${base}/link/${code}`);
  await page.getByText("Data processing").first().waitFor();
  await page.getByRole("radio").first().check();
  await page.getByPlaceholder("e.g. Lobby, Survival, Proxy").fill("Creative");
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(1500); // Turnstile test key
  await page.getByRole("button", { name: "Link server" }).click();
  await page.waitForURL(/\/setup/, { timeout: 15_000 });
  log("linked, landed in the setup assistant");
  await page.getByText("What should Connection Guard keep out?").waitFor();
  await page.screenshot({ path: `${outDir}/setup-1.png` });
  await page.getByRole("checkbox", { name: /Players from certain countries/ }).click();
  await page.getByPlaceholder("Search countries").fill("China");
  await page.getByRole("option", { name: /China/ }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/setup-1b.png` });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Which services should check players?").waitFor();
  await page.getByRole("checkbox", { name: /^IPHub/ }).click();
  const blocked = await page.getByRole("button", { name: "Continue" }).isDisabled();
  log("IPHub without a key blocks Continue: " + blocked);
  await page.getByPlaceholder("Paste your IPHub API key").fill("e2e-iphub-key-4242");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/setup-2.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Start gently?").waitFor();
  await page.screenshot({ path: `${outDir}/setup-3.png` });
  await page.getByRole("button", { name: /Finish setup/ }).click();
  log("finished the assistant");
  await page.getByText("Applying your settings…").waitFor({ timeout: 10_000 }).catch(() => {});
  await page.screenshot({ path: `${outDir}/setup-4-applying.png` });
  await page.getByText("You're protected").waitFor({ timeout: 120_000 });
  log("server applied the settings");
  const installId = new URL(page.url()).searchParams.get("server");
  const cfg = await (await page.request.get(`${base}/api/installs/${installId}/config`)).json();
  log(`server reports: iphub=${cfg.effective["provider.vpn.iphub.enabled"]} key=${JSON.stringify(cfg.effective["provider.vpn.iphub.api-key"])} votes=${cfg.effective["required-positive-flags"]}`);
  await page.screenshot({ path: `${outDir}/setup-4-applied.png` });
  await page.getByRole("button", { name: /Try it out/ }).click();
  await page.getByText(/Try it: join/).waitFor();
  await page.screenshot({ path: `${outDir}/setup-5-waiting.png` });
  const client = spawn("node", [clientScript, "25599"], { stdio: ["pipe", "pipe", "pipe"] });
  let clientOut = ""; client.stdout.on("data", (d) => (clientOut += d)); client.stderr.on("data", (d) => (clientOut += d));
  client.stdin.write("connect Gero_Test\n");
  log("a synthetic player joins the proxy");
  await page.getByText("It works").waitFor({ timeout: 120_000 });
  log("the login showed up in the assistant");
  await page.screenshot({ path: `${outDir}/setup-6-it-works.png` });
  client.stdin.write("stop\n");
  await page.getByRole("button", { name: /Go to overview/ }).click();
  await page.getByText("Finish setting up").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/setup-7-overview.png`, fullPage: false });
  log("overview shows the checklist");
  console.log("client:", clientOut.split("\n").filter(Boolean).slice(-3).join(" | "));
} finally {
  proxy.stdin.write("shutdown\n");
  await new Promise((r) => proxy.on("close", r));
  await browser.close();
  console.log(consoleText.split("\n").filter((l) => /Cloud|dashboard|Gero_Test|disconnect/i.test(l)).slice(-8).join("\n"));
}
