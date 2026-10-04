# Connection Guard Cloud

The optional, open-source dashboard for [Connection Guard](https://github.com/gerolndnr/connection-guard), the free anti-VPN and country-rules plugin for Spigot/Paper, BungeeCord and Velocity. Hosted at **app.connectionguard.net**, self-hostable, running entirely on Cloudflare.

- **Link and set up a server in two minutes.** Start the server, open the link from the console, sign in with Discord, answer three questions, then join once to see your own check arrive.
- **See everything in one register:**
  - every check, with the reason behind it
  - refused and "would refuse" entries
  - provider health and quota
  - countries and latency, over 24 hours to 90 days
- **Never in the login path.** The plugin talks to the cloud from a background thread. Logins never wait for it.

## Layout

| Path | What |
| --- | --- |
| `packages/protocol` | Plugin protocol v1 as zod schemas, examples and fixtures shared with the Java plugin's contract tests. |
| `apps/api` | One Cloudflare Worker (Hono), with three parts: the plugin API (`/v1/*`), the dashboard API (`/api/*`, Discord OAuth sessions) and cron jobs. Data lives in D1, Workers KV and Analytics Engine. |
| `apps/web` | The dashboard: React + Vite + Tailwind, served as Workers Static Assets. Design system in `DESIGN.md`. |
| `scripts/` | `seed-demo.mjs` fills a local backend with synthetic data. `capture.mjs` and `capture-settings.mjs` take review screenshots. `e2e-setup.mjs` drives a real Velocity proxy through linking, the setup assistant and a test login. |

## Develop

```bash
pnpm install
pnpm --filter @cg/web build
pnpm --dir apps/api exec wrangler d1 migrations apply cg --local --persist-to .wrangler/state
pnpm --dir apps/api exec wrangler dev --local --persist-to .wrangler/state --port 8788 --var APP_ORIGIN:http://localhost:8788
node scripts/seed-demo.mjs
```

Open http://localhost:8788. On localhost the sign-in page offers a dev login; it is refused anywhere else.

To point a real plugin at it, set `cloud.endpoint: "http://127.0.0.1:8788"` in its `config.yml`.

## Test

```bash
pnpm -r typecheck
pnpm -r test
```

API tests run inside workerd with real D1 and KV bindings (`@cloudflare/vitest-pool-workers`).

## Docs

- [docs/DEPLOY.md](docs/DEPLOY.md): one-time Cloudflare and Discord setup and the production deploy.
- [docs/CAPACITY.md](docs/CAPACITY.md): how the free-plan budget is enforced.
- [docs/LEGAL.md](docs/LEGAL.md): texts that must exist before public launch.

## License

AGPL-3.0-only. The Connection Guard plugin itself stays MIT.
