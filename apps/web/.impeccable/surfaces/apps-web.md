---
version: 1
slug: "apps-web"
primary_target: "apps/web"
related_targets: []
---

# Surface: Connection Guard Cloud dashboard (apps/web)

Mode: Operate. Audience: hobby admin of a small Minecraft server (see PRODUCT.md). Job: link a server in under two minutes; on every visit answer "is everything OK?" and then "who was refused, and why?".

Surfaces: `/` (sign-in / network list), `/link/:code`, `/n/:id` overview, `/n/:id/register` decisions with filters and the "why" sheet.

## Direction contract

THESIS: The category standard, played straight at Vercel's craft level: a calm, precise, monochrome product with one emerald accent, where status reads before numbers. Replaces the rejected "Gate Register" ledger world entirely.

OWN-WORLD: Neutral grayscale on white (light) and #0a0a0a (dark); 1px hairline borders, 8px card radius, 6px controls. Emerald is the only brand color (primary actions, focus, "admitted" marks, healthy status). Status: red for refused, amber for would-refuse/attention, all with icon and label. Geist Sans for UI, Geist Mono for IPs, UUIDs, numbers in tables. No logo; wordmark only.

STORY: Open overview, read the status line ("All systems normal" or what needs attention), scan the four KPI cards and the chart, check the latest decisions, open one to see why. The OBSERVE→ENFORCE step is a clear, quiet callout.

FIRST VIEWPORT: Sticky top bar: wordmark, breadcrumb network / server switcher (popover select), theme toggle, avatar. Tabs Overview / Decisions. Page header with title and range segmented control. Status banner. Four KPI cards (Checked, Refused, Would refuse or Errors, VPN rate) plus a compact latency/cache line. Chart card full width left, right rail: Needs attention, Providers with quota bars. Below: latest decisions table, servers table, countries and reasons.

FORM: Canon (standing exit taken in plain words by the owner on 2026-10-03), reference product Vercel. No seed key.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
