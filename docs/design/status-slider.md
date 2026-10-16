# Status slider: design spec (ST0)

This is the build spec for lane STATUS (`docs/roadmap/lane-status.md`). ST2 builds the slider and the company page header from it, ST3 the dashboard and scanner rows, the methodology legend and the home text, AL1 and AL2 the Telegram messages. ST1's `StatusView` supplies the data. If a detail is missing here, the rule is: the reader must see the status, its position on the scale and how much data it rests on without reading anything else on the page.

Inputs that bind this spec:

- Lane decisions 1 to 6 (2026-10-11). The engine, the 25 points and the thresholds do not change. Only the display changes.
- ADR-001: informational screening, the same output for every visitor, rule-state labels, a disclaimer next to each status and alert, no urgency, no targets.
- `docs/wording-gate.md`: with `ADVICE_OUTPUT` off nothing names a trade. The green label is "Conditions met" / "Podmienky splnené". "Buy zone" / "Zóna nákupu" exists only behind the flag.
- Owner priority: the status is clear and trustworthy at a glance. A rule without data shows "No data", never 0 points.

## 1. What we borrow from other sites, and why

Source: the vault notes in `projects/investing-platform/research/market-homework/`. Most of those notes were taken from search summaries because the sites block plain fetches. They describe how each score is built and sold. They say little about exact visuals. The borrowed patterns below are therefore structural, and the visuals are our own.

| Site (note) | What the note records | What we take | Why |
| --- | --- | --- | --- |
| Danelfin | One AI Score from 1 to 10 per stock, with Fundamental, Technical, Sentiment and Low Risk sub-scores shown next to it. Model is closed. | One headline status per ticker, with the three group subtotals (F, T, M) under it. | A single reading is what a visitor remembers. The sub-scores answer "why" without opening the page. Unlike Danelfin, every point links to a rule. |
| Danelfin | "Probability of beating the market in the next 3 months" on the home page. | Nothing. | That wording is a forecast. ADR-001 rules it out. Our labels name the rule state only. |
| Seeking Alpha | Quant rating 1.0 to 5.0 on a five-step scale; five factor grades; a very weak grade caps the rating at Neutral; "updated daily before the open". | A five-step scale. The cap rule becomes our red step: a rejection rule puts the ticker on step 1 whatever its points. A dated "as of" line next to the status. | A five-step scale is familiar to readers of rating sites, and the cap mirrors our rejection rules exactly. The update line says how fresh the reading is. |
| Seeking Alpha | Labels run from Strong Sell to Strong Buy. | Nothing. | Those are trade instructions. Our steps are named after rule states. |
| Zacks | Rank 1 to 5, top 5% get Rank 1. Note: "A single clear rank sells. Keep the number small and the method readable." | Five steps, not ten or a hundred. | Five steps can be read without a legend after the first visit. |
| TipRanks | Smart Score 1 to 10 from eight inputs, weights not disclosed. | Confirmation chips that list the inputs behind the reading (Form 4 insider buying, EPS, guidance, catalyst, volume). | Readers want to see which inputs agree. We show them as context only and publish that they do not move the band, so there is no hidden weighting. |
| Simply Wall St | Snowflake: five areas with six pass or fail checks each, checks named per company. | Every rule shows as met, not met or no data, by name, on the company page. | Named checks are easy to audit. A visual shape alone hides which check failed, so we keep the ten-block rule strip instead of a shape. |
| Stockopedia | Public methodology article per score component. | Every band in the legend and every rule row links to `/methodology`. | The note's lesson: link the method from every score. |
| Stock Rover, Danelfin, TipRanks | Method not explained, or weights hidden. Listed as their biggest gap in the notes. | The coverage line: how many of the 25 points rest on data today. | No note records a competitor that says how much of its score is missing. Showing it is the trust signal we can own. |

Patterns from IBD, Morningstar, Finviz, Koyfin, TradingView and Motley Fool were read and not used here. Their notes cover pricing, data terminals or human picks, not a per-ticker status.

## 2. The status model

Band comes from the engine state only (`ScoreResult.state`, mapped by ST1). Coverage and confirmations are shown next to it and never change it.

| Key | Step | Position (ST1) | Points | Hue | Icon (shape) | Telegram | EN label | SK label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `broken` | 1 of 5 | 0 | any, a rejection rule applies | red | octagon with a slash | 🔴 | Criteria broken | Kritériá porušené |
| `ignore` | 2 of 5 | 1 | 0 to 11 | orange | circle with a minus | 🟠 | Not now | Mimo výberu |
| `wait` | 3 of 5 | 2 | 12 to 14 | yellow (amber) | hourglass | 🟡 | Waiting | Čakanie |
| `watch` | 4 of 5 | 3 | 15 to 17 | blue | eye | 🔵 | Watching | Sledovanie |
| `setup` | 5 of 5 | 4 | 18 to 25 | green | circle with a check | 🟢 | Conditions met | Podmienky splnené |
| `insufficient` | off the scale | none | not computed | gray | dashed circle with a question mark | ⚪ | Not enough data | Nedostatok údajov |

With `ADVICE_OUTPUT` on, only the `setup` label changes, to "Buy zone" / "Zóna nákupu". Every other string stays as above.

`insufficient` is not a sixth step. The engine returns it when it cannot score at all (invalid inputs, fewer than 200 price bars). The slider is then drawn empty and gray, with no marker.

Missing data for a single rule is not `insufficient`. The ticker keeps its band. The rule shows "No data" and the coverage line says how many points had data.

## 3. Color tokens

Add to `:root` in `src/app/globals.css`, next to the existing tokens and in the same `light-dark()` form, so the theme toggle keeps working.

```css
  /* Status bands (lane STATUS). Only the status slider, the status chip and the row mini track use these. */
  --st-broken: light-dark(#b3261e, #ff8a7d);
  --st-broken-on: light-dark(#ffffff, #1a0705);
  --st-broken-wash: light-dark(#f6dcd8, #3d1b17);
  --st-ignore: light-dark(#b54708, #ffa463);
  --st-ignore-on: light-dark(#ffffff, #1f0e02);
  --st-ignore-wash: light-dark(#fbede2, #3a2412);
  --st-wait: light-dark(#8a6500, #f2c84b);
  --st-wait-on: light-dark(#ffffff, #1c1500);
  --st-wait-wash: light-dark(#f7f0d9, #3a2f0d);
  --st-watch: light-dark(#2340c4, #8fa3ff);
  --st-watch-on: light-dark(#ffffff, #0b0f1a);
  --st-watch-wash: light-dark(#dde3f8, #1c2547);
  --st-setup: light-dark(#16703f, #5fd391);
  --st-setup-on: light-dark(#ffffff, #04170c);
  --st-setup-wash: light-dark(#d5ecdd, #123524);
  --st-none: light-dark(#5d666d, #a9b2b6);
  --st-none-on: light-dark(#ffffff, #101315);
  --st-none-wash: light-dark(#e3e6e4, #262c30);
```

`--st-watch` equals the existing `--signal`, so the cobalt keeps one meaning. `--st-none` equals `--ink-3` in light and `--ink-2` in dark.

Each band has three roles:

- `--st-X` is the band color. It fills the active slider step and the mini track step, and it is the text color of the band label. It must reach 4.5:1 on `--sheet`, `--ground` and its own wash, so the same token works for text and for shapes.
- `--st-X-on` is the icon color drawn on a `--st-X` fill.
- `--st-X-wash` is the background of the status chip and of the inactive slider steps.

Contrast, computed with the WCAG 2.x relative luminance formula. `src/i18n/status-copy.test.ts` reads the token block above and fails if any pair drops under 4.5:1, so the table cannot drift from the tokens:

| Band | Theme | Band color on `--sheet` | on `--ground` | on its wash | `-on` on band color |
| --- | --- | --- | --- | --- | --- |
| broken | light | 6.14 | 5.60 | 5.03 | 6.54 |
| ignore | light | 5.09 | 4.65 | 4.73 | 5.43 |
| wait | light | 5.00 | 4.57 | 4.67 | 5.33 |
| watch | light | 7.58 | 6.92 | 6.31 | 8.07 |
| setup | light | 5.76 | 5.26 | 4.93 | 6.13 |
| none | light | 5.50 | 5.02 | 4.66 | 5.85 |
| broken | dark | 7.58 | 8.16 | 6.72 | 8.53 |
| ignore | dark | 8.86 | 9.54 | 7.45 | 9.57 |
| wait | dark | 10.84 | 11.67 | 8.25 | 11.36 |
| watch | dark | 7.30 | 7.86 | 6.30 | 8.06 |
| setup | dark | 9.25 | 9.96 | 7.19 | 9.90 |
| none | dark | 8.03 | 8.64 | 6.55 | 8.64 |

All text pairs pass AA for normal text (4.5:1). All shape pairs pass the 3:1 non-text rule (1.4.11). Inactive step outlines use `--rule-strong`, which measures 3.44 on the light sheet, 3.14 on the light ground, 3.32 on the dark sheet and 3.57 on the dark ground.

Light yellow is a dark amber (`#8a6500`) on purpose. A bright yellow cannot reach 3:1 on a light ground. Dark mode can use a true yellow.

Red and green have almost the same luminance in light mode (6.14 and 5.76), so a reader with red-green color blindness cannot tell them apart by color. That is acceptable only because of section 4.

### Rules of use

- Band hues appear only on: the slider, the status chip, the mini track in rows, and the band dots in the methodology legend. Charts, links, buttons, prices and the rule strip keep the current neutral and cobalt palette. Gain and loss colors (`--gain`, `--loss`) stay for price moves and are never used for status.
- Never put band text on a band fill. Labels sit on `--sheet`, `--ground` or the band wash.
- No gradients across the track. Each step is one flat color.

## 4. Not color alone

Every status is carried by four channels. Any one of them is enough to read it.

| Channel | How |
| --- | --- |
| Words | The band label is always printed next to the slider, in every row and in every Telegram message. |
| Position | Steps run left to right in a fixed order: broken, not now, waiting, watching, conditions met. The active step is where the marker is. |
| Shape | Each band has its own icon (section 2). The active step is taller than the inactive ones and carries a marker above it. |
| Color | Band hue on the active step, the label text and the chip. |

Screen readers get the label, the step number and the points in one sentence (string `status.summaryAria`). In forced-colors mode the fills disappear, so the active step also gets a 2px `CanvasText` border and keeps its icon; the label and marker are text and SVG with `currentColor`.

## 5. The slider

### Anatomy (large, company page)

```
                                         ▼  marker
 ┌──────────┐┌──────────┐┌──────────┐┌──────────┐┏━━━━━━━━━━┓
 │          ││          ││          ││          │┃    ✓     ┃  active step: band fill, icon in -on color,
 └──────────┘└──────────┘└──────────┘└──────────┘┗━━━━━━━━━━┛  4px taller than the others
  Criteria     Not now     Waiting     Watching   Conditions   step labels, active one bold in band color
  broken                                           met
  any          0 to 11     12 to 14    15 to 17   18 to 25     ranges, --ink-3, --t-xs
```

- Element: `<ol class="status-track" aria-label="{status.scaleAria}">` with five `<li class="status-step" data-band="…">`. The active `li` has `aria-current="step"` and `data-active`. This is a read-only indicator, so it is not `role="slider"` and takes no focus.
- Width: 100% of its column, max 44rem (same as the rule strip). Five equal steps. Steps are equal because `broken` is not a point range.
- Gap between steps: 3px.
- Inactive step: height 1.25rem (20px), background `--st-X-wash` of its own band, 1px `--rule-strong` border, radius `--radius`. No icon.
- Active step: height 1.5rem (24px), aligned to the bottom of the track so it rises 4px above the others, background `--st-X`, border 1px `--st-X`, icon 14px centered in `--st-X-on`.
- Marker: a 10px wide, 6px tall downward triangle in `--ink`, 4px above the active step, centered. It is the same color in every band so the eye finds it first.
- Step label: `--t-xs`, `--ink-2`, weight 520, wraps at most to two lines, centered under the step. The active label is `--st-X`, weight 700.
- Range line: under the label, `--t-xs`, `--ink-3`, tabular numbers.

### Small (rows, cards)

The mini track: five steps of 10px by 6px, gap 2px, total 58px. Inactive steps are `--rule` with no border. The active step is 10px by 10px in `--st-X`, aligned to the bottom. No marker, labels or ranges: the label sits next to it as text. Wrapped in `<span role="img" aria-label="{status.summaryAria}">`.

### Special states

- `broken`: marker on step 1. The points are struck out next to the status: "Points not counted: 20" (`status.pointsNotCounted`). Under the slider one line names the rejection rules: "Rejected by: Close below MA200" (`status.brokenBecause`, reasons joined with "; ").
- `insufficient`: all five steps drawn at inactive height with a 1px dashed `--st-none` border and `--sheet` background. No marker, no active step. The status line reads "Not enough data" with the gray icon. Under the slider: "Why: fewer than 200 daily prices (have 143)" (`status.insufficientBecause` with the engine's `invalidReasons`, localized by ST1). No points and no coverage line are shown, because nothing was scored.
- Watch with a pullback: the existing qualifier ("Pullback in uptrend" / "Pokles v rastovom trende") stays, shown after the label with the existing dip icon.

### Motion

None. The status is a reading. It does not animate on load or on theme change.

## 6. Confirmation chips

Five chips in a fixed order, always all five, so a missing confirmation is visible and the row does not shift between tickers:

| Key | Source field | EN | SK |
| --- | --- | --- | --- |
| `insider` | insider net buying over 90 days from Form 4 (`insider_net_buy_90d`, D20b) | Insider buying (Form 4) | Nákupy insiderov (Form 4) |
| `epsBeat` | `epsBeat` | EPS beat | EPS nad odhadom |
| `guidance` | `guidanceRaised` | Guidance raised | Zvýšený výhľad |
| `catalyst` | `productCatalyst` | Product catalyst | Produktový katalyzátor |
| `volume` | up/down volume ratio from the accumulation rule | Volume confirms | Objem potvrdzuje |

Each chip has three states. The label never changes; the icon and the border carry the state.

| State | Icon | Border | Text | Background |
| --- | --- | --- | --- | --- |
| yes | check (existing `IconCheck`) | 1px solid `--ink-2` | `--ink`, weight 620 | `--sheet` |
| no | cross (existing `IconCross`) | 1px solid `--rule` | `--ink-3`, weight 520 | transparent |
| no data | question mark in a dashed circle (new `IconNoData`) | 1px dashed `--rule-strong` | `--ink-3`, weight 520 | transparent |

- Chips are neutral, not band colored. They do not change the band, and a colored chip would read as if it did.
- Size: `--t-xs`, padding 2px 8px, gap 6px between chips, icon 12px, wrap onto more lines.
- Markup: `<ul class="confirm-list" aria-labelledby="confirm-title">`, each `<li>` holds the visible label and a visually hidden state word, so a screen reader hears "EPS beat: yes" (`status.confirmState.*`).
- Title above the chips: "Confirmations" / "Potvrdenia", with the note "Context only. They do not change the status." / "Len pre kontext. Stav nemenia." in `--ink-3`.

## 7. Coverage and rules without data

### Definitions (ST1)

- A rule has no data when its `RuleHit.unknown` is true. Today that can happen to revenue acceleration (4), earnings (3), catalyst (2), accumulation (1), rotation (2) and macro data (3). The four price rules always have data once a ticker is scored.
- Known points = 25 minus the points of rules with no data. Unknown points add nothing to the total, and they are not shown as 0.

### Coverage line

Shown under the points on the company page, in rows as the Data column, and in Telegram.

- All data: "Data: all 25 points" / "Údaje: všetkých 25 bodov", `--ink-2`, with `IconCheck`.
- Some missing: "Data: 19 of 25 points" / "Údaje: 19 z 25 bodov", `--ink`, weight 620, with `IconNoData`, then on the same line in `--ink-2`: "No data: Catalyst (2), Macro data (3)" / "Bez údajov: Katalyzátor (2), Makro údaje (3)". Rule names use the short names in `status.ruleShort.*`; each links to its row in the rule table (`#rule-{id}`).
- If known points are below 18 and the band is not `broken` or `insufficient`, add one more line: "With this data the ticker cannot reach Conditions met." / "S týmito údajmi ticker nemôže dosiahnuť stav Podmienky splnené." (`status.coverageCap`, with the current setup label filled in, so it follows the flag). The line is arithmetic on the known points. It tells the reader that a low step may come from missing data.

### Rule table row with no data

Today the table prints 0 for every rule that is not met. ST2 changes this:

| Rule state | Icon | Name | Points column |
| --- | --- | --- | --- |
| met | `IconCheck` | `--ink` | `+4` |
| not met | `IconCross` | `--ink-2` | `0` |
| no data | `IconNoData` | `--ink-2` | "No data" / "Bez údajov", `--ink-3`, `--t-xs` |

The detail line under a no-data rule keeps the existing source text that says what is missing and when it is checked (for example the catalyst empty note from CAT1). Each row gets `id="rule-{id}"` for the coverage links.

### Group subtotals

The group caption in the rule table and under the large rule strip reads "6/10" when all its rules have data, and "6/10, 2 no data" / "6/10, 2 bez údajov" (`status.groupNoData`) when some do not.

### Rule strip blocks

`ScoreMark` gets an `unknown` list next to `matched`. A block with no data has a 1px dashed `--rule-strong` border, no fill, and a 45 degree hatch at 10% `--ink`. That keeps three looks apart: filled (met), empty with a solid border (not met), dashed and hatched (no data). The strip's `aria-label` adds "{n} points without data" (`status.markNoData`).

## 8. Company page header

From 40rem (640px) up. The current `score-panel` is replaced. The title block and the data status line above it stay as they are.

```
NVDA  NVIDIA Corporation
[ Sector | Source | Session 9 Oct 2026 | Last reviewed | Next review ]
─────────────────────────────────────────────────────────────────────────────
 ✓ Conditions met                                   18 of 25 points
   Status as of 9 Oct 2026 · How the status works →  F 8/10  T 7/10  M 3/5
                                        ▼
 [ ░░░░ ][ ░░░░ ][ ░░░░ ][ ░░░░ ][ ███✓███ ]
 Criteria  Not now  Waiting  Watching  Conditions met
 broken
 any       0 to 11  12 to 14 15 to 17  18 to 25

 ⓘ Data: 23 of 25 points   No data: Catalyst (2)

 Confirmations   Context only. They do not change the status.
 [✓ Insider buying (Form 4)] [✓ EPS beat] [✕ Guidance raised] [? Product catalyst] [✓ Volume confirms]

 Informational screening only. Same rules for every visitor. No personal investment advice.
─────────────────────────────────────────────────────────────────────────────
 [ ten-block rule strip, as today, with no-data blocks hatched ]
```

Grid and sizes:

- Section `<section class="status-panel" aria-labelledby="status-title">`, border top 1px `--ink`, bottom 1px `--rule-strong`, padding `--s5` 0 `--s6`, gap `--s4`.
- Row 1 is a two-column grid, `minmax(0, 1fr) auto`, aligned to the baseline.
  - Left: `<h2 id="status-title" class="status-label">`, the band icon at 22px in `--st-X`, then the label in `--st-X`, `--t-h2`, weight 700. This is the largest text after the ticker. Under it in `--t-sm`, `--ink-3`: "Status as of {date}" and the methodology link.
  - Right: the points, "18 of 25 points" (`status.points`), number in `--t-h2` tabular, words in `--t-sm` `--ink-2`. Under it the group subtotals F, T, M as today. For `broken` this shows "Points not counted: 20" with the number struck through. For `insufficient` the right column is empty.
- Row 2: the large slider, full width up to 44rem.
- Row 3: the coverage line (section 7).
- Row 4: the chips (section 6).
- Row 5: the existing `Disclaimer` and `OperatorDisclosure`. The status label gets `aria-describedby` pointing at the disclaimer, as the chip does today.
- Then the rule strip, as today, with the no-data look from section 7.

The status label replaces the old big total as the first thing the eye lands on. The total moves right and becomes secondary, because two tickers with 18 points can be in different steps (one of them broken).

## 9. Dashboard and scanner rows

Both `ScreenTable` (dashboard) and `ScannerTable` replace the state chip with one status cell and add a Data column.

```
 Ticker              Status                         Points  Data    Rules
 NVDA  NVIDIA        ▁▁▁▁█ ✓ Conditions met          18      23/25   [strip]
 MU    Micron        ▁▁▁█▁ 👁 Watching               16      25/25   [strip]
 AMD   AMD           ▁▁█▁▁ ⧗ Waiting                 13      19/25 ? [strip]
 XYZ   Xyz Corp      █▁▁▁▁ ⊘ Criteria broken         (20)    25/25   [strip]
 NEW   New Co        ┄┄┄┄┄ ? Not enough data         no data         
```

- Status cell: mini track, then the band icon at 14px in `--st-X`, then the label in `--st-X`, `--t-sm`, weight 620. The cell holds `aria-describedby` to the page disclaimer, as today. The whole cell is one reading for a screen reader through the mini track's `aria-label` (`status.summaryAria`); the visible label is `aria-hidden` to avoid reading it twice.
- Points column: the total. For `broken` the number is in parentheses and struck through, with `title` and visually hidden text "Points not counted" (`status.pointsNotCounted`). For `insufficient` it shows "No data" in `--ink-3`.
- Data column (new, header "Data" / "Údaje"): "{known}/25" in tabular numbers. Under 25 it is followed by `IconNoData` and the cell gets a `title` with the no-data rule list. For `insufficient` the cell is empty.
- Grouping and order: the scanner already groups rows by state. Keep the groups in this order: Conditions met, Watching, Waiting, Not now, Criteria broken, Not enough data. Inside a group sort by points descending, then by known points descending, then by ticker. Each group heading carries the band icon and label in `--st-X` and the count.
- The existing state filter in the scanner uses the new labels and icons, in the same order.
- The dashboard tally (counts per state) uses the band icon and label for each count. Counts stay `--ink`; only the icon and label take the band color.

## 10. Methodology legend

ST3 replaces the "Rule states" section of `/methodology` (`#states`) with this legend and keeps the anchor, because the slider links to it.

```
 How to read the status
 Every ticker sits on one of five steps. The step comes only from the published rules.

 [mini track step 5] ✓ Conditions met    18 to 25   18 points or more and no rejection rule applies.
                                                    It describes the rules, not a trade.
 [mini track step 4] 👁 Watching          15 to 17   Close to the 18 point line.
 [mini track step 3] ⧗ Waiting           12 to 14   Some conditions are met, not enough to watch.
 [mini track step 2] ⊖ Not now           0 to 11    Too few published conditions are met.
 [mini track step 1] ⊘ Criteria broken   any        A rejection rule applies, so the points do not count.
 [dashed track]      ? Not enough data   none       The score cannot be computed, for example fewer
                                                    than 200 daily prices.

 Missing data
 A rule without data shows No data. It adds no points, it is not counted as a failed check,
 and the page says how many of the 25 points had data.

 Confirmations
 Insider buying, EPS beat, guidance raised, product catalyst and volume are shown next to the status
 for context. They do not change the step.
```

- A `<table>` with columns Step, Points, Meaning. Rows from green down to gray, so the top row is the highest step, matching the scanner groups.
- Each row's Step cell has the mini track, the icon and the label in band color.
- The two paragraphs below use `status.legendMissing` and `status.legendConfirm`.
- The existing rejection section (`#rejection`) stays and the broken row links to it.

Home text (ST3): one short block in the home "how it works" area with `home.statusTitle` and `home.statusBody`, plus the legend's mini tracks as a static row.

## 11. Mobile

Breakpoints follow the existing CSS: under 40rem (640px) is mobile.

- Company header: row 1 stacks. The status label comes first, then the points line ("18 of 25 points · F 8/10 T 7/10 M 3/5" on one line, wrapping if needed), then "Status as of" and the method link.
- The slider stays five equal steps across the full width. At 320px each step is about 60px. Inactive steps carry no label and no range. Only the active step has a caption under it: label in band color and range. The caption is centered under the active step and clamped so it never overflows the left or right edge (step 1 caption aligns left, step 5 aligns right). Under the track, the two end points get a small label in `--ink-3`: "Criteria broken" under the left edge and the setup label under the right edge, so the direction of the scale is clear. When the active step is 1 or 5, its caption replaces that end label.
- Chips wrap. Coverage line wraps after "Data: 19 of 25 points".
- Dashboard and scanner rows become two-line cards: line 1 ticker, name and the points; line 2 the status cell and "Data 23/25". Under 40rem the rule strip, sector and F, T, M columns are hidden.
- Touch: the methodology link and the coverage rule links have at least 44px tall hit areas (padding, not larger type).

## 12. Copy, EN and SK

ST2 and ST3 add these keys to `src/i18n/messages.ts`. The existing `states.*` values are replaced by the `status.labels.*` values, so the digest and every other place that reads `states.*` follows. The existing parity test in `src/i18n/messages.test.ts` covers the dictionary; `src/i18n/status-copy.test.ts` checks this table (both languages present, same placeholders, no dashes or filler words, flag wording kept in its keys).

Placeholders: `{label}` band label, `{step}` 1 to 5, `{points}` total, `{known}` known points, `{rules}` list of short rule names with points, `{reasons}` joined reasons, `{date}` formatted date, `{name}` chip label, `{n}` a count, `{setup}` the current setup label, `{ticker}`.

<!-- copy:start -->
| Key | EN | SK |
| --- | --- | --- |
| status.labels.broken | Criteria broken | Kritériá porušené |
| status.labels.ignore | Not now | Mimo výberu |
| status.labels.wait | Waiting | Čakanie |
| status.labels.watch | Watching | Sledovanie |
| status.labels.setup | Conditions met | Podmienky splnené |
| status.labels.insufficient | Not enough data | Nedostatok údajov |
| status.labelsAdvice.setup | Buy zone | Zóna nákupu |
| status.ranges.broken | any | ľubovoľný počet |
| status.ranges.ignore | 0 to 11 | 0 až 11 |
| status.ranges.wait | 12 to 14 | 12 až 14 |
| status.ranges.watch | 15 to 17 | 15 až 17 |
| status.ranges.setup | 18 to 25 | 18 až 25 |
| status.ranges.insufficient | none | žiadne |
| status.meaning.broken | A rejection rule applies, so the points do not count. | Platí vylučovacie pravidlo, takže body sa nepočítajú. |
| status.meaning.ignore | Too few published conditions are met. | Splnených je príliš málo zverejnených podmienok. |
| status.meaning.wait | Some conditions are met, not enough to watch. | Časť podmienok je splnená, na sledovanie to nestačí. |
| status.meaning.watch | Close to the 18 point line. | Blízko hranice 18 bodov. |
| status.meaning.setup | 18 points or more and no rejection rule applies. It describes the rules, not a trade. | 18 alebo viac bodov a neplatí žiadne vylučovacie pravidlo. Opisuje pravidlá, nie obchod. |
| status.meaning.insufficient | The score cannot be computed, for example fewer than 200 daily prices. | Skóre sa nedá vypočítať, napríklad pre menej ako 200 denných cien. |
| status.scaleAria | Status scale from Criteria broken to {setup} | Stupnica stavu od Kritériá porušené po {setup} |
| status.stepAria | Step {step} of 5 | Stupeň {step} z 5 |
| status.summaryAria | Status {label}, step {step} of 5, {points} of 25 points, data for {known} of 25 points | Stav {label}, stupeň {step} z 5, {points} z 25 bodov, údaje pre {known} z 25 bodov |
| status.summaryAriaBroken | Status {label}, step 1 of 5, points not counted | Stav {label}, stupeň 1 z 5, body sa nepočítajú |
| status.summaryAriaNone | Status {label}, no score | Stav {label}, bez skóre |
| status.asOf | Status as of {date} | Stav k {date} |
| status.methodLink | How the status works | Ako funguje stav |
| status.points | {points} of 25 points | {points} z 25 bodov |
| status.pointsNotCounted | Points not counted: {points} | Nezapočítané body: {points} |
| status.brokenBecause | Rejected by: {reasons} | Vylúčené pre: {reasons} |
| status.insufficientBecause | Why: {reasons} | Dôvod: {reasons} |
| status.noData | No data | Bez údajov |
| status.coverageFull | Data: all 25 points | Údaje: všetkých 25 bodov |
| status.coverage | Data: {known} of 25 points | Údaje: {known} z 25 bodov |
| status.coverageMissing | No data: {rules} | Bez údajov: {rules} |
| status.coverageCap | With this data the ticker cannot reach {setup}. | S týmito údajmi ticker nemôže dosiahnuť stav {setup}. |
| status.groupNoData | {n} no data | {n} bez údajov |
| status.markNoData | {n} points without data | Body bez údajov: {n} |
| status.columns.status | Status | Stav |
| status.columns.data | Data | Údaje |
| status.columns.points | Points | Body |
| status.confirmTitle | Confirmations | Potvrdenia |
| status.confirmNote | Context only. They do not change the status. | Len pre kontext. Stav nemenia. |
| status.confirm.insider | Insider buying (Form 4) | Nákupy insiderov (Form 4) |
| status.confirm.epsBeat | EPS beat | EPS nad odhadom |
| status.confirm.guidance | Guidance raised | Zvýšený výhľad |
| status.confirm.catalyst | Product catalyst | Produktový katalyzátor |
| status.confirm.volume | Volume confirms | Objem potvrdzuje |
| status.confirmState.yes | {name}: yes | {name}: áno |
| status.confirmState.no | {name}: no | {name}: nie |
| status.confirmState.unknown | {name}: no data | {name}: bez údajov |
| status.ruleShort.revenue-acceleration | Revenue | Tržby |
| status.ruleShort.earnings | Earnings | Zisk |
| status.ruleShort.catalyst | Catalyst | Katalyzátor |
| status.ruleShort.accumulation | Accumulation | Akumulácia |
| status.ruleShort.above-ma | Above MAs | Nad priemermi |
| status.ruleShort.uptrend | Uptrend | Trend |
| status.ruleShort.green-volume | Volume | Objem |
| status.ruleShort.dip | Dip | Pokles |
| status.ruleShort.rotation | Rotation | Rotácia |
| status.ruleShort.macro-data | Macro data | Makro údaje |
| status.legendTitle | How to read the status | Ako čítať stav |
| status.legendLede | Every ticker sits on one of five steps. The step comes only from the published rules. | Každý ticker je na jednom z piatich stupňov. Stupeň určujú len zverejnené pravidlá. |
| status.legendMissingTitle | Missing data | Chýbajúce údaje |
| status.legendMissing | A rule without data shows No data. It adds no points, it is not counted as a failed check, and the page says how many of the 25 points had data. | Pravidlo bez údajov má označenie Bez údajov. Nepridá body, nepočíta sa ako nesplnené a stránka uvádza, pre koľko z 25 bodov boli údaje. |
| status.legendConfirmTitle | Confirmations | Potvrdenia |
| status.legendConfirm | Insider buying, EPS beat, guidance raised, product catalyst and volume are shown next to the status for context. They do not change the step. | Nákupy insiderov, EPS nad odhadom, zvýšený výhľad, produktový katalyzátor a objem sú pri stave len pre kontext. Stupeň nemenia. |
| home.statusTitle | One status per ticker | Jeden stav pre každý ticker |
| home.statusBody | Five steps from Criteria broken to {setup}, set by the published rules. Gray means not enough data to score. | Päť stupňov od Kritériá porušené po {setup} podľa zverejnených pravidiel. Sivá znamená, že na skóre nie je dosť údajov. |
| telegram.changed | Was: {from} → Now: {to} | Bolo: {from} → Teraz: {to} |
| telegram.first | First rating: {to} | Prvé hodnotenie: {to} |
| telegram.confirmations | Confirmations: {list} | Potvrdenia: {list} |
| telegram.confirmationsNone | Confirmations: none | Potvrdenia: žiadne |
| telegram.open | Open {ticker} | Otvoriť {ticker} |
| telegram.method | Methodology | Metodika |
| telegram.disclaimer | Informational screening under the published methodology, not a personal recommendation. | Informačný skríning podľa zverejnenej metodiky, nie osobné odporúčanie. |
| telegram.weeklyTitle | Weekly status, week to {date} | Týždenný prehľad stavov, týždeň do {date} |
| telegram.weeklyUp | Moved up: {list} | Posun vyššie: {list} |
| telegram.weeklyDown | Moved down: {list} | Posun nižšie: {list} |
| telegram.weeklyNoMoves | No step changed this week. | Tento týždeň sa žiadny stupeň nezmenil. |
| telegram.weeklyDataChanges | Data changes: {list} | Zmeny v údajoch: {list} |
| telegram.weeklyCoverage | Full data for {n} of {total} tickers. | Úplné údaje má {n} z {total} tickerov. |
| telegram.weeklyMore | and {n} more | a ďalšie: {n} |
| telegram.weeklyDashboard | Open the stock screen | Otvoriť prehľad akcií |
<!-- copy:end -->

## 13. Telegram

Both messages use `parse_mode: "HTML"` (AL1 adds it to `TelegramNotifier`), with link previews off as today. Ticker names, labels and reasons are escaped (`&`, `<`, `>`). Links use the digest locale (`DIGEST_LOCALE`) and `SITE_URL`. Every message ends with `telegram.disclaimer`, and with the operator disclosure when `OPERATOR_DISCLOSURE_EN` or `_SK` is set (ADR-001: disclose owner holdings).

### Track line

Telegram has no reliable alignment: emoji and spaces differ in width per client, so a marker on a second line, as sketched in the lane file, lands under the wrong step. The track is therefore one line where only the active step is colored and the others are `▫️`:

| Band | Track line |
| --- | --- |
| broken | `🔴▫️▫️▫️▫️` |
| ignore | `▫️🟠▫️▫️▫️` |
| wait | `▫️▫️🟡▫️▫️` |
| watch | `▫️▫️▫️🔵▫️` |
| setup | `▫️▫️▫️▫️🟢` |
| insufficient | `▫️▫️▫️▫️▫️` |

The label is always on the line above, so the track is never the only carrier.

### Event alert

One message per ticker whose band changed since the previous scored session, including moves to and from `insufficient`. No message when only the points change inside a band. The delivery log key includes ticker, session and locale so a rerun does not post twice.

Slovak, flag off:

```html
🟢 <b>NVDA</b> · Podmienky splnené
▫️▫️▫️▫️🟢
Bolo: 🔵 Sledovanie (16) → Teraz: 🟢 Podmienky splnené (18 z 25 bodov)
Potvrdenia: ✓ Nákupy insiderov (Form 4) ✓ EPS nad odhadom ✓ Objem potvrdzuje
Údaje: 23 z 25 bodov · Bez údajov: Katalyzátor (2)
<a href="https://invest.filipcsupka.online/sk/company/NVDA">Otvoriť NVDA</a> · <a href="https://invest.filipcsupka.online/sk/methodology#states">Metodika</a>
Informačný skríning podľa zverejnenej metodiky, nie osobné odporúčanie.
```

English, flag off:

```html
🟢 <b>NVDA</b> · Conditions met
▫️▫️▫️▫️🟢
Was: 🔵 Watching (16) → Now: 🟢 Conditions met (18 of 25 points)
Confirmations: ✓ Insider buying (Form 4) ✓ EPS beat ✓ Volume confirms
Data: 23 of 25 points · No data: Catalyst (2)
<a href="https://invest.filipcsupka.online/en/company/NVDA">Open NVDA</a> · <a href="https://invest.filipcsupka.online/en/methodology#states">Methodology</a>
Informational screening under the published methodology, not a personal recommendation.
```

English, a move into broken:

```html
🔴 <b>XYZ</b> · Criteria broken
🔴▫️▫️▫️▫️
Was: 🔵 Watching (16) → Now: 🔴 Criteria broken (points not counted: 17)
Rejected by: Close below MA200
Data: all 25 points
<a href="https://invest.filipcsupka.online/en/company/XYZ">Open XYZ</a> · <a href="https://invest.filipcsupka.online/en/methodology#rejection">Methodology</a>
Informational screening under the published methodology, not a personal recommendation.
```

Slovak, a move into not enough data:

```html
⚪ <b>NEW</b> · Nedostatok údajov
▫️▫️▫️▫️▫️
Bolo: 🟡 Čakanie (13) → Teraz: ⚪ Nedostatok údajov (bez skóre)
Dôvod: menej ako 200 denných cien
<a href="https://invest.filipcsupka.online/sk/company/NEW">Otvoriť NEW</a> · <a href="https://invest.filipcsupka.online/sk/methodology#states">Metodika</a>
Informačný skríning podľa zverejnenej metodiky, nie osobné odporúčanie.
```

Rules for the alert:

- Line 1: band emoji, bold ticker, a middle dot, band label. With `ADVICE_OUTPUT` on, the green label is "Buy zone" / "Zóna nákupu" here too; nothing else changes.
- Line 3: `telegram.changed`, where `{from}` and `{to}` are emoji, label and points in parentheses. A first rating uses `telegram.first`. For `broken` the points are "points not counted: N" / "nezapočítané body: N"; for `insufficient` "no score" / "bez skóre".
- Confirmations list only the ones that are "yes". When none are, the line reads `telegram.confirmationsNone`. Not met and no data confirmations are left out of Telegram to keep it short; the web shows all five.
- The coverage line uses `status.coverage` or `status.coverageFull`, plus `status.coverageMissing` when needed. It is left out for `insufficient`.
- `broken` adds `status.brokenBecause`; `insufficient` adds `status.insufficientBecause`.
- No exclamation marks, no "now" or "today" urgency, no price.

### Weekly summary

One message per week in the digest locale, sent after the last session of the week. It compares each ticker's band now with its band at the previous week's summary.

English, flag off:

```html
<b>Weekly status, week to 9 Oct 2026</b>
🟢 Conditions met 3 · 🔵 Watching 5 · 🟡 Waiting 7
🟠 Not now 12 · 🔴 Criteria broken 6 · ⚪ Not enough data 2

🟢 <a href="https://invest.filipcsupka.online/en/company/NVDA">NVDA</a> 19 · <a href="https://invest.filipcsupka.online/en/company/AVGO">AVGO</a> 18 · <a href="https://invest.filipcsupka.online/en/company/ANET">ANET</a> 18
🔵 <a href="https://invest.filipcsupka.online/en/company/MU">MU</a> 17 · <a href="https://invest.filipcsupka.online/en/company/AMD">AMD</a> 16 · <a href="https://invest.filipcsupka.online/en/company/TSM">TSM</a> 16 · <a href="https://invest.filipcsupka.online/en/company/ASML">ASML</a> 15 · <a href="https://invest.filipcsupka.online/en/company/META">META</a> 15

Moved up: NVDA 🔵→🟢, ORCL 🟠→🟡
Moved down: XYZ 🔵→🔴
Data changes: NEW 🟡→⚪
Full data for 31 of 35 tickers.

<a href="https://invest.filipcsupka.online/en/dashboard">Open the stock screen</a> · <a href="https://invest.filipcsupka.online/en/methodology#states">Methodology</a>
Informational screening under the published methodology, not a personal recommendation.
```

Slovak, flag off:

```html
<b>Týždenný prehľad stavov, týždeň do 9. 10. 2026</b>
🟢 Podmienky splnené 3 · 🔵 Sledovanie 5 · 🟡 Čakanie 7
🟠 Mimo výberu 12 · 🔴 Kritériá porušené 6 · ⚪ Nedostatok údajov 2

🟢 <a href="https://invest.filipcsupka.online/sk/company/NVDA">NVDA</a> 19 · <a href="https://invest.filipcsupka.online/sk/company/AVGO">AVGO</a> 18 · <a href="https://invest.filipcsupka.online/sk/company/ANET">ANET</a> 18
🔵 <a href="https://invest.filipcsupka.online/sk/company/MU">MU</a> 17 · <a href="https://invest.filipcsupka.online/sk/company/AMD">AMD</a> 16 · <a href="https://invest.filipcsupka.online/sk/company/TSM">TSM</a> 16 · <a href="https://invest.filipcsupka.online/sk/company/ASML">ASML</a> 15 · <a href="https://invest.filipcsupka.online/sk/company/META">META</a> 15

Posun vyššie: NVDA 🔵→🟢, ORCL 🟠→🟡
Posun nižšie: XYZ 🔵→🔴
Zmeny v údajoch: NEW 🟡→⚪
Úplné údaje má 31 z 35 tickerov.

<a href="https://invest.filipcsupka.online/sk/dashboard">Otvoriť prehľad akcií</a> · <a href="https://invest.filipcsupka.online/sk/methodology#states">Metodika</a>
Informačný skríning podľa zverejnenej metodiky, nie osobné odporúčanie.
```

Rules for the summary:

- Counts: all six bands in fixed order, zeros included, so the shape of the week is comparable from one message to the next.
- Ticker lists: only green and blue, each sorted by points descending, then ticker. At most 15 links per band; the rest becomes `telegram.weeklyMore` ("and 4 more" / "a ďalšie: 4"), and the dashboard link covers them.
- Moves: up and down compare steps 1 to 5. Moves to or from gray go under "Data changes", because gray is not a step. If nothing moved, print `telegram.weeklyNoMoves` instead of the three lines.
- Coverage: `telegram.weeklyCoverage` counts tickers with all 25 points known.
- The whole message stays under 4,096 characters, so it is never split by `splitMessage` (a split could cut an HTML tag). AL2's test checks the length with the full universe.

## 14. Flag summary

| Surface | `ADVICE_OUTPUT` off | `ADVICE_OUTPUT` on |
| --- | --- | --- |
| Green label, web and Telegram | Conditions met / Podmienky splnené | Buy zone / Zóna nákupu |
| `status.coverageCap`, `status.scaleAria`, `home.statusBody` | fill `{setup}` with the flag-off label | fill `{setup}` with the flag-on label |
| Every other string in section 12 | unchanged | unchanged |
| Disclaimer next to status and in every Telegram message | shown | shown |

The lawyer question (tasks-open G5) still applies before the flag is turned on.

## 15. Acceptance checks for the build tasks

ST2 (slider and company header):

- Render tests, EN and SK, for each of the six states: the label text, `aria-current="step"` on the right step (none for `insufficient`), the icon, and the summary sentence.
- A ticker with two no-data rules shows "No data" in their points cells, "Data: 20 of 25 points" (or the matching number), both rules in the no-data list, and never a "0" in those rows.
- A ticker with known points under 18 shows `status.coverageCap`; one with 18 or more does not.
- With `ADVICE_OUTPUT` off no rendered company page contains "Buy zone" or "Zóna nákupu"; with it on, the green label does.
- The five chips render in the fixed order with yes, no and no data states.

ST3 (rows, legend, home):

- Scanner and dashboard rows have the mini track, icon and label for every state, the Data column, and the group order from section 9.
- `/methodology#states` shows the six-row legend in EN and SK.

AL1 and AL2 (Telegram):

- Formatter tests for each mockup in section 13: exact output in EN and SK, HTML escaping of `<` and `&` in a name, and the flag on and off green label.
- The weekly summary stays under 4,096 characters for 60 tickers with 15 in green.

## 16. Open questions for the owner

- The lane file's Telegram sketch used "23 z 25 bodov má overené zdroje" (verified sources). This spec uses "Údaje: 23 z 25 bodov" because the engine knows whether data exists, not whether a person verified it. Confirm the plainer wording.
- The lane sketch showed all five colors with a marker on a second line. This spec uses a one-line track with only the active step colored, because the second-line marker does not align across Telegram clients. Confirm.
- `status.coverageCap` ("With this data the ticker cannot reach Conditions met") is new. It explains low steps caused by missing data. Drop it if the owner reads it as too close to a forecast.
