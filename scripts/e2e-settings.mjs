// End-to-end: real Velocity + plugin. Saves a setting and checks the save bar through "waiting" and
// "applied", then dismisses and restores an attention note on the overview.
// Usage: node scripts/e2e-settings.mjs <velocity-fixture-dir> <screenshot-dir> [server name, default "Creative"]
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
const [e2eDir, out, serverName = "Creative"] = process.argv.slice(2);
const base = "http://localhost:8788";
const java = (await new Promise((r) => { const p = spawn("/usr/libexec/java_home", ["-v", "21"]); let o = ""; p.stdout.on("data", (d) => (o += d)); p.on("close", () => r(o.trim())); })) + "/bin/java";
const proxy = spawn(java, ["-Xmx256m", "-Dterminal.jline=false", "-jar", "velocity.jar"], { cwd: e2eDir });
const b = await chromium.launch({ channel: "chrome" });
const t0 = Date.now(); const log = (m) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
let failed = false;
try {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" })).newPage();
  await p.request.post(`${base}/api/auth/dev-login`, { data: { name: "Demo Operator" }, headers: { origin: base } });
  await p.goto(`${base}/`); await p.waitForURL(/\/n\//);
  const net = new URL(p.url()).pathname.split("/")[2];
  const view = await (await p.request.get(`${base}/api/networks/${net}`)).json();
  const server = view.installs.filter((i) => i.name === serverName).sort((a, b) => b.created_at - a.created_at)[0];
  const startedAt = Date.now();
  for (let i = 0; i < 60; i++) {
    const c = await (await p.request.get(`${base}/api/installs/${server.id}/config`)).json();
    if (c.last_seen_at > startedAt && !c.pending) break;
    await p.waitForTimeout(2000);
  }
  log("proxy checked in");
  await p.goto(`${base}/n/${net}/settings?server=${server.id}`);
  await p.getByRole("heading", { name: "Protection mode" }).waitFor({ timeout: 60_000 });
  const ipapi = p.getByRole("switch", { name: "Use IP-API" });
  const wasOn = await ipapi.getAttribute("aria-checked");
  await ipapi.click();
  await p.getByRole("button", { name: "Save and apply" }).click();
  await p.getByText(new RegExp(`Waiting for ${serverName} to apply it`)).waitFor({ timeout: 10_000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${out}/savebar-waiting.png` });
  log("save bar: waiting; 'unsaved change' gone: " + ((await p.getByText(/unsaved change/).count()) === 0));
  await p.getByText(`Applied on ${serverName}.`).waitFor({ timeout: 60_000 });
  await p.screenshot({ path: `${out}/savebar-applied.png` });
  log("save bar: applied");
  await p.waitForTimeout(7000);
  log("applied bar hid itself: " + ((await p.getByText(`Applied on ${serverName}.`).count()) === 0) + "; IP-API " + wasOn + " -> " + (await ipapi.getAttribute("aria-checked")));
  await p.goto(`${base}/n/${net}`); await p.locator("#att-h").waitFor(); await p.waitForTimeout(800);
  const rail = p.locator("#attention-rail");
  const before = await rail.locator("li").count();
  await rail.getByRole("button", { name: /^Dismiss:/ }).first().click();
  await p.waitForTimeout(300);
  const after = await rail.locator("li").count();
  await p.screenshot({ path: `${out}/attention-dismissed.png` });
  await p.reload(); await p.locator("#att-h").waitFor(); await p.waitForTimeout(800);
  log(`attention notes: ${before} -> ${after} after dismiss, ${await rail.locator("li").count()} after reload`);
  await rail.getByRole("button", { name: /Show \d+ dismissed/ }).click(); await p.waitForTimeout(300);
  log("after 'show dismissed': " + (await rail.locator("li").count()));
} catch (e) { failed = true; console.error(e.message); }
finally {
  proxy.stdin.write("shutdown\n"); await new Promise((r) => proxy.on("close", r)); await b.close();
  process.exit(failed ? 1 : 0);
}
