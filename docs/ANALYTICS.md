# Product analytics (PostHog)

One PostHog project in the **EU cloud** receives data from three places. Every event carries `surface`: `site`, `dashboard` or `api`.

| Surface | Mode | Identity | Records |
| --- | --- | --- | --- |
| connectionguard.net (`apps/site`) | `cookieless_mode: "always"`, `person_profiles: "never"` | Daily-rotating server-side hash; no profile | Pageviews, page leave and scroll depth, autocapture, dead clicks, web vitals, script errors, explicit events below |
| app.connectionguard.net (`apps/web`) | `persistence: "memory"` (no cookies, no storage) | Random dashboard user ID (`usr_…`), bootstrapped at load; group `network` (`net_…`) | Pageviews, autocapture, dead clicks, heatmaps, web vitals, errors, session replay with **all text and inputs masked**, explicit events below |
| API Worker (`apps/api`) | Server-side `/batch/`, sent after the response (`waitUntil`) | `usr_…` for people, `ins_…` for servers (no person profile) | Lifecycle events below, daily active-server count |

Analytics is off when no key is configured, in tests, with Global Privacy Control or Do Not Track, and after the operator opts out in the dashboard (avatar menu, "Share usage data").

## Never sent

Player IP addresses, player UUIDs, player names, Discord names or IDs, API keys, webhook URLs, setting values, search text, link codes.

Four layers keep it that way:

1. Elements with player data carry `ph-no-capture`: the decisions table, the decision panel, exemption tag inputs, secret fields, the setup proof card, the account name and the avatar.
2. Session replay masks every text node and input (`maskTextSelector: "*"`, `maskAllInputs`) and blocks `.ph-no-capture` elements.
3. `before_send` runs `scrubEventProperties` from `@cg/protocol/scrub`. It replaces IPv4/IPv6 addresses, UUIDs and link codes in every property except PostHog's own random IDs. It also normalizes dashboard URLs to `/n/:network/…`.
4. The API sends only categories and counts. `settings_saved` lists which fields changed, never their values.

## Content blockers

Events go through our own proxy host, which blocklists don't name. PostHog normally lazy-loads its extensions under fixed file names, and EasyPrivacy blocks some of those by name: `/posthog-recorder.js`, `/dead-clicks-autocapture.js`, and any script from a `posthog.` host. So both apps load `posthog-js/dist/module.no-external`, which never loads scripts by itself, and bundle the extensions they use into one neutrally named chunk: `apps/site/src/lib/runtime.ts` and `apps/web/src/runtime.ts`. The dashboard build also names chunks by hash only. People who block our proxy domain itself are not counted, by their choice.

`scripts/dashboard-analytics-check.mjs` and `scripts/site-analytics-check.mjs` block those file names the way uBlock does, fail if any script loads from PostHog, and intercept every PostHog request in a real browser. They fail on IPs, player UUIDs, the account name, browser storage or events after opting out.

## Events

Custom events are sent with a `cg_` prefix (`cg_download_clicked`, `cg_server_linked`, …); the tables list them without it. PostHog's own events (`$pageview`, …) keep their names. The website events follow the plan in the workspace `ANALYTICS.md` (`cg_download_clicked` with `destination`, `cg_install_guide_opened` with `platform`, `cg_support_clicked` with `channel`); page views use PostHog's `$pageview` so web analytics works.

### Website

| Event | Properties |
| --- | --- |
| `$pageview`, `$pageleave`, `$autocapture`, `$dead_click`, `$web_vitals`, `$exception` | standard |
| `cta_clicked` | `cta` (download, compare), `location` (nav, hero, closing, platform_*, guide_end), `page` |
| `download_clicked` | `destination` (modrinth, hangar, spigotmc, github), `location` (download_page, hero_stats, footer), `page` |
| `support_clicked` | `channel` (discord, github), `location` |
| `install_guide_opened` | `platform` (velocity, bungeecord, paper), on platform pages |
| `guide_opened` | `guide` (slug) |
| `compare_proof_clicked` | `row` |
| `faq_opened` | `question`, `page` |

### Dashboard (client)

| Event | Properties |
| --- | --- |
| `sign_in_clicked` | `method` |
| `link_page_viewed`, `link_page_invalid` | `platform`, `source` (console, join, command, unknown: the `?src=` the plugin appends) |
| `link_claimed`, `link_claim_failed` | `source`, `new_network`, `server_named`, `platform` / `error` |
| `setup_step_viewed` | `step` (goals, providers, mode, apply, verify), `platform` |
| `setup_finished` | `vpn`, `providers[]`, `keys_entered`, `votes`, `country_mode`, `countries` (count), `mode`, `platform` |
| `setup_applied`, `setup_rejected`, `setup_already_configured` | `seconds`, `mode` |
| `setup_verified`, `setup_verify_skipped` | `seconds`, `local_ip` |
| `decision_opened` | `outcome`, `reason`, `mode` |
| `decisions_filtered`, `decisions_searched` | `filter` (never the search text) |
| `range_changed` | `range` |
| `issue_dismissed` | `kind`, `tone` |
| `theme_changed` | `theme` |
| `decision_fix` | `fix` (allow-player, allow-ip, trust-asn, block-player, block-ip, recheck), `verdict` |
| `overview_stats_opened`, `network_exported`, `account_exported`, `invite_joined` | none |

### API (server)

| Event | Distinct ID | Properties |
| --- | --- | --- |
| `plugin_installed` | `ins_…` | `platform`, `platform_version`, `plugin_version`, `java_major`, `via_network_token` |
| `user_signed_up`, `user_signed_in` | `usr_…` | `method` |
| `server_linked` | `usr_…` + group | `new_network`, `platform`, `plugin_version`, `minutes_since_install`, `server_named` |
| `first_decisions_received` | `ins_…` + group | `platform`, `plugin_version`, `mode`, `minutes_since_install`, `decisions` |
| `settings_saved` | `usr_…` + group | `fields[]`, `field_count`, `secret_fields`, `apply_to`, `servers`, `mode` |
| `settings_applied`, `settings_rejected` | `ins_…` + group | `version`, `reset` / `message` (scrubbed, 160 chars) |
| `settings_reset`, `server_unlinked`, `server_renamed`, `network_token_created` | `usr_…` + group | none |
| `rule_added`, `rule_removed`, `recheck_requested` | `usr_…` + group | `effect`, `scope`, `kind` (player, ip, range, asn), `servers` (never the target) |
| `invite_created`, `invite_accepted` | `usr_…` + group | `role` |
| `alerts_saved` | `usr_…` + group | `kinds[]`, `webhook` (set or not, never the URL) |
| `network_deleted`, `account_deleted` | `usr_…` (+ group) | `networks_deleted` |
| `server_active_daily` | `ins_…` + group | `platform`, `plugin_version`, `mode`, `linked` |
| `$groupidentify` (daily) | network | `active_servers`, `enforcing_servers`, `platforms[]`, `plugin_versions[]` |

The activation funnel: `plugin_installed` → `server_linked` → `setup_finished` → `settings_applied` → `first_decisions_received`. These events have different distinct IDs (server or account), so funnels aggregate by the `install_id` property, which every one of them carries. Events in a network also carry `network_id` as a plain property: group analytics is a paid add-on, and on the free plan the `$groups` sent alongside are not analysed.

## Setup

1. Create a project in **PostHog EU** (eu.posthog.com).
2. Under Project settings → Web analytics, enable **Cookieless server hash mode**. The website needs it; without it, its events are dropped.
3. Under Session replay, enable recordings. The masking lives in the client config and needs no change in PostHog.
4. Managed reverse proxy (keeps ad blockers from dropping events): **`t.connectionguard.net`**, CNAME in Cloudflare DNS as **DNS only**. It is the host for all three surfaces.
5. Put the project token (`phc_…`, public by design) in two places:
   - `apps/api/wrangler.jsonc` → `env.production.vars.POSTHOG_KEY` and `POSTHOG_HOST`. The dashboard reads both from `/api/config`.
   - `apps/site/.env.production` → `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST`.

Current production: project **Connection Guard** (EU, ID 293337), host `https://t.connectionguard.net`, cookieless server hash mode on, session replay on (console logs off in the dashboard client).
6. Deploy the API and rebuild and deploy the site (see `DEPLOY.md`).

## Reading the data with Claude Code

Either add the PostHog MCP server (`claude mcp add` with the URL from PostHog's MCP docs), or create a personal API key with read access and export it as `POSTHOG_PERSONAL_API_KEY` in your shell. The key stays out of the repository and the chat.

## Checking locally

```bash
# Website: build with a placeholder key, then run the check against astro preview on port 4330
PUBLIC_POSTHOG_KEY=phc_localtest pnpm --filter @cg/site exec astro build
node scripts/site-analytics-check.mjs

# Dashboard: local API with a placeholder key and demo data on port 8788
cd apps/api && npx wrangler dev --local --port 8788 --var POSTHOG_KEY:phc_localtest
node scripts/seed-demo.mjs && node scripts/dashboard-analytics-check.mjs
```

PostHog ignores automated browsers, so both checks present a regular Chrome user agent and hide `navigator.webdriver`.
