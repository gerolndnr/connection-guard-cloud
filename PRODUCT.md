# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite + TypeScript SPA (`apps/web`), Tailwind CSS, served by Cloudflare Workers Static Assets on `app.connectionguard.net`. API in the same Worker (`apps/api`, Hono, D1). Decided in the approved cloud plan (`delivery/cloud-dashboard-plan.md` in the operations workspace). Strictly Cloudflare Free plan.

## Users

Primary: the hobby admin of a small Minecraft server (one or two servers, Spigot/Paper, BungeeCord or Velocity). Little time, little security background. They installed Connection Guard to keep VPN/proxy alts and griefers out and want two answers fast: "Is everything working?" and "Who was blocked, and why?" Every design decision optimizes for this person.

Secondary: network operators with a proxy, several backends and a small staff team. They get depth on demand, never at the cost of the primary user's clarity.

## Product Purpose

Connection Guard Cloud is the optional hosted dashboard for the free, open-source Connection Guard plugin. It makes setup trivial (install JAR, click the link from the console, sign in with Discord) and then shows the useful statistics persistently: logins checked, connections denied, VPN detections, countries, provider health and quota, lookup latency, warnings, and a searchable decision log with the reason behind every decision.

Success: an operator links a server in under two minutes and understands their server's state at a glance on every later visit.

## Positioning

Competitors with panels (v4Guard, Jarvis AntiVPN, santivpn) run their own closed detection service. Connection Guard stays an open-source plugin where the operator chooses providers and owns the decision; the cloud is an optional, open-source (AGPL), self-hostable window onto that, never a dependency. Logins never wait on the cloud. Every decision is explainable.

## Operating Context

- The link starts in a server console or in-game chat (`/cg cloud link`), usually on a desktop next to the server panel (Pterodactyl, a host panel, SSH).
- Operators come back when something feels off: a player says they cannot join, a raid, a provider quota warning, a Discord alert.
- Plugin modes: OBSERVE (logs only, the default after install) and ENFORCE (actually denies). Moving from OBSERVE to ENFORCE is the key activation step.
- Login is Discord OAuth only.

## Capabilities and Constraints

- English only UI (decided 2026-10-03). No i18n for now.
- Data: before linking only anonymous aggregates; after linking and DPA acceptance full decision events (IP, trusted UUID, verdict, reasons, provider votes, country/ASN). Raw events kept 30 days, hourly aggregates 13 months, stored in the EU. Player names are not available.
- Terminology: "network" (a group of servers owned by a team), "server" (one plugin install), "link code", "decision", "denied connection" (never "prevented attack"), "provider", "OBSERVE / ENFORCE".
- Roles: owner, admin, viewer.
- Phase 1 surfaces: link page, network overview (KPIs, charts 24h/7d/30d/90d, servers, provider health, warnings), decision log with filters and a "why" panel. Setup wizard, remote actions, live view, teams and alerts come in later phases.
- Free-plan limits mean data refreshes on the server-chosen sync interval (60 s to minutes), not in real time.

## Brand Commitments

- Name "Connection Guard", set as a wordmark. The shield logo is **not** used in the dashboard (decided 2026-10-03).
- Standing visual preference (2026-10-03): classic modern SaaS, the category standard executed at full fidelity. Craft bar: **Vercel's dashboard**. Accent color **emerald green**, no brand blue. Light and dark theme, following the system, with a toggle.
- The earlier "Gate Register" ledger world was rejected by the owner as old-fashioned; do not bring back paper, stamps or ledger metaphors.
- Claims only what is tested. No accuracy, DDoS or market-leadership claims. No fabricated numbers, reviews or reference logos.

## Evidence on Hand

- Real plugin usage: ~40 Spigot and ~5 BungeeCord reporting instances (bStats, 2026-10-02). No dashboard users yet.
- No testimonials, case studies or screenshots of the dashboard exist. Synthetic demo data must be labeled as such.

## Product Principles

1. Answer "is everything OK?" before anything else; detail is one click away, never in the way.
2. Every number explains itself: a denied connection always shows its reason and the evidence behind it.
3. Calm by default, loud only when action is needed (provider down, quota running out, enforcement off).
4. The operator stays in control: the cloud observes and suggests; it is optional and never blocks a login.
5. Privacy is visible: what is stored, for how long, and how to delete it is never hidden.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Status is never conveyed by color alone (OBSERVE/ENFORCE, allow/deny, provider health). Keyboard reachable decision log and drawer.
