---
name: InvestBuddy
description: A rule-based stock screen in a modern app shell: navy sidebar, rounded cards, score first.
colors:
  ground-light: "#f3f5f9"
  sheet-light: "#ffffff"
  sheet-hover-light: "#f0f4fa"
  ink-light: "#141b2e"
  ink-2-light: "#434d66"
  ink-3-light: "#59647e"
  rule-light: "#dde2ec"
  rule-strong-light: "#7a859d"
  signal-light: "#016bb0"
  signal-strong-light: "#015690"
  navy-light: "#1c2a4a"
  accent-light: "#fb8c09"
  accent-on-light: "#1d1000"
  ground-dark: "#0a0d13"
  sheet-dark: "#121722"
  sheet-hover-dark: "#1a2130"
  ink-dark: "#e9edf5"
  ink-2-dark: "#adb6c8"
  ink-3-dark: "#8f9ab0"
  rule-dark: "#232b3c"
  rule-strong-dark: "#66728b"
  signal-dark: "#4fb4f2"
  signal-strong-dark: "#9bd4fa"
  navy-dark: "#0d121d"
  accent-dark: "#ff9a22"
  st-setup-light: "#0e7440"
  st-setup-dark: "#4fd18b"
  st-watch-light: "#016bb0"
  st-watch-dark: "#4fb4f2"
  st-wait-light: "#85620a"
  st-wait-dark: "#f2c84b"
  st-ignore-light: "#a8480a"
  st-ignore-dark: "#ffaa66"
  st-broken-light: "#bd271d"
  st-broken-dark: "#ff8f84"
  st-none-light: "#59647e"
  st-none-dark: "#aab3c5"
  tier-light: "#6a3fc2"
  tier-dark: "#c9b3ff"
typography:
  display: { fontFamily: "Manrope", fontWeight: 800 }
  body: { fontFamily: "Inter", fontWeight: 400 }
rounded:
  sm: 6px
  md: 8px
  lg: 14px
  pill: 999px
spacing:
  base: 4px
---

# Design System: InvestBuddy

The visual system replaced the earlier "datasheet" look (Archivo, Source Serif, cobalt on drafting film, 2px square sheets). Wording rules are unchanged: ADR-001 informational screening, `docs/wording-gate.md`.

## Overview

Score first, in an app shell. A navy sidebar holds the brand, the primary links with icons, the language and theme switches and the one call to action. The page sits on a cool light ground (or near-black in dark mode) with white rounded cards, soft shadows and Manrope headings over Inter text. The signature parts stay: the state-change strip, state chips with icon and label, rule rows with pass and fail marks, the score dial that settles in, tier badges, the company price chart with its dip zone.

Reference for structure and polish: a modern score-first stock screener (blue and navy with one orange accent, rounded cards, ranked tables). No logo, text, font or asset is copied.

## Colors

Every value is a token in `src/app/globals.css`, set with `light-dark()`. Light and dark are tuned separately, and every text and UI pair is checked in `scripts/check-contrast.ts` (AA, both themes).

- **Signal blue** (`--signal`, #016bb0 / #4fb4f2): links, primary buttons, focus, selection, the Watching state.
- **Navy** (`--navy`, #1c2a4a / #0d121d): the sidebar and dark feature cards. Text on it is `--navy-ink` and `--navy-ink-2`.
- **Accent orange** (`--accent`, #fb8c09 / #ff9a22): the single call to action per view and the active nav icon. Always dark ink on it (`--accent-on`), never white. `--accent-ink` is the AA text version.
- **State bands**: green Conditions met, blue Watching, amber Waiting, orange Not now, red Criteria broken, grey Not enough data. Each has a text colour, a wash and an on-colour. A state is always shown with an icon and a label as well as colour.
- **Tier mark**: violet, used only for Paid badges, the paid frame and lock cards.
- **Neutrals**: ground, sheet (white), sheet-hover, sheet-raised, ink, ink-2, ink-3, rule, rule-strong.

Rules: orange is rare. Red and green never carry meaning alone. Dark mode is designed, not inverted: near-black ground, lifted sheets, lighter signal and state colours.

## Typography

- **Manrope** (700 to 800) for the page title, headings, figures and the brand. Variable `--font-display`.
- **Inter** for all text and UI. Variable `--font-sans`. No serif.
- Scale: title `clamp(2rem, 3.1vw, 3.125rem)`, display up to 4.75rem, h2 1.5rem, body 0.9375rem, small 0.8125rem, label 0.75rem. Headings tighten to -0.02em to -0.035em.
- Labels are sentence case and bold, not uppercase. Only the SAMPLE DATA stamp stays uppercase.
- Tabular lining numerals on every table and figure. Slovak decimals use a comma through `Intl`.

## Layout

- **App shell.** Sidebar plus content. From 1200px the sidebar is 15.5rem with labels. From 900px to 1199px it is a 4.75rem icon rail (labels stay in the DOM and show as tooltips). A collapse button under the brand switches between the full sidebar and the rail from 900px up; the choice is stored in `localStorage` (`ib-side`, in try/catch) and applied to `<html data-side>` by an inline script before first paint, so the width never jumps. Below 900px it is a 3.5rem navy top bar with a menu button that opens the panel as a drawer (Escape and link click close it); the collapse button is hidden there.
- **Aligned columns.** Table-like lists use a real grid, never a flex row whose columns follow content width. Tables use `table-layout: fixed` with a `colgroup`; card lists use a parent grid with `subgrid` rows. Header cells of numeric columns carry `.num` so they align with their figures.
- **Content.** `.frame` is `min(1240px, 100% - 2 * gutter)` inside the content column. `.page-head` is the page header: title and meta left, actions right.
- **Footer.** Sits at the foot of the content column on every page: brand and data note, legal links, and the ADR-001 disclaimer line.
- **Rhythm.** 4px base. Sections are 3rem to 4.5rem apart, rows 0.5rem, cards pad 1.5rem.
- Public pages (landing, pricing) use the same shell.

## Elevation & Depth

Two soft, cool shadows (`--shadow-1`, `--shadow-2`) with offset and blur, plus a hairline top light in dark mode. Cards and tables use shadow-1 with a 1px rule border. Interactive cards rise 2px and take shadow-2. No hard offset shadows, no glass.

## Shapes

8px for controls and cells, 14px for cards, tables and the strip, pills (999px) for chips, tabs, tier badges and the language switch. Dial and score bar ends are round.

## Components

- **Buttons.** `.button` is signal blue with a soft shadow. `.button.secondary` is white with a rule border. `.button.cta` is orange with dark ink. Minimum 44px tall.
- **Chips (`StateChip`).** Pill, tinted wash, 38% border of the state colour, icon plus label, three sizes.
- **State strip.** A white rounded card with the label, a Pause pill on the right and a slowly scrolling row of `TICKER [chip] to [chip]` pills. It pauses on hover and focus and stands still with reduced motion.
- **Score dial and bar.** Round-capped arc on a 10% ink track; the bar is a pill track with a round fill. Both settle in once.
- **Rule rows.** Display-font group heads, a round pass mark in green, plain fail and no-data marks.
- **Data tables.** A card: 14px radius, shadow-1, sticky tinted header, sheet-hover rows, signal-tint selected row.
- **Cards and tabs.** `.kit-card` (optionally `data-tone="navy"` or interactive), `.kit-tabs` pill tab bar with a navy active tab, `.kit-input`.
- **Tier marks.** Pill `Paid` badge in violet, 14px paid frame, lock card.
- **Navigation.** Navy sidebar, icon plus label rows, 8px radius, the current page on navy-2 with an orange icon. Footer in the content column.
- **Title block.** A 14px card of fields separated by hairlines.
- **Price chart.** Unchanged: close 1.75px ink, MA50 and MA200 lines, a signal-wash dip band.
- **Motion.** Unchanged vocabulary: settle, check in, count, reveal, strip, plot. Every animation is a `from` keyframe over a final state; reduced motion, no JavaScript and print show the final reading.
- **Browser surfaces.** Selection, caret, accent colour and focus ring use signal (accent orange inside the navy sidebar). Thin scrollbars, tabular numerals, themed placeholders.

## Do's and Don'ts

### Do
- Put the score and its state first, then the rules behind it.
- Use one orange call to action per view.
- Keep state colours paired with an icon and a label.
- Check any new colour pair in `scripts/check-contrast.ts`.

### Don't
- Don't use buy, sell, recommend, best or pick wording, or show prices in the beta (ADR-001).
- Don't add coloured side borders, gradient text, glass or hard offset shadows.
- Don't nest cards.
- Don't animate on every section; one authored moment per page.
