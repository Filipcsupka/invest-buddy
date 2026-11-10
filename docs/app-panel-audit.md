# App panel audit

Audit of every entry in the left panel of the app shell (`src/components/nav.tsx`), written on 2026-11-10 against main at 760a3ee.

## How this was checked

The page column comes from the route folders under `src/app/[locale]/(app)` and `(marketing)`. The licence column comes from the code that gates each route: `PRIVATE_DATA_SECTIONS` and the `EODHD_PRIVATE_USE` check in `src/proxy.ts`, the market gate in `src/markets/gate.ts`, `requireEtfDataAccess` in `src/app/[locale]/(app)/owner/data/access.ts`, and `src/data/sources-registry.ts`. The data column and the notes on empty data come from `docs/tasks-open.md` (status 2026-11-07 and handoff 2026-11-10), `docs/eodhd.md`, `docs/eodhd-insider.md` and `docs/etf-research.md`.

No live database or cluster was queried for this audit. Row counts and "empty" statements are the ones recorded in those documents on the dates given, and they may have moved since.

## Owner decisions that bound the result

First customers are served from EODHD data only: US equity scoring, SEC filings, insider filings, track record, portfolio, methodology and pricing. More sources come after revenue. Customer accounts use email and password, with the tiers Free, Plus at 9.90 EUR per month, and a 14-day trial. The owner (a session user id in `OWNER_USER_IDS`) sees everything unlocked.

## What "licensed for customers" means here

While `EODHD_PRIVATE_USE=on`, every EODHD-derived route is owner-only, because the vendor terms on the current plan forbid showing the data to others (TASK-064 is open). Customers will see those pages only once that switch is off, which needs the display licence. Until then the panel shows these entries locked with a Plus chip and a preview page, and the entries open with a Free account chip when the switch goes off. The market views (indices, forex, crypto, economy, congress, news, screener) are owner-only whatever the licence says, because `marketsViewable` requires the owner session.

## Table

| Entry | Page exists | Data source | Licensed for customers | Decision |
| --- | --- | --- | --- | --- |
| Dashboard | Yes, `/dashboard` | Stored scores built from EODHD prices and fundamentals, SEC facts, Alpha Vantage EPS | Only after the EODHD display licence (private gate on today) | Show, locked by tier while the gate is on |
| Scanner | Yes, `/scanner` | Same stored scores | Same | Show, locked by tier while the gate is on |
| Heat map | Yes, `/heatmap` | Same stored scores, sector and price change | Same | Show, locked by tier while the gate is on |
| Track record | Yes, `/track-record` | Score history and outcomes derived from EODHD bars | Same (the derivation from vendor bars is still to be confirmed in TASK-064) | Show, locked by tier while the gate is on |
| Insider filings | Yes, `/insiders` | SEC EDGAR Form 4 (public domain). EODHD Form 4 lines are a fallback and are excluded from public display | The SEC rows yes. The route sits in the private list, so it is gated with the others | Show, locked by tier while the gate is on |
| Portfolio | Yes, `/portfolio` | Portfolio snapshots computed from stored scores and EODHD prices | Same as the dashboard | Show, locked by tier while the gate is on |
| Ideas | Yes, `/ideas` | Judge output | No: `ADVICE_OUTPUT` is off and the page returns 404 | Hide (already hidden by the flag) |
| Sizing guide | Yes, `/sizing` | Own content | No: `ADVICE_OUTPUT` is off | Hide (already hidden by the flag) |
| Methodology | Yes, `/methodology` | Own content | Yes, no vendor data | Show, open to all |
| Pricing | Yes, `/pricing` | Own content | Yes, no vendor data | Show, open to all |
| ETF research | Yes, `/etf` | EODHD fund data (300 funds tracked on 2026-11-07) and exchange catalogs. The region column was dashes and 26 of 31 incomplete funds stayed incomplete at the vendor | No: not in the first-customer scope, and `requireEtfDataAccess` returns 404 to non-owners once EODHD enrichment exists | Hide from customers, owner only. Listed under Coming later |
| ETF track record | Yes, `/etf/track-record` | ETF outcomes, which need picks at least 30 days old. The first run wrote no rows on 2026-11-07 | No, and no data to show yet | Hide from customers, owner only |
| Indices | Yes, `/indices` | EODHD market bars | No: owner-only through the market gate, outside the first-customer scope | Hide from customers, owner only |
| Forex | Yes, `/forex` | EODHD forex bars | Same | Hide from customers, owner only |
| Crypto | Yes, `/crypto` | EODHD crypto bars | Same | Hide from customers, owner only |
| Economy | Yes, `/economy` | EODHD macro indicators and Treasury rates, plus stored macro series. Some values were stale on 2026-11-07 (rates dated 5 November, German debt showing 1990) | No: owner-only through the market gate | Hide from customers, owner only. Listed under Coming later |
| Congress | Yes, `/congress` | EODHD congressional trades (193 rows on 2026-11-07) | No: owner-only through the market gate | Hide from customers, owner only |
| News | Yes, `/news` | EODHD news and sentiment (200 items on 2026-11-07). Display of article text has no cleared licence | No: owner-only through the market gate | Hide from customers, owner only |
| Screener | Yes, `/screener` | EODHD screener | No: owner-only through the market gate | Hide from customers, owner only |

## Coming later group

The panel may show one quiet group at the bottom with at most three items, as plain text with no link, no blur and no lock. It shows two.

Economy has a realistic later source that needs no new vendor: the US Treasury FiscalData and FRED series, which `src/data/sources-registry.ts` lists as public government or attribution-only sources with display allowed. The page exists and would need its stale series fixed first.

ETF research has a realistic later source in the EODHD fund data the collectors already store, once an ETF display licence is in place, the region column is filled and ETF outcomes have run for 30 days.

Indices, forex, crypto, congress, news and the screener have no entry in that group. They need EODHD market data to be cleared for display on its own, and nothing in the repository says when that will happen. The ETF track record has no data at all yet. All of them stay visible to the owner only.

## What the panel does with this

Customers and visitors receive the first two groups in the shared HTML (Stocks and Method and plans) and the Coming later group. The ETF and Markets groups render only after `/api/me` confirms the owner, so they are never in the shared HTML and never in a customer response. The owner sees them with an Owner only tag and does not see the Coming later group, since the real links replace it. Hiding an entry does not replace the server gate: the proxy and `requireEtfDataAccess` still answer 401 or 404 for a customer who types the address.

## Follow-ups outside this change

The `/etf` and `/etf/track-record` pages are not in `PRIVATE_DATA_SECTIONS` and are protected by a database check. Adding the owner gate in the proxy would make the guarantee independent of that query. The two ETF routes also return a plain 404 to a customer with no explanation, which is acceptable while the entries are hidden.
