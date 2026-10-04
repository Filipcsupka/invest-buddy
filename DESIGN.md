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
  rule-strong-dark: "#5e686e"
  signal-dark: "#8fa3ff"
  on-signal-dark: "#0b0f1a"
  signal-wash-dark: "#1c2547"
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
    backgroundColor: "{colors.signal-light}"
    textColor: "{colors.on-signal-light}"
    rounded: "{rounded.sheet}"
    padding: "2px 8px"
  chip-watch:
    backgroundColor: "transparent"
    textColor: "{colors.signal-light}"
    rounded: "{rounded.sheet}"
    padding: "2px 8px"
  input-search:
    backgroundColor: "{colors.sheet-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.sheet}"
    height: "40px"
---

# Design System: InvestBuddy

## Overview

Every ticker is drawn as an engineering datasheet. A title block names the part, a rule strip shows which of the ten published rules it met, and a table lists the working. The ground is cool drafting film rather than cream paper, the ink is graphite, and one cobalt signal colour marks rule state. The site is used at a desk in daylight and in the evening, so both themes are first-class: `prefers-color-scheme` decides, and the header toggle pins a choice in local storage.

Modes: the landing page persuades with a live sample datasheet in its first viewport. Dashboard, scanner and company pages are for operating: dense tables, tabular numerals, no decoration between the reader and the numbers. Methodology is for reading: serif prose at 68ch.

Source of truth: `src/app/globals.css` (tokens on `:root` with `light-dark()`), components in `src/components/`.

## Colors

The palette is restrained: neutrals plus one signal. Every token is a `light-dark()` pair, so the toggle only flips `color-scheme` on `<html>`.

### Primary

- **Cobalt signal** (`#2340c4` light, `#8fa3ff` dark). Rule state only: Setup met is solid signal, Watch is signal outline, the Pullback qualifier and met-rule ticks are signal text. Links take it on hover, and so do focus rings and `::selection`.
- **Signal wash** (`#dde3f8` / `#1c2547`). The dip zone in charts and the Watch band on the state scale.

### Neutral

- **Ground** (`#eceeeb` / `#101315`): page background, drafting film.
- **Sheet** (`#f7f8f6` / `#171b1e`): datasheets, title blocks, inputs, row hover.
- **Ink** (`#15191c` / `#e4e7e3`): text, primary buttons, the close line.
- **Ink 2** (`#464f56` / `#a9b2b6`): secondary text, MA50, ledes.
- **Ink 3** (`#5d666d` / `#8d979c`): labels, meta, MA200. Still 4.5:1 or better on ground and sheet.
- **Rule** (`#c7cdcc` / `#2a3135`): hairlines between rows.
- **Rule strong** (`#7e878b` / `#5e686e`): control borders, title block grid. 3:1 or better against ground.

### Named Rules

**One signal.** Cobalt means rule state. No second accent, no red for losses, no green for gains.

**Drawing conventions carry state.** Section hatching (a 1px diagonal repeating gradient) marks Criteria broken, both on the chip and on met blocks of the rule strip, because those points no longer count. A dashed border marks Insufficient data, like a construction line. These are the only patterned fills.

## Typography

Archivo carries titles, UI and every number; its width axis does the work a second display face would. Titles run at 108 to 112% width, labels at 87%. Source Serif 4 is the reading face for ledes, prose and rule definitions. Both load through `next/font/google` with `latin-ext` for Slovak.

### Hierarchy

- **Display** (Archivo 640, 112% width, up to 5.5rem): the landing headline only, max 12ch.
- **Title** (Archivo 640, 108% width, up to 3.5rem): one per page.
- **Heading** (Archivo 620, 1.375rem): section heads.
- **UI** (Archivo 400, 0.9375rem) and **table** (0.8125rem).
- **Label** (Archivo 650, 87% width, 0.75rem, uppercase, 0.07em tracking): title block fields and table headers. Never placed above a heading.
- **Lede** (Source Serif 4, 1.1875rem, 62ch) and **prose** (1.0625rem, 68ch).

### Named Rules

**Tabular numerals everywhere numbers line up.** Every `td`, `.num` element, score total and chart axis label uses `tabular-nums lining-nums`.

**No text under 12px.** The floor is `--t-xs: 0.75rem`.

## Layout

The frame is `min(1280px, 100% - 2 × gutter)`, with the gutter fluid from 16px to 40px. Spacing is on a 4px base (`--s1` to `--s9`); groups are tight and sections are separated by 48 to 112px. Landing sections are ledger rows: a 4/12 heading column and an 8/12 content column under a full-width ink rule. Company pages split 7/5 between rules and the side column. Below 900px everything stacks and the nav moves to its own row. Below 640px the title blocks drop to two columns, and tables hide sector, F/T/M and the rule strip so the state stays visible.

## Elevation & Depth

The world is flat paper. Depth comes from borders. Only the landing datasheet carries a 1px offset, 2px blur contact shadow (`0 1px 2px`); nothing else casts one.

## Shapes

Corners are 2px everywhere: chips, buttons, inputs, sheets. The only round shape is the last-close dot on the chart.

## Components

### Buttons

Primary is solid ink with ground text, 44px tall, and turns signal on hover. Secondary is transparent with a rule-strong border that darkens to ink on hover. Disabled is 45% opacity with a not-allowed cursor. Text buttons (clear filters) are signal and underlined.

### Chips

Rule-state chips are 12px Archivo 620 with a 1px border. Setup met is solid signal, Watch is signal outline, Wait has a neutral outline, Ignore a faint outline in ink 3, Criteria broken is hatched, Insufficient data is dashed. Pullback in uptrend renders as a signal qualifier line with a dip icon under the Watch chip.

### Inputs / Fields

Search sits on sheet with a rule-strong border and a 16px search icon; focus turns the border signal and adds the 2px signal ring. State filters are a wrapped row of segmented radios with counts. Checked is solid ink, a state with no tickers is disabled and dashed.

### Navigation

A sticky header on ground with a hairline bottom border. The active link gets a 2px signal underline at 0.55em offset. The language switch (`EN` / `SK` plus the language name) writes the `NEXT_LOCALE` cookie. The theme toggle is a 36px square icon button.

### Rule strip (signature)

Ten blocks, each as wide as its rule's points, in three groups sized 10, 10 and 5. A met rule is filled: signal for Setup met, ink 2 otherwise, hatched under a rejection rule. The small form (120px × 8px) sits in tables; the large form (up to 48rem × 22px) has F / T / M captions with group scores. It always carries an `aria-label` with the full breakdown.

### Title block

A `dl` grid of bordered fields with uppercase labels and a SAMPLE DATA stamp cell. It heads the landing specimen and the company page.

### Price chart

An HTML-wrapped SVG with `preserveAspectRatio="none"` and non-scaling strokes. The close is a 1.75px ink line, MA50 a 1.25px ink 2 line, MA200 a 1.25px ink 3 line dashed 6/4. The dip zone is a signal-wash band between 5% and 10% under the 20-session high, edged with dashed signal lines. Axis labels are HTML, localized through `Intl`.

### Motion

There is one authored moment: on the company page the price lines are plotted left to right with a `clip-path` sweep (1600ms, `cubic-bezier(0.16, 1, 0.3, 1)`), then the last-close dot settles in. Everything else is a 120 to 200ms colour transition. `prefers-reduced-motion` turns all of it off.

### Browser surfaces

`::selection` is signal on on-signal. Caret and `accent-color` are signal. Focus rings are 2px signal at 2px offset. Scrollbars are rule-strong thumbs on ground. Link underlines sit at a 0.22em offset.

## Do's and Don'ts

### Do:

- Put the disclaimer beside every score: as a table caption that the score and state cells reference with `aria-describedby`, or inline next to a single score.
- Show SAMPLE DATA as a stamp on every page that shows prices or scores.
- Keep every string in `src/i18n/messages.ts`. Format numbers, dates and percentages through the helpers in `src/i18n/index.ts` (Slovak uses a decimal comma).
- Draw icons as 16px inline SVG with a 1.5 stroke and square caps.

### Don't:

- Don't add a second accent colour or colour-code gains and losses.
- Don't put an eyebrow or kicker above a heading, number sections, or build pages from grids of same-size cards.
- Don't use gradient text, glass, glow, or wide soft shadows.
- Don't use emoji or Unicode glyphs as icons.
- Don't write copy that tells the reader to buy, sell or size a position, or that promises returns.
