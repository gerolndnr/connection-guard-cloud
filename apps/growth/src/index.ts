// Growth worker: every morning a mail with the bStats numbers of Connection Guard and the other products in
// mc-antivpn-bench. Stateless: bStats keeps more than 30 days of half-hourly points, so nothing is stored here.
// Mail goes out through Cloudflare Email Routing (send_email binding), which only delivers to verified addresses.
import { EmailMessage } from "cloudflare:email";
import { PRODUCTS } from "./products";
import { mime } from "./mail";
import { paused } from "./pause";
import { buildRows, render, type ProjectData, type Report, type Series } from "./report";

export interface Env {
  MAIL: SendEmail;
  MAIL_FROM: string;
  MAIL_TO: string;
  /** Optional secret: with it, POST /run sends the mail now and GET /preview shows it (Authorization: Bearer <token>). */
  RUN_TOKEN?: string;
  /** Optional "YYYY-MM-DD": no morning mail before that UTC day; POST /run still sends. */
  PAUSE_UNTIL?: string;
}

const UA = "ConnectionGuardGrowth/1.0 (+https://github.com/gerolndnr/connection-guard)";
const POINTS = 1500; // 31 days of half-hourly points, enough for the 30-day comparison

async function chart(id: number, name: "servers" | "players"): Promise<Series | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://bstats.org/api/v1/plugins/${id}/charts/${name}/data?maxElements=${POINTS}`, {
        headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data: unknown = await res.json();
        if (Array.isArray(data) && data.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) {
          return data as Series;
        }
        return null; // a shape we do not understand: report it as missing rather than guess
      }
      if (res.status === 404) return null;
    } catch { /* timeout or network: retry */ }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return null;
}

export async function collect(): Promise<ProjectData[]> {
  const ids = PRODUCTS.flatMap((p) => p.projects.map((x) => x.id));
  // 17 projects × 2 charts stays well under the 50 subrequests of the Workers Free plan.
  return Promise.all(ids.map(async (id) => ({ id, servers: await chart(id, "servers"), players: await chart(id, "players") })));
}

export async function report(now = Date.now()): Promise<Report> {
  const data = await collect();
  const latest = Math.max(0, ...data.flatMap((d) => d.servers?.map(([ts]) => ts) ?? []));
  if (!latest) {
    const text = "bStats did not answer for any project this morning (three attempts each). The next report comes tomorrow.";
    return { subject: "Growth: bStats unavailable", text, html: `<p>${text}</p>` };
  }
  // Measure up to bStats' newest point, so a late refresh on their side does not read as a drop.
  return render(buildRows(data, Math.min(latest, now)), Math.min(latest, now));
}

async function send(env: Env) {
  const r = await report();
  await env.MAIL.send(new EmailMessage(env.MAIL_FROM, env.MAIL_TO, mime(env, r)));
  return r;
}

const authorized = (req: Request, env: Env) =>
  !!env.RUN_TOKEN && req.headers.get("Authorization") === `Bearer ${env.RUN_TOKEN}`;

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (paused(env.PAUSE_UNTIL, Date.now())) { console.log("paused until", env.PAUSE_UNTIL); return; }
    ctx.waitUntil(send(env).then((r) => console.log("sent", r.subject)));
  },
  async fetch(req: Request, env: Env) {
    const { pathname } = new URL(req.url);
    if (!authorized(req, env)) return new Response("Not found", { status: 404 });
    if (req.method === "POST" && pathname === "/run") {
      const r = await send(env);
      return Response.json({ sent: true, subject: r.subject });
    }
    if (req.method === "GET" && pathname === "/preview") {
      return new Response((await report()).html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  },
};
