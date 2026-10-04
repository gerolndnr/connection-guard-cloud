# Deploy

Everything stays on the Cloudflare **Workers Free** plan. Never enable Workers Paid or any auto-upgrade; see `docs/CAPACITY.md`.

## Current production

| Resource | Value |
| --- | --- |
| Worker | `connection-guard-cloud-production` |
| Domains | `app.connectionguard.net` (dashboard), `api.connectionguard.net` (plugin API), both Workers custom domains |
| D1 | `cg` (`7bbde5b7-6de2-47ed-950d-af22f2ad9030`), EU jurisdiction |
| KV | `connection-guard-cloud-public` (`c601f9f0de2649419283c89e0be54ec3`) |
| Secrets | `CONFIG_SECRET_KEY` (set). Still needed: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` |
| Website | `connection-guard-site` (static assets, `connectionguard.net`) and `connection-guard-www` (301 from `www.` to the apex) |
| Analytics | PostHog EU, off until `POSTHOG_KEY` (API) and `PUBLIC_POSTHOG_KEY` (site) are set; see `docs/ANALYTICS.md` |
| Optional | Turnstile (`TURNSTILE_SITE_KEY` var plus `TURNSTILE_SECRET` secret), Analytics Engine (`METRICS` binding) |

## Discord login (required before anyone can sign in)

1. Create an application at https://discord.com/developers/applications.
2. Under **OAuth2**, add the redirect `https://app.connectionguard.net/api/auth/discord/callback`. Only the `identify` scope is used.
3. Store both values as Worker secrets; no redeploy needed:
   ```bash
   cd apps/api
   npx wrangler secret put DISCORD_CLIENT_ID --env production
   npx wrangler secret put DISCORD_CLIENT_SECRET --env production
   ```

## Optional hardening

- **Turnstile on the link page:**
  1. Create a widget for `app.connectionguard.net`.
  2. Put its site key into `env.production.vars.TURNSTILE_SITE_KEY`.
  3. Run `npx wrangler secret put TURNSTILE_SECRET --env production`, then redeploy.

  Without it, linking still requires a Discord sign-in and a single-use, 24-hour code.
- **Analytics Engine** (product metrics only; the dashboard reads D1):
  1. Enable it once in the Cloudflare dashboard (Workers & Pages > Analytics Engine).
  2. Restore the `analytics_engine_datasets` line in `wrangler.jsonc` and redeploy.
- **Email Routing:** forward `support@` and `privacy@connectionguard.net` to the owner's mailbox.

## Deploy a new version

```bash
pnpm install && pnpm -r typecheck && pnpm -r test
pnpm --filter @cg/web build
cd apps/api
npx wrangler d1 migrations apply cg --remote --env production
npx wrangler deploy --env production
```

## Announcements in the dashboard

A banner for every dashboard user, for maintenance, incidents or (per the AVV, 30 days ahead) new sub-processors. Users can dismiss it; a new `id` shows again.

```bash
cd apps/api
npx wrangler kv key put announcement '{"id":"2026-10-maintenance","tone":"info","text":"Maintenance on 12 October, 20:00–20:30 UTC. Logins are not affected.","url":"https://connectionguard.net"}' --binding PUBLIC --env production --remote
npx wrangler kv key delete announcement --binding PUBLIC --env production --remote
```

`tone` is `info`, `warn` or `danger`. The API caches the value for a minute.

## Website (connectionguard.net)

Astro 7 needs Node 22.12 or newer. The build reads download counts from Modrinth, Spiget, GitHub and Hangar, so rebuild to refresh them.

```bash
cd apps/site
pnpm build                       # fetches stats, then builds dist/
npx wrangler deploy              # connectionguard.net
cd www && npx wrangler deploy    # www → apex redirect, only needed when it changes
```

Social images and icons are committed; regenerate them with `node scripts/site-images.mjs` after changing page titles there. Check every page with `node scripts/site-seo-check.mjs` against `astro preview --port 4330`.

After the first deploy: verify the domain in Google Search Console and Bing Webmaster Tools and submit `https://connectionguard.net/sitemap-index.xml`.

## Before public launch

- The legal texts in `docs/LEGAL.md` are published and reviewed.
- Plugin listings (Modrinth, Hangar, Spigot) disclose the opt-out data flow; see `connection-guard/docs/CLOUD.md`.
- The plugin release that contains the cloud link is published (branch `codex/cloud-dashboard` in the plugin repo).
