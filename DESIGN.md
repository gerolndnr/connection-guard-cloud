---
name: Connection Guard Cloud
description: The hosted dashboard for the Connection Guard plugin. Status first, then the numbers, then the reason behind every decision.
colors:
  emerald: "#059669"
  emerald-deep: "#047857"
  emerald-wash: "#ecfdf5"
  emerald-dark: "#10b981"
  emerald-dark-text: "#34d399"
  emerald-dark-ink: "#04130d"
  page: "#fafafa"
  surface: "#ffffff"
  subtle: "#f4f4f5"
  line: "#ebebeb"
  line-strong: "#d4d4d8"
  ink: "#0a0a0a"
  ink-2: "#52525b"
  ink-3: "#71717a"
  page-dark: "#000000"
  surface-dark: "#0a0a0a"
  subtle-dark: "#161616"
  line-dark: "#1f1f1f"
  line-strong-dark: "#2e2e2e"
  ink-dark: "#ededed"
  ink-2-dark: "#a1a1a1"
  ink-3-dark: "#8f8f8f"
  refused: "#dc2626"
  refused-text: "#b91c1c"
  refused-wash: "#fef2f2"
  refused-dark: "#e5484d"
  refused-dark-text: "#ff6369"
  caution: "#d97706"
  caution-text: "#b45309"
  caution-wash: "#fffbeb"
  caution-dark: "#f5a524"
  caution-dark-text: "#f5b84a"
  discord-blurple: "#5865f2"
  discord-blurple-hover: "#4752c4"
typography:
  headline:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  metric:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\" 1"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  wordmark:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"ss01\" 1"
  label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "0.92em"
    fontWeight: 400
  site-display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 5.2vw, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  site-section-title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3.2vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  site-lede:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  site-prose:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  inline: "4px"
  control: "6px"
  card: "8px"
  sheet: "12px"
  frame: "16px"
  pill: "999px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  page-x: "24px"
  container: "1200px"
  site-container: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.emerald-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-primary-dark:
    backgroundColor: "{colors.emerald-dark}"
    textColor: "{colors.emerald-dark-ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.subtle}"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
  button-discord:
    backgroundColor: "{colors.discord-blurple}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "40px"
  button-discord-hover:
    backgroundColor: "{colors.discord-blurple-hover}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  segmented:
    backgroundColor: "{colors.subtle}"
    rounded: "{rounded.card}"
    padding: "2px"
  segmented-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "28px"
  badge-admitted:
    backgroundColor: "{colors.emerald-wash}"
    textColor: "{colors.emerald-deep}"
    rounded: "{rounded.pill}"
    typography: "{typography.caption}"
    height: "22px"
    padding: "0 8px"
  badge-refused:
    backgroundColor: "{colors.refused-wash}"
    textColor: "{colors.refused-text}"
    rounded: "{rounded.pill}"
    height: "22px"
    padding: "0 8px"
  badge-would-refuse:
    backgroundColor: "{colors.caution-wash}"
    textColor: "{colors.caution-text}"
    rounded: "{rounded.pill}"
    height: "22px"
    padding: "0 8px"
  badge-neutral:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    height: "22px"
    padding: "0 8px"
  table-row:
    height: "44px"
    padding: "0 12px"
  button-primary-lg:
    backgroundColor: "{colors.emerald-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "0 20px"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    typography: "{typography.caption}"
    padding: "0 10px"
    height: "24px"
  chip-soon:
    backgroundColor: "{colors.emerald-wash}"
    textColor: "{colors.emerald-deep}"
    rounded: "{rounded.pill}"
    typography: "{typography.caption}"
    padding: "0 10px"
    height: "20px"
---

# Design System: Connection Guard Cloud

## Overview

**Creative North Star: "The Quiet Instrument"**

Connection Guard Cloud plays the modern SaaS dashboard straight, at the craft level of Vercel's dashboard: a neutral grayscale instrument with one emerald accent, where the first thing a hobby server admin sees is whether everything is working, then the numbers, then the reason behind each decision. Nothing is ornamental. Hierarchy comes from type weight, a little negative tracking on headings, and 1px hairlines, not from color or depth.

The density is that of an operator tool: 14px body, 44px table rows, 16px gaps between cards, a 1200px container. Light and dark are equal citizens. The theme follows the system setting, a stored choice overrides it, and a bootstrap script in the document head applies the `.dark` class before first paint so there is no flash. Color carries only state: emerald for admitted or healthy, red for refused or broken, amber for would-refuse, observe mode and attention. Each state always arrives with an icon or a word, never as color alone.

The earlier paper-and-ledger "Gate Register" world was rejected by the owner and is fully retired. Paper, stamps and ledger metaphors do not come back. The product is shown as a wordmark only; the shield logo is not used in the dashboard.

**Key Characteristics:**
- Monochrome grayscale ground with a single emerald brand color.
- Flat cards on a slightly darker page, separated by 1px hairlines.
- Geist Sans for everything people read; Geist Mono only for machine identifiers.
- Status before numbers, and every status has an icon or a label.
- Light and dark themes with equal care, applied before first paint.

## Colors

A neutral zinc-to-black grayscale with one emerald accent and two reserved state hues. Each role has a light and a dark value; the dark set is tuned rather than inverted.

### Primary
- **Signal Emerald** (`emerald`, light; `emerald-dark`, dark): the brand accent. It fills admitted chart columns, healthy status dots and check icons, focus rings, the input caret and the selected link-target radio. A 12% wash of it is the arrival highlight on new decision rows.
- **Deep Emerald** (`emerald-deep`): emerald text on light surfaces (admitted badge, links), and the light-theme primary button fill, paired with white text. In dark, `emerald-dark-text` takes the text role and the primary button fills with `emerald-dark` and near-black `emerald-dark-ink` text.
- **Emerald Wash** (`emerald-wash`; dark: emerald at 12% alpha): the admitted badge ground and the selected radio-card ground.

### Neutral
- **Page Gray / Pure Black** (`page`, `page-dark`): the page ground behind cards. Light uses #fafafa behind #ffffff cards; dark uses #000000 behind #0a0a0a cards. Cards always sit one step lighter than the page.
- **Surface** (`surface`, `surface-dark`): cards, the top bar (at 75-85% opacity with backdrop blur), inputs, secondary buttons, the why sheet and tooltips.
- **Subtle** (`subtle`, `subtle-dark`): hover and selected row fills, the segmented-control track, skeletons, inline code chips, neutral badges, meter tracks.
- **Hairline / Strong Hairline** (`line`, `line-strong` and dark pairs): `line` divides cards, rows and headers; `line-strong` is input and secondary-button strokes, the chart baseline and the breadcrumb slashes.
- **Ink, Ink 2, Ink 3** (`ink`, `ink-2`, `ink-3` and dark pairs): primary text; secondary text, labels and table headers; tertiary metadata, timestamps, placeholders and axis labels.

### State
- **Refused Red** (`refused`, `refused-dark`; text `refused-text`, `refused-dark-text`; wash `refused-wash`, dark at 13% alpha): refused verdicts, refused chart segments, the "needs action" icon, offline servers, paused or failing providers, quota at 80% or more, and load errors.
- **Caution Amber** (`caution`, `caution-dark`; text `caution-text`, `caution-dark-text`; wash `caution-wash`, dark at 12% alpha): would-refuse verdicts, observe-mode badges, the would-refuse chart hatch, and the KPI and reason-list marker dots for would-refuse.

### Third-party
- **Discord Blurple** (`discord-blurple`, hover `discord-blurple-hover`): only on the "Sign in with Discord" button, with the Discord mark. It is Discord's brand, not ours, and appears nowhere else.

### Named Rules
**The One Brand Color Rule.** Emerald is the only brand color. Everything that is not a state is grayscale. Discord blurple is a third-party sign-in exception, never a palette member.

**The Ground Split Rule.** Cards are one step lighter than the page: #ffffff on #fafafa in light, #0a0a0a on #000000 in dark. Do not put cards on a same-tone ground.

**The Never Color Alone Rule.** A state color always comes with an icon, a label or a texture: verdict badges carry an icon and a word, chart segments have a legend and a fixed stacking order, and would-refuse is hatched.

## Typography

**UI Font:** Geist Sans (Geist Variable, with ui-sans-serif, system-ui)
**Mono Font:** Geist Mono (Geist Mono Variable, with ui-monospace, SF Mono, Menlo)

**Character:** One neutral grotesque does all the work at small sizes with stylistic set ss01 on; the mono is reserved for strings a person might copy into a console.

### Hierarchy
- **Headline** (600, 1.5rem, -0.025em): page titles such as "Overview", "Decisions", "Link a server", and the sign-in card title.
- **Metric** (600, 1.75rem, line-height 1, -0.03em, tabular figures): the four KPI values.
- **Title** (500, 0.875rem): card headers, section headings in the why sheet, row primaries.
- **Body** (400, 0.875rem, 1.5): all running text and table cells.
- **Label** (500, 0.8125rem): KPI labels, table headers, tabs, segmented items; 400 weight for secondary metadata at the same size.
- **Caption** (400, 0.75rem): deltas, quota lines, footnotes, chart and badge text.
- **Wordmark** (600, 0.9375rem, -0.01em): "Connection Guard" in the top bar, set in Geist Sans.
- **Mono** (400, 0.92em of context): IPs, player UUIDs, plugin versions, rule IDs, link codes and config snippets.

### Named Rules
**The Tabular Sans Rule.** Numbers in tables, KPIs, chart axes, tooltips and counters use Geist Sans with tabular-nums. Mono is not a number font.

**The Copyable String Rule.** Geist Mono is only for identifiers and config: IPs, UUIDs, versions, rule IDs, link codes and YAML or command snippets.

## Layout

A single centered column, max 1200px, with 16px side padding on mobile and 24px from `sm`; main content starts 32px below the top bar and leaves 96px at the bottom. The top bar is 56px, sticky, with a breadcrumb row (wordmark / network / server switcher, separated by thin slashes) and an underline tab row below it.

The Overview stacks a status card, then a four-up KPI grid (two-up below `lg`), then a two-column body: content on the left and a 22rem right rail (Needs attention, Providers, Decisions by reason) from `lg`. Below `lg` the rail stacks, and Needs attention moves up under the KPIs. Gaps between cards are 16px; card insets are 16-20px horizontally and 12-16px vertically, with 32px for the sign-in cards. Tables scroll sideways inside their card and drop columns at `md` and `lg` rather than wrapping.

Breakpoints are Tailwind defaults (`sm` 640px, `md` 768px, `lg` 1024px). The why sheet is a 28rem side panel inset 12px from the viewport edge at `lg` and up, and the table area makes room for it. Below `lg` it covers the screen and behaves as a modal dialog.

## Elevation & Depth

Flat by default. Depth comes from the ground split and 1px hairlines. Only floating layers get a shadow: the chart tooltip and the desktop why sheet use a single pop shadow. In dark it is a deep black shadow plus a 1px `line-strong` ring, because shadows alone do not read on black. The active segmented item gets a 1px lift with a hairline ring. The top bar uses translucency and backdrop blur, not a shadow.

### Shadow Vocabulary
- **Pop, light** (`box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.16), 0 2px 6px -2px rgb(0 0 0 / 0.08)`): tooltips and the side sheet.
- **Pop, dark** (`box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.7), 0 0 0 1px var(--line-strong)`): the same layers in dark.
- **Segment lift** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.08), 0 0 0 1px var(--line)`): the pressed segmented item.

### Named Rules
**The Floating Only Rule.** Cards, tables and buttons never cast shadows. A shadow means the layer floats above the page.

## Shapes

Gently rounded and consistent: 8px for cards, callouts, the segmented track and tooltips; 6px for buttons, inputs, segmented items, skeletons and code blocks; 4px for inline code and the focus outline; 12px for the floating why sheet; full pills for badges, status dots, avatars, meters and the theme toggle. Strokes are always 1px. Chart columns have a 4px rounded top and a square baseline.

## Components

### Buttons
Quiet and exact.
- **Shape:** 6px corners, 36px tall, 14px horizontal padding, 500 weight at 0.875rem, with an icon gap of 8px.
- **Primary:** emerald-700 (`emerald-deep`) with white text in light; emerald-500 (`emerald-dark`) with near-black `emerald-dark-ink` text in dark. Hover brightens it by 8%. One per view, for the committing action (linking a server).
- **Secondary:** surface fill with a `line-strong` stroke; hover fills with `subtle`.
- **Ghost:** no fill, `ink-2` text; hover fills with `subtle` and darkens the text. Used as 32px square icon buttons (sign out, close, theme on mobile).
- **Discord:** blurple fill, white text and the Discord mark, 40px tall and full width on sign-in cards. This is the third-party brand exception.
- **Disabled:** 50% opacity, not-allowed cursor. Transitions are 150ms ease-out on color, border and shadow.

### Verdict Badges
- **Style:** 22px pill, 0.75rem at 500 weight, a 12px icon (stroke 2.5) followed by the word. Admitted: check icon on emerald wash. Refused: ban icon on red wash. Would refuse: eye icon on amber wash. Error: warning icon on subtle gray.
- **Neutral and mode badges:** the same pill on subtle gray (Enforce) or amber wash (Observe).

### Status Dots
An 8px dot in the state color. Healthy dots pulse softly (a ping ring at 40% opacity), which stops under reduced motion. Idle dots are `ink-3`.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** `surface` on `page`.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px `line`.
- **Internal Padding:** card headers are 16px by 12px with a bottom hairline; bodies are 16-20px. Callouts inside cards use a 30% state-color border on its wash.

### Inputs / Fields
- **Style:** 36px tall, 6px corners, surface fill, 1px `line-strong` stroke, `ink-3` placeholder, and a 16px leading icon in search.
- **Hover:** the stroke darkens to `ink-3`.
- **Focus:** an emerald stroke plus a 3px emerald ring at 22%. Global `:focus-visible` is a 2px emerald outline with a 2px offset.

### Segmented Control
Ranges (24h, 7d, 30d, 90d) and register filters. A subtle track with 2px padding and an 8px radius, holding 28px items with a 6px radius at 0.8125rem and 500 weight. The pressed item lifts onto `surface` with `ink` text. State is exposed through `aria-pressed`.

### Navigation
A sticky top bar: translucent surface with backdrop blur and a bottom hairline. The breadcrumb reads wordmark, slash, network name, slash, server switcher (a borderless select that fills with `subtle` on hover). On the right sit the theme toggle (three icon pills from `sm`, a single cycling ghost button on mobile), the avatar and sign out. Page tabs are 0.8125rem at 500 weight in `ink-2`. The active tab turns `ink` with a 2px rounded `ink` underline sitting on the bar's hairline.

### Decision Table
- **Rows:** 44px tall with a hairline between rows; headers are 0.8125rem at 500 weight in `ink-2`, with 16px outer cell padding.
- **Content:** the IP in mono at 500 weight, the server name in `ink-3`, a verdict badge, the reason (in red text when refused), and the time right-aligned in tabular sans.
- **Interaction:** hovering a row fills it with `subtle` at 70%; the selected row is `subtle`. New rows arrive with a 1.6s emerald-wash fade (`row-in`), which is the one authored motion.

### Why Sheet
A non-modal side sheet on desktop, a modal dialog on mobile, sliding 16px in from the right over 220ms with an expo-out curve. It has a sticky blurred header with a close button, then the IP in mono at 1.125rem and 600 weight, the verdict badge, a tinted explanation callout, a hairline definition list (8.5rem labels), and Providers and Rules cards.

### Tally Chart
Stacked columns per hour or day, up to 24px wide, with a 4px rounded top. Bottom to top: admitted in emerald, would-refuse as an amber hatch (a 45° stroke over the amber wash, 4px pitch), and refused in red, with 2px gaps between segments. Three hairline gridlines, a `line-strong` baseline, and 11px tabular axis labels in `ink-3`. Hovering dims other columns to 45% and shows a pop tooltip. A legend with swatches sits above the plot.

### Skeletons
`subtle` blocks with a 6px radius and a 1.4s sheen. The sheen stops under reduced motion.

### Named Rules
**The Hatch Is State Rule.** Would-refuse is a hypothetical state, so in charts it is told apart by texture as well as hue: amber hatch, never a flat fill. Admitted is emerald and refused is red, a pairing validated for color-vision deficiency in both themes in the finish review.

**The One Authored Moment Rule.** Motion is limited to the new-row arrival, the sheet slide-in, skeleton sheen and the healthy ping, and all of it stops under `prefers-reduced-motion`. Everything else is a 150ms color transition.

## Do's and Don'ts

### Do:
- **Do** put #ffffff cards on a #fafafa page in light, and #0a0a0a cards on a #000000 page in dark.
- **Do** use emerald as the only brand color; keep everything else grayscale unless it is a state.
- **Do** pair every state color with an icon, a word or the hatch texture.
- **Do** set numbers in Geist Sans with tabular-nums, and reserve Geist Mono for IPs, UUIDs, versions, rule IDs, link codes and config.
- **Do** fill the primary button with emerald-700 and white text in light, and emerald-500 and near-black text in dark.
- **Do** keep strokes at 1px, cards at 8px radius and controls at 6px.
- **Do** design both themes, and apply the stored or system theme before first paint.
- **Do** show the product as the "Connection Guard" wordmark in Geist Sans.

### Don't:
- **Don't** bring back paper, stamps, ledger rules or any other "Gate Register" device.
- **Don't** use the shield logo in the dashboard.
- **Don't** introduce a brand blue or a second accent. Discord blurple stays on the Discord sign-in button only.
- **Don't** put shadows on cards, tables or buttons; only tooltips and the side sheet float.
- **Don't** draw would-refuse as a flat amber fill in charts.
- **Don't** set KPI or table numbers in mono.

## Marketing Site (apps/site)

connectionguard.net is the Persuade surface of the same system: it imports the dashboard stylesheet unchanged (palette, Geist, hairlines, buttons, cards, badges, both themes) and adds only the larger type, a wider-feeling page rhythm, and a few site components. Everything above still applies; this section records only what the site adds or does differently.

### Typography
- **Site Display** (`site-display`, balanced wrap): the home headline. Inner pages use the same weight and tracking at a smaller clamp (up to 3.5rem on download, 3.25rem on privacy).
- **Section Title** (`site-section-title`, balanced wrap): every section heading on the home and download pages.
- **Lede** (`site-lede`, `ink-2`, max 62ch, pretty wrap): the one sentence under a headline or section title.
- **Prose** (`site-prose`, `ink-2`, max 40rem): long-form paragraphs and lists on the privacy page, with 1.375rem/600 subheads and underlined `ink` links.

### Layout
Content sits in a 72rem container (`site-container`) with 20px side padding, 32px from `sm`. Sections are full-width bands divided by 1px hairlines, with 80px vertical padding (112px from `sm`) on the home page and 56-64px on inner pages. Section anchors carry a scroll margin that clears the taller mobile header. Smooth anchor scrolling turns off under reduced motion.

**The Restack Rule.** Below `sm`, a site table too wide for a phone becomes one stacked card per row, with every value kept, instead of scrolling sideways (the Intel lists; the comparison table already restacks below `md`). Narrow tables that fit keep their table form and drop secondary columns instead.

**The Preview Stage Rule.** Exactly one full-bleed band sits on a different ground than the page: the dashboard preview (`#dashboard`, `subtle` in light, `surface` in dark, hairlines top and bottom). It follows the theme; a band forced dark in light mode read as a black slab and was dropped (Gero, 2026-10-04). No other section changes ground. Chips reset letter-spacing so they survive inside tight display headings.

### Navigation
A sticky, opaque `surface` header with a bottom hairline (not the dashboard's translucent blur): 56px row with the wordmark, inline links from `md`, then GitHub (from `sm`), the theme toggle and a primary Download button. Below `md` a second 40px row holds the same links plus GitHub as a horizontally scrolling 0.8125rem link row, so nothing hides behind a menu.

### Components
- **Large Button** (`button-primary-lg`, and the secondary at the same size): 44px tall, 8px corners, 0.9375rem. Used only for the page-level calls to action (Download free, How it compares, Join the Discord). The nav keeps the standard 36px button.
- **Chip** (`chip`): a 24px pill with a 1px `line` stroke on `surface`, `ink-2` caption text. Holds factual tags: license, version (in mono), "Recommended".
- **Soon Chip** (`chip-soon`): the same pill on `emerald-wash` with `emerald-deep` text and a 35% emerald stroke, 20px tall where inline. Its text is "0.5" (or "Coming in 0.5" in the announcement bar) and it marks every feature not in the current release: comparison rows, setup steps, the dashboard heading.
- **Frame** (`rounded.frame`): the comparison table, the dashboard preview window and the ranking frame sit in 16px-cornered, hairline-stroked frames, one step rounder than cards because they hold cards or tables.
- **Download Stats Card**: a standard card with the dated total as a 3rem tabular number, one emerald meter per platform, and a footer line naming the source and date.
- **Ranking Frame**: the signature of the Intel hero. A frame on `surface` holding a ranked score table: a header row with a 0.9375rem/600 caption and the sample size and run date in `ink-3` caption; rows with an `ink-3` rank, the service name over a caption line of its counts, a right-aligned 0.9375rem/600 tabular score, and a 95 % range bar. The bars share one fixed, labelled scale (60–100) so overlaps read honestly: a 1px `line` track, a 6px pill range in `line-strong`, and a 10px score dot in `ink-2` ringed in `surface`. Our row sits on emerald wash at 60%, with the name at 500 weight, the score in emerald text, and the range and dot in emerald (range at 45%). A footer under a hairline states the formula and the caveat inside the frame. Below `sm` the bar column drops and the range prints under the score.

### Comparison Table
**The Categories Not Competitors Rule.** Columns are Connection Guard, a typical paid plugin and a typical hosted service; no product is named, and a footnote dates the review.
- **Marks:** yes is an emerald check, no is an `ink-3` dash, varies is an `ink-3` tilde; each mark carries a screen-reader word and a visible legend sits below the table. Only "yes" gets color.
- **Our column:** tinted with emerald wash at 60% and set in `ink` at 500 weight; the others are `ink-2`.
- **Proof links:** a row whose answer is shown elsewhere on the site gets a quiet `ink-3` "See it →" link to that section.
- **Small screens:** below `md` the table becomes one stacked card per question, with all three answers listed, so the comparison survives instead of scrolling sideways.

### Honesty
**The Labeled Evidence Rule.** Every piece of proof says what it is. The dashboard preview runs the real dashboard components on generated data and carries an "Example data" pill in its window chrome. Download counts are read from each platform's public API at build time and printed with the date and "Downloads are not active servers"; a count that failed to refresh says "(last known)". The illustrative console block is captioned as illustrative. No testimonials and no invented numbers.

### Removed on purpose
These were built, reviewed and taken out; do not bring them back on any site surface:
- Decorative hairline grid backgrounds behind sections.
- Wide diffuse shadows on cards, frames or the preview. The site follows the Floating Only Rule.
- Small kicker chips or eyebrow labels above headings. A chip only ever marks a fact (license, version, "0.5").
- Amber for neutral facts. Amber stays on would-refuse, observe mode and attention.
