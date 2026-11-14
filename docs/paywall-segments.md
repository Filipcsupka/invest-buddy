# Paywall segments

The markers identify sections of a page that belong to the free or the paid tier. `<PaywallSegment id="...">` reads the viewer's tier and applies the entry for that id in `src/config/tiers.ts`. The ids live in `src/paywall/segments.ts`. The full reasoning, the competitor evidence and the free depth numbers are in `docs/tier-map.md`. Decision of 2026-10-08, superseded on 2026-10-16: the markers no longer stand for "candidate" sections, each id has a final tier.

The owner sees paid segments with a small "Paid" badge. `?view=free` previews the free tier for the owner.

## Investor paths and plans

Owner request of 2026-11-13: the dashboard steers each visitor to one of three paths, and the paid plans follow them. Defaults the owner can change: the Passive yearly price, the plan names, and keeping the trial on Active.

| Path | Plan (stored tier) | Price | Opens |
| --- | --- | --- | --- |
| Active investor | Plus (`plus`), and the 14-day trial | 9.90 EUR a month or 99 EUR a year | Stocks: scores, scanner, shortlist, company pages, heat map, track record, portfolio, insiders, screener, news, congress. Everything Passive has. The paywall segments below |
| Passive investor | Passive (`passive`, migration 139) | 5 EUR a month or 50 EUR a year (yearly price proposed, owner to confirm) | ETF ratings, the ETF catalog and fund pages with their data tabs, indices, the economy page, the calendar |
| Market overview | Free account | Free | The method, the US macro calendar on the dashboard, the dashboard path cards. Indices, economy and calendar once a vendor display licence exists |

Prices live in `src/app/[locale]/pricing/plans.ts` (`PLAN_PRICES`), VAT included. Billing stays off: there is no checkout, and a Passive plan is granted only with `scripts/grant-entitlement.ts --tier passive`. The owner sees everything and gets no path cards.

### Access by route while `EODHD_PRIVATE_USE=on`

Checked in `src/proxy.ts` and again on each page. Tests: `src/proxy.test.ts` (route matrix), `src/viewer/investor-paths.test.ts`, `src/app/[locale]/(app)/indices/passive-access.test.tsx`, `src/app/[locale]/(app)/etf/access.test.tsx`, `src/app/[locale]/(app)/dashboard/paths.test.tsx`.

| Route | Visitor | Free | Passive | Active (Plus, trial) | Owner |
| --- | --- | --- | --- | --- | --- |
| `/dashboard` | Paths, macro calendar | Paths, macro calendar | Paths, macro calendar | Paths and the full board | Full board, no paths |
| `/stocks`, `/company/*`, `/heatmap`, `/track-record`, `/portfolio`, `/insiders` | Sign-in | Plus preview | Plus preview | Open | Open |
| `/screener`, `/news`, `/congress` | Sign-in | Plus preview | Plus preview | Open | Open |
| `/etf`, `/etf/fund/*`, `/etf/track-record` | Sign-in | Plus preview | Open | Open | Open |
| `/indices`, `/economy`, `/calendar` | Sign-in | Plus preview | Open | Open | Open |
| `/methodology`, `/pricing`, legal pages | Open | Open | Open | Open | Open |

The gates in code: `canSeeStockData` (stock data: owner or Active), `canUseFundData` and `canOpenFunds` (adds Passive), and `marketsViewable(viewer, env, section)` in `src/markets/gate.ts`, where `indices`, `economy`, `calendar` and `etf` are the fund sections. The dashboard is open through the proxy; the page reads no score, portfolio or market data for a viewer without stock access (`dashboardStockAccess`).

Stock routes and dashboard stock blocks need `canSeeStockData`: the owner or Active (Plus and trial), regardless of `EODHD_PRIVATE_USE` and `VENDOR_DISPLAY_LICENSE`. A display licence only widens fund and index data. The one exception is fixture mode with private use off, which has only the checked-in sample universe and stays open for local runs and the e2e suite (`stockRoutesGated`).

With `VENDOR_DISPLAY_LICENSE=on` and private use off, a signed-in free account also opens indices, economy and calendar, and the sidebar unlocks them for it. The ETF catalog, fund pages and fund data tabs stay Passive and Active, licence or not.

On the ETF detail page (`/etf/[symbol]`), the call badge (buy zone, watch, avoid), the call column and the plan card (entry zone, add when, stop adding when) are the owner's research notes and render only for the owner. Customers, Passive and Active included, see the rule observations: thesis, events, risks, costs, evidence, history dates and measured outcomes (ADR-001).

For the paywall segments below, Passive counts as `free`: they are stock depth.

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

Landing, methodology, legal pages and the dashboard's path cards need no marker. Stock pages require Active or owner access before their internal segments render, including the heat map, scanner filters and company scores. Owner sections (`/owner-allocation`, `/owner/research`) have no tier and stay behind `OWNER_VIEW`.

## Legal gates come first

`ADVICE_OUTPUT`, `OWNER_VIEW` and `IDEAS_PAGE` apply before any tier check, and `admin` does not bypass them. With `ADVICE_OUTPUT` off, `/sizing` and `/ideas` return 404 and the idea card shows only the rule state and evidence, for every tier. `docs/wording-gate.md` lists what the flag holds back. ADR-001 limits public output to informational screening: a tier must not turn the wording into personal investment advice, and no owner EUR amount is ever public.

## Pages and routes

- `/scanner` redirects to `/stocks`. The stock route needs Active or owner access. Filtered URLs and `?view=` previews are not in the sitemap.
- `/pricing` shows the three plans side by side (Free market overview, Passive, Plus as the Active plan) with prices and the VAT note, a table of what each plan opens, and the stock features by plan built from `src/config/tiers.ts` (Free and Passive: not included; Plus: included or its limit). Paid plans show "Opens soon" and a waitlist form; nothing can be bought.
- Locked text is not in the HTML for a free viewer, so crawlers see the free version.

## Adding a segment

Add the id to `src/paywall/segments.ts` and its tier to `src/config/tiers.ts` (a missing tier fails `tsc`), wrap the section in `PaywallSegment`, add a teaser line in `src/i18n/tier-messages.ts`, and for a paid id add a row in `src/i18n/pricing-messages.ts` (`src/i18n/pricing-messages.test.ts` fails without it). Update the table above.
