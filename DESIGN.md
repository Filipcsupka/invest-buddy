---
name: InvestBuddy
description: A rule-based stock screen drawn as an engineering datasheet you can audit.
colors:
  ground-light: "#eceeeb"
  sheet-light: "#f7f8f6"
  sheet-hover-light: "#f1f3f0"
  ink-light: "#15191c"
  ink-2-light: "#464f56"
  ink-3-light: "#5d666d"
  rule-light: "#c7cdcc"
  rule-strong-light: "#7e878b"
  signal-light: "#2340c4"
  on-signal-light: "#ffffff"
  signal-wash-light: "#dde3f8"
  ground-dark: "#101315"
  sheet-dark: "#171b1e"
  sheet-hover-dark: "#1d2226"
  ink-dark: "#e4e7e3"
  ink-2-dark: "#a9b2b6"
  ink-3-dark: "#8d979c"
  rule-dark: "#2a3135"
  rule-strong-dark: "#646e74"
  signal-dark: "#8fa3ff"
  on-signal-dark: "#0b0f1a"
  signal-wash-dark: "#1c2547"
  sheet-raised-light: "#fbfcfa"
  sheet-raised-dark: "#1c2125"
  signal-strong-light: "#1a32a3"
  signal-strong-dark: "#b8c5ff"
  signal-tint-light: "#eef1fc"
  signal-tint-dark: "#151b33"
  st-setup-light: "#16703f"
  st-setup-dark: "#5fd391"
  st-setup-wash-light: "#d5ecdd"
  st-watch-light: "#2340c4"
  st-watch-dark: "#8fa3ff"
  st-wait-light: "#8a6500"
  st-wait-dark: "#f2c84b"
  st-ignore-light: "#b54708"
  st-ignore-dark: "#ffa463"
  st-broken-light: "#b3261e"
  st-broken-dark: "#ff8a7d"
  st-none-light: "#5d666d"
  st-none-dark: "#a9b2b6"
  tier-light: "#7a2a6a"
  tier-dark: "#e6a6d8"
  tier-on-light: "#ffffff"
  tier-on-dark: "#2a0b23"
  tier-wash-light: "#f4e4ef"
  tier-wash-dark: "#35192f"
  tier-line-light: "#a8789c"
  tier-line-dark: "#93608a"
typography:
  display:
    fontFamily: "Archivo, Arial Narrow, Arial, sans-serif"
    fontSize: "clamp(2.75rem, 1.4rem + 4.6vw, 5.5rem)"
    fontWeight: 640
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Archivo, Arial Narrow, Arial, sans-serif"
    fontSize: "clamp(2.25rem, 1.55rem + 2.4vw, 3.5rem)"
    fontWeight: 640
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  figure:
    fontFamily: "Archivo, Arial Narrow, Arial, sans-serif"
    fontSize: "2rem"
    fontWeight: 640
    lineHeight: 1
    letterSpacing: "-0.03em"
  heading:
    fontFamily: "Archivo, Arial Narrow, Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 620
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  ui:
    fontFamily: "Archivo, Arial Narrow, Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  table:
    fontFamily: "Archivo, Arial Narrow, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, Arial Narrow, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    letterSpacing: "0.07em"
  lede:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: 1.55
  prose:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  sheet: "2px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "72px"
  s9: "112px"
components:
  button-primary:
    backgroundColor: "{colors.ink-light}"
    textColor: "{colors.ground-light}"
    rounded: "{rounded.sheet}"
    padding: "8px 24px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.signal-light}"
    textColor: "{colors.on-signal-light}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.sheet}"
    padding: "8px 24px"
  chip-setup:
    backgroundColor: "{colors.st-setup-wash-light}"
    textColor: "{colors.st-setup-light}"
    rounded: "{rounded.sheet}"
    padding: "2px 8px"
  chip-watch:
    backgroundColor: "{colors.signal-wash-light}"
    textColor: "{colors.st-watch-light}"
    rounded: "{rounded.sheet}"
    padding: "2px 8px"
  badge-paid:
    backgroundColor: "{colors.tier-light}"
    textColor: "{colors.tier-on-light}"
    rounded: "{rounded.sheet}"
    padding: "1px 7px"
  input-search:
    backgroundColor: "{colors.sheet-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.sheet}"
    height: "40px"
---

# Design System: InvestBuddy

## Overview

Every ticker is drawn as an engineering datasheet. A title block names the part, a rule strip shows which of the published rules it met, and a table lists the working. The ground is cool drafting film rather than cream paper and the ink is graphite. Cobalt is the signal for met rules, links and focus. A separate band palette marks the seven rule states, and mulberry marks the paid tier. The site is used at a desk in daylight and in the evening, so both themes are first-class: `prefers-color-scheme` decides, and the header toggle pins a choice in local storage.

Modes: the landing page persuades with a live sample datasheet in its first viewport. Dashboard, scanner and company pages are for operating: dense tables, tabular numerals, no decoration between the reader and the numbers. Methodology is for reading: serif prose at 68ch.

Source of truth: `src/app/globals.css` (tokens on `:root` with `light-dark()`), the component kit in `src/components/kit/` (styles in `kit.css`, API in its README), and the other components in `src/components/`. `/en/design` and `/sk/design` show every kit component in every state. They open outside production, in fixture mode, or with `DESIGN_VIEW=on`.

## Colors

Neutrals carry the page. Three colour families carry meaning, and each has one job: the cobalt signal, the state bands and the tier mark. Every token is a `light-dark()` pair, so the toggle only flips `color-scheme` on `<html>`. Dark is tuned on its own, not inverted: its borders are a step stronger for evening reading, and raised surfaces get a hairline top light in place of a bigger shadow. `scripts/check-contrast.ts` checks every text pair at 4.5:1 and every border and shape at 3:1, in both themes. `npm test` runs it.

### Primary

- **Cobalt signal** (`#2340c4` light, `#8fa3ff` dark). Met-rule marks, links on hover, focus rings, `::selection`, the caret. The hex is unchanged. The foundation adds a ramp around it.
- **Signal strong** (`#1a32a3` / `#b8c5ff`): hover and pressed text.
- **Signal wash** (`#dde3f8` / `#1c2547`): the dip zone in charts and the Watch chip.
- **Signal tint** (`#eef1fc` / `#151b33`): a selected table row.

### State bands

One hue per state, each with a fill, an `-on` colour for marks drawn on the fill, and a wash for chips: Conditions met green (`--st-setup`), Watching cobalt (`--st-watch`, equal to the signal), Pullback in uptrend on the Watch tokens with its own dip shape, Waiting amber (`--st-wait`), Not now orange (`--st-ignore`), Criteria broken red (`--st-broken`), Not enough data grey (`--st-none`) with a dashed line. The values and contrast tables are in `docs/design/status-slider.md`. Light amber is a dark ochre on purpose, because a bright yellow cannot reach 3:1 on the light ground.

### Tier mark

- **Mulberry** (`--tier`, `#7a2a6a` / `#e6a6d8`), with `--tier-on`, `--tier-wash` and `--tier-line`. It appears only on the Paid badge, the paid frame, lock cards and the admin banner. No state uses this hue, so a paid mark never reads as a state.

### Neutral

- **Ground** (`#eceeeb` / `#101315`): page background, drafting film.
- **Sheet** (`#f7f8f6` / `#171b1e`): datasheets, title blocks, inputs, row hover.
- **Ink** (`#15191c` / `#e4e7e3`): text, primary buttons, the close line.
- **Ink 2** (`#464f56` / `#a9b2b6`): secondary text, MA50, ledes.
- **Ink 3** (`#5d666d` / `#8d979c`): labels, meta, MA200. Still 4.5:1 or better on ground and sheet.
- **Rule** (`#c7cdcc` / `#2a3135`): hairlines between rows.
- **Rule strong** (`#7e878b` / `#646e74`): control borders, title block grid, score tracks. 3:1 or better on ground, sheet and raised sheet.
- **Sheet raised** (`#fbfcfa` / `#1c2125`): lock cards and other surfaces one level up.

### Named Rules

**One job per colour family.** Cobalt marks met rules and interaction. Band hues mark state and nothing else. Mulberry marks the tier. Price charts keep `--gain` and `--loss` for price moves only, never for state.

**Never colour alone.** A state chip always prints its label and carries its own shape (octagon, circle with a minus, hourglass, eye, dip, circle with a check, dashed circle). A score bar or dial sits next to a chip.

**Drawing conventions carry state.** Section hatching marks met blocks of the rule strip under Criteria broken, because those points no longer count. A dashed border marks Not enough data and rules without data, like a construction line. These are the only patterned fills.

## Typography

Archivo carries titles, UI and every number; its width axis does the work a second display face would. Titles run at 108 to 112% width, labels at 87%. Source Serif 4 is the reading face for ledes, prose and rule definitions. Both load through `next/font/google` with `latin-ext` for Slovak. Next downloads the files at build time and serves them from the site, so no font host is contacted at runtime and the CSP keeps `font-src 'self'`.

### Hierarchy

- **Display** (Archivo 640, 112% width, up to 5.5rem): the landing headline only, max 12ch.
- **Title** (Archivo 640, 108% width, up to 3.5rem): one per page.
- **Heading** (Archivo 620, 1.375rem): section heads. **Subheading** (1.125rem) for h3.
- **Figure** (Archivo 640, 2rem, up to 3.75rem in the large dial): score readouts and counts, tabular.
- **UI** (Archivo 400, 0.9375rem) and **table** (0.8125rem).
- **Label** (Archivo 650, 87% width, 0.75rem, uppercase, 0.07em tracking): title block fields and table headers. Never placed above a heading.
- **Lede** (Source Serif 4, 1.1875rem, 62ch) and **prose** (1.0625rem, 68ch).

### Named Rules

**Tabular numerals everywhere numbers line up.** Every `td`, `.num` element, score total and chart axis label uses `tabular-nums lining-nums`.

**No text under 12px.** The floor is `--t-xs: 0.75rem`.

## Layout

The frame is `min(1280px, 100% - 2 × gutter)`, with the gutter fluid from 16px to 40px. Spacing is on a 4px base (`--s1` to `--s9`); groups are tight and sections are separated by 48 to 112px. Landing sections are ledger rows: a 4/12 heading column and an 8/12 content column under a full-width ink rule. Company pages split 7/5 between rules and the side column. Below 900px everything stacks and the nav moves to its own row. Below 640px the title blocks drop to two columns, and tables hide sector, F/T/M and the rule strip so the state stays visible.

## Elevation & Depth

Paper first: most depth comes from borders. Two shadow levels exist for things that sit above the sheet, each an offset plus a blur. `--shadow-1` (contact) is for the landing datasheet, lock cards and the scrolled header. `--shadow-2` (a 12px offset with a 28px blur) is for a raised specimen. Dark mode deepens the shadow and adds `--edge-light`, a 1px inset top highlight, because a shadow alone barely reads on a dark ground. No zero-offset glows, no hard offset shadows.

## Shapes

Corners are 2px everywhere: chips, buttons, inputs, sheets. The only round shape is the last-close dot on the chart.

## Components

### Buttons

Primary is solid ink with ground text, 44px tall, and turns signal on hover. Secondary is transparent with a rule-strong border that darkens to ink on hover. Disabled is 45% opacity with a not-allowed cursor. Text buttons (clear filters) are signal and underlined.

### Chips

Kit state chips (`StateChip`) are 12px Archivo 650 in three sizes: band text on the band wash, a 1px band border and the state's shape. Not enough data is dashed on the plain surface. The older chip in `score-badge.tsx` (solid signal for Setup met) remains on pages that have not moved to the kit yet. The page work packages replace it.

### Tier marks

`TierBadge` prints Free (neutral outline) or Paid (solid mulberry with a padlock). `TierFrame` draws a paid section's hairline frame with the badge set into its top edge. `LockCard` stands in for a paid section for a future free viewer: it shows the status first, then names what is behind it, and the paid content is not sent to the page. `TierBanner` is the slim admin-view line under the header. The layout keeps it hidden until the tier logic sets a mode.

### Inputs / Fields

Search sits on sheet with a rule-strong border and a 16px search icon; focus turns the border signal and adds the 2px signal ring. State filters are a wrapped row of segmented radios with counts. Checked is solid ink, a state with no tickers is disabled and dashed.

### Navigation

A sticky header on ground with a hairline bottom border. After the first 5rem of scroll it takes `--shadow-1` and a stronger border (scroll-linked CSS, no script). The active link gets a 2px signal underline at 0.55em offset, and other links get a hairline underline on hover. The language switch (`EN` / `SK` plus the language name) writes the `NEXT_LOCALE` cookie. The theme toggle is a 44px square icon button, and its icon turns in when the theme changes. The footer sits under a full ink rule: brand and data note, a line on who the site is for, legal links on the right, and the disclaimer under a hairline.

### Rule strip (signature)

Ten blocks, each as wide as its rule's points, in three groups sized 10, 10 and 5. A met rule is filled: signal for Setup met, ink 2 otherwise, hatched under a rejection rule. The small form (120px × 8px) sits in tables; the large form (up to 48rem × 22px) has F / T / M captions with group scores. It always carries an `aria-label` with the full breakdown.

### Title block

A `dl` grid of bordered fields with uppercase labels and a SAMPLE DATA stamp cell. It heads the landing specimen and the company page.

### Price chart

An HTML-wrapped SVG with `preserveAspectRatio="none"` and non-scaling strokes. The close is a 1.75px ink line, MA50 a 1.25px ink 2 line, MA200 a 1.25px ink 3 line dashed 6/4. The dip zone is a signal-wash band between 5% and 10% under the 20-session high, edged with dashed signal lines. Axis labels are HTML, localized through `Intl`.

### Motion

Instrument motion: a reading settles, it does not perform. Each page gets one authored moment and does not repeat the same entrance on every section. The vocabulary lives in `kit.css` and `globals.css`:

- **Settle.** A score bar fills, or a dial arc sweeps, from zero to its value (1100ms, `--ease-expo`, `cubic-bezier(0.19, 1, 0.22, 1)`). The fill is a transform or a dash, so layout never moves.
- **Check in.** Rule marks appear one by one, 70ms apart, and the tick or cross draws its stroke.
- **Count.** Integers from 0 to 999 count up on tabular figures in a box sized by the final text (CSS `@property`, no script).
- **Reveal.** Opacity, a 1.25rem rise and a 4px blur clearing, 640ms ease-out. It runs only on content that is still below the fold after hydration.
- **Strip.** The state-change strip moves slowly. It stops on hover, on focus, with its pause button and while off screen.
- **Plot.** The company chart still plots its close line once (1600ms `clip-path` sweep).
- Feedback stays at 120 to 200ms colour transitions.

Every animation is a `from` keyframe over the declared final state. With no JavaScript, with reduced motion (which turns animation and transitions off globally) and in print, the reader sees the final reading. `motion="view"` uses one small client island (`Motion`) with an IntersectionObserver. There is no animation library.

### Browser surfaces

`::selection` is signal on on-signal. Caret and `accent-color` are signal. Focus rings are 2px signal at 2px offset, and `Highlight` in forced colours. Scrollbars are rule-strong thumbs on ground that darken on hover, and inner scroll boxes (tables, the strip) use thin bars. Placeholders are ink 3, `<mark>` is signal wash, and link underlines sit at a 0.22em offset. Every `td`, `.num` and kit table uses tabular lining figures.

### Data tables

`DataTable` is the base: a labelled, focusable scroll region, a sticky header inside a bounded height, an optional sticky first column, hairline rows, a sheet hover, a signal-tint selected row and a dashed empty row.

## Do's and Don'ts

### Do:

- Put the disclaimer beside every score: as a table caption that the score and state cells reference with `aria-describedby`, or inline next to a single score.
- Show SAMPLE DATA as a stamp on every page that shows prices or scores.
- Keep every string in the i18n files: `src/i18n/messages.ts`, plus topic files such as `kit-messages.ts` that keep parallel work from colliding. Format numbers, dates and percentages through the helpers in `src/i18n/index.ts` (Slovak uses a decimal comma).
- Draw icons as 16px inline SVG with a 1.5 stroke and square caps.

### Don't:

- Don't add a colour family beyond signal, bands and tier, and don't use band colours for anything but state.
- Don't put an eyebrow or kicker above a heading, number sections, or build pages from grids of same-size cards.
- Don't use gradient text, glass, glow, or wide soft shadows.
- Don't use emoji or Unicode glyphs as icons.
- Don't write copy that tells the reader to buy, sell or size a position, or that promises returns.
