---
version: 1
slug: "apps-site"
primary_target: "apps/site"
related_targets: []
---

# Surface: connectionguard.net website (apps/site)

Mode: Persuade. Audience: Minecraft server operators, hobby admins first. Action: Download free (choice of Modrinth, Spigot, Hangar, GitHub). Pages: landing, /download, /privacy. Proof allowed: live download counts (fetched at build, dated), factual category comparison, interactive dashboard preview with labeled example data, open-source transparency. No testimonials, no invented numbers, no named-competitor claims; the dashboard is labeled "coming with 0.5" until that plugin release ships.

## Direction contract

THESIS: The honest comparison. Operators compare anyway, so the page leads with a checkable table (Connection Guard vs a typical paid plugin vs a typical hosted service) and then proves each row with the real thing. Refuses the category default of hero + logo wall + icon-card feature grid.

OWN-WORLD: Inherits DESIGN.md: neutral grayscale on white/#fafafa (dark #000/#0a0a0a), 1px hairlines, emerald as the only brand color, Geist Sans with tabular numerals, Geist Mono for console lines, IPs and config. No logo, wordmark only. Persuade allowance: larger display type (up to 4.5rem), one full-bleed dark band for the dashboard preview in light mode.

STORY: A visitor reads what it is in one line, sees real usage numbers, scans a table that answers "why this one", watches the dashboard explain a decision, sees setup is four steps, trusts the open source, downloads.

FIRST VIEWPORT: Left: headline "Keep VPN alts off your Minecraft server.", one-sentence subline, Download free (primary) and "How it compares" (secondary), a quiet facts line (MIT, no account, Paper/BungeeCord/Velocity). Right: a live download card with the four platform counts and a dated total. The comparison table starts just below the fold line.

FORM: Surface structure "The honest comparison", dealt lead of seed 68b7dca3 (own list position 5). Code-led. Signature interaction: the dashboard preview receives a new example decision every few seconds (row settles in), and clicking any row opens its plain-English "why".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
