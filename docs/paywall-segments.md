# Paywall segments

The markers identify sections of a page that belong to the free or the paid tier. `<PaywallSegment id="...">` reads the viewer's tier and applies the entry for that id in `src/config/tiers.ts`. The ids live in `src/paywall/segments.ts`. The full reasoning, the competitor evidence and the free depth numbers are in `docs/tier-map.md`. Decision of 2026-10-08, superseded on 2026-10-16: the markers no longer stand for "candidate" sections, each id has a final tier.

Today no auth exists, so every request resolves to `admin`: all content shows, and a paid segment carries a small "Paid" badge. `?view=free` previews the free tier for an admin. Prices: none in beta (W17).

## Segment ids and tiers

| Segment id | Page | What it shows | Tier | Legal gate |
| --- | --- | --- | --- | --- |
| `scanner-rows-full` | Scanner | Result rows, every ticker | free | None |
| `scanner-filters-advanced` | Scanner | Score range, minimum F, T and M, source and held filters, sort by F, T or M | paid, lock | None |
| `scanner-streak` | Scanner | Rules-met streak in days, gained and lost counts, change presets | paid, lock | None |
| `insiders-history` | Insiders | Events older than the free window (180 days) | paid, depth-limited | `INSIDERS_PAGE` |
| `score-history` | Company | Total score by scan day, parts and state | paid, depth-limited (90 days free) | None |
| `idea-card` | Company | Action, size tier, rationale, setup, plan and evidence | paid, lock | `ADVICE_OUTPUT` |
| `ideas-list` | Ideas | The ideas list | paid, lock | `ADVICE_OUTPUT` and `IDEAS_PAGE` |
| `portfolio-performance` | Portfolio | Indexed return, benchmark chart and performance figures | free | None |
| `portfolio-weights` | Portfolio | Position weights | free | None |
| `track-record-periods` | Track record | By-period table | free | None |
| `track-record-signals` | Track record | Dated signals and forward returns | free | None |
| `track-record-history` | Track record | Historical score snapshots and ticker details | free | None |
| `track-record-worst` | Track record | The weakest stored outcomes | free | None |
| `track-record-benchmark` | Track record | Benchmark chart | free | None |
| `sizing-matrix`, `sizing-cash`, `sizing-add`, `sizing-example` | Sizing | Tier percentages, cash bands, add and reduce rules, worked example | free | `ADVICE_OUTPUT` |

Features that are not page markers yet (ids in `FEATURES` in `src/config/tiers.ts`): `discovery-list` (paid), `saved-screens` (paid, free count), `watchlist` (paid, free count), `alerts-daily` (paid, free count), `alerts-weekly` (free) and `csv-export` (paid).

Everything else needs no marker and is free: landing, methodology, legal pages, dashboard, heat map, the scanner's search, state and sector filters, liquidity floor and basic presets, and the company page's status, score, rules checklist with thresholds, rejection checks, inputs, flags, data status and chart. Owner sections (`/owner-allocation`, `/owner/research`) have no tier and stay behind `OWNER_VIEW`.

## Legal gates come first

`ADVICE_OUTPUT`, `OWNER_VIEW` and `IDEAS_PAGE` apply before any tier check, and `admin` does not bypass them. With `ADVICE_OUTPUT` off, `/sizing` and `/ideas` return 404 and the idea card shows only the rule state and evidence, for every tier. `docs/wording-gate.md` lists what the flag holds back. ADR-001 limits public output to informational screening: a tier must not turn the wording into personal investment advice, and no owner EUR amount is ever public.

## Pages and routes

- `/scanner` is a public page. It is listed in the sitemap without query strings. The old statement that `/scanner` redirects to the dashboard was wrong: it returned 404 while `PAYWALL` was off, and `PAYWALL` no longer hides it. Filtered URLs and `?view=` previews are not in the sitemap.
- `/pricing` shows the free and paid comparison built from `src/config/tiers.ts`, with no price and a waitlist form, only while `WAITLIST` is on.
- Locked text is not in the HTML for a free viewer, so crawlers see the free version.

## Adding a segment

Add the id to `src/paywall/segments.ts` and its tier to `src/config/tiers.ts` (a missing tier fails `tsc`), wrap the section in `PaywallSegment`, add a teaser line in `src/i18n/tier-messages.ts`, and for a paid id add a row in `src/i18n/pricing-messages.ts` (`src/i18n/pricing-messages.test.ts` fails without it). Update the table above.
