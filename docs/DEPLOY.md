# Deploy

Everything stays on the Cloudflare **Workers Free** plan. Never enable Workers Paid or any auto-upgrade; see `docs/CAPACITY.md`.

## One-time setup (account owner)

1. **Zone.** Add `connectionguard.net` to Cloudflare and switch the registrar's nameservers to Cloudflare.
2. **Email Routing.** Forward `support@` and `privacy@connectionguard.net` to the owner's mailbox.
3. **D1 in the EU.**
   ```bash
   pnpm --dir apps/api exec wrangler d1 create cg --jurisdiction eu
   ```
   Put the printed `database_id` into `apps/api/wrangler.jsonc` under `env.production.d1_databases`.
4. **KV.**
   ```bash
   pnpm --dir apps/api exec wrangler kv namespace create PUBLIC
   ```
   Put the id into `env.production.kv_namespaces`.
5. **Analytics Engine.** The dataset `cg_sync` is created on first write. Nothing to do.
6. **Turnstile.** Create a widget for `app.connectionguard.net` in "Managed" mode. Put the site key into `env.production.vars.TURNSTILE_SITE_KEY`, then:
   ```bash
   pnpm --dir apps/api exec wrangler secret put TURNSTILE_SECRET --env production
   ```
7. **Discord application.**
   1. Create it at https://discord.com/developers/applications.
   2. Under OAuth2, add the redirect `https://app.connectionguard.net/api/auth/discord/callback`. Only the `identify` scope is used.
   3. Put the client ID into `env.production.vars.DISCORD_CLIENT_ID`, then:
      ```bash
      pnpm --dir apps/api exec wrangler secret put DISCORD_CLIENT_SECRET --env production
      ```
8. **Workers Builds** (optional). Connect the GitHub repo in the Cloudflare dashboard with:
   - build command: `pnpm install && pnpm --filter @cg/web build`
   - deploy command: `pnpm --dir apps/api exec wrangler deploy --env production`

## Deploy

```bash
pnpm install && pnpm -r typecheck && pnpm -r test
pnpm --filter @cg/web build
pnpm --dir apps/api exec wrangler d1 migrations apply cg --remote --env production
pnpm --dir apps/api exec wrangler deploy --env production
```

The `custom_domain` routes create `app.` and `api.connectionguard.net` automatically.

## Before public launch

- The legal texts in `docs/LEGAL.md` are published and reviewed.
- Plugin listings (Modrinth, Hangar, Spigot) disclose the opt-out data flow; see `connection-guard/docs/CLOUD.md`.
- `/v1/health` answers, and a fresh plugin install prints a working link.
