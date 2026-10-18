# UI alignment audit

Checked on a local fixture build (`DATA_MODE=fixture`) at 1440 px and 390 px, light theme, with Playwright screenshots. A DOM script also compared the left edge of matching cells across sibling rows; its output was noisy (card grids differ on purpose), so each hit was checked in a screenshot.

Cause in every case: a column whose width came from its content (an `auto` table column, a flex row, or a grid track sized by `auto`), so the left edge moved from row to row.

## Found and fixed

| Where | Problem | Fix |
|---|---|---|
| Landing, "Highest scores" card | The status badge column was `auto`, so the score bar and percentage moved with the badge width (Conditions met, Watching, Waiting, Not now). | Rows share one parent grid through `subgrid`; the badge column is `max-content` of the widest badge. |
| Landing, "How a score is built" | Group bars and the mini rule list sized the points column per row, so tracks had different widths. | Parent grid with `subgrid` rows. |
| Dashboard and scanner tables | Auto layout. Score column and bar width differed per group table. Rank and ticker wrapped when a row had a long tag (NOW, NVDA). | `table-layout: fixed` with a `colgroup`, the same widths in every group table; the name block gets a max width so tags wrap inside it. The reason column of the broken group has its own widths. |
| Dashboard and scanner tables | The first header cell (sticky) had a different background from the other header cells. Header text sat at the bottom of the cell next to sort buttons that sit in the middle. | Same header background; header cells are vertically centred. |
| Dashboard and scanner tables | The "9 of 10" label was centred under the pips. | Left aligned under the pips. |
| Track record screening log | Auto layout, right-aligned score text under a left-aligned header. The status cell wrapped the track, icon and label differently per label width. | Fixed layout with a `colgroup`, left-aligned score. The status cell is a grid: track on top, icon and label below. |
| Portfolio weights and any `DataTable` | A `.num` header was left aligned while its figures were right aligned. | `.kit-table thead th.num` is right aligned. |
| Sector map | The "Sector average" pill sat beside the name on some cards and below it on others, so tiles started at different heights in a row. | The pill always sits under the name. |
| Sector map on a phone | The colour-by switch wrapped into a ragged pill with left-aligned options. | A full-width stack with centred options. |

## Looked at, left as is

- Methodology "How to read the status": the steps are indented on purpose (a ladder). Range and meaning text move with the step.
- Company page, structured inputs: two columns, one grid, rows line up.
- Card grids on the landing page (steps, states, proof) have different content per card by design; their inner rows align within each card.

## Also changed in this pass

- Sidebar: collapse button (see DESIGN.md, App shell).
- The inline theme script never reached the page. `themeScript` was exported from a `"use client"` file, so the server layout received a client reference, not a string, and a stored theme was only applied after hydration. Both pre-paint scripts now live in `src/components/pre-paint.ts`.
- The round dark and white notch at the bottom left of the sidebar is the Next.js dev indicator (an "N" badge), shown only by `next dev`. A production build has no such element (checked at 1440 x 900, light and dark). `devIndicators` is now off in `next.config.ts`.
- The market volatility source label is "Market volatility index" (SK: "Index trhovej volatility"). The collector and source registry are unchanged.
