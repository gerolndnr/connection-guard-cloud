import { Hono } from "hono";
import type { AppEnv, Env } from "./env.ts";
import { plugin } from "./plugin.ts";
import { auth } from "./auth.ts";
import { dashboard } from "./dashboard.ts";
import { scheduled } from "./cron.ts";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  await next();
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "strict-origin-when-cross-origin");
  if (c.req.path.startsWith("/api/")) c.header("cache-control", "no-store");
});

app.route("/", plugin);
app.route("/api/auth", auth);
app.route("/api", dashboard);
app.get("/v1/health", (c) => c.json({ ok: true }));
app.notFound((c) => (c.req.path.startsWith("/api/") || c.req.path.startsWith("/v1/")
  ? c.json({ error: "not_found" }, 404)
  : c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text("Not found", 404)));
app.onError((err, c) => {
  console.error("unhandled", err);
  return c.json({ error: "internal", retry_in: 60 }, 500);
});

export default {
  fetch: app.fetch,
  scheduled: (controller: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(scheduled(controller, env)),
} satisfies ExportedHandler<Env>;
