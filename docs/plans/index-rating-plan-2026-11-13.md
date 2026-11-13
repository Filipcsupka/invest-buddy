# Indices investigation and plan

Checked 2026-11-13. Production queries ran as `invest` against `invest`, each in `BEGIN; SET TRANSACTION READ ONLY; ... COMMIT;`. No repository files were edited.

## Current page and data path

- `/[locale]/indices` calls `assetSummaries("index")` then `AssetListPage` and `AssetTable`. The SQL reads enabled `tracked_assets`, the latest 30 `asset_bars` closes and the last prior-year close for YTD. It displays last close, 1d, 5d, YTD and a sparkline. Paths: `src/app/[locale]/(app)/indices/page.tsx:19-20`, `src/db/markets.ts:31-69`, `src/app/[locale]/(app)/indices/_components/asset-table.tsx`.
- The detail route resolves the index code through `vendorSymbolFor`, reads up to 400 daily OHLCV bars plus 52-week high/low, then reads the latest stored components. The shared detail view shows close, 1d/5d/YTD, chart, 52-week high/low and dates. The components table currently omits the stored weight. Paths: `src/app/[locale]/(app)/indices/[symbol]/page.tsx:24-48`, `src/db/markets.ts:72-140`, `src/app/[locale]/(app)/indices/_components/asset-pages.tsx:28-62`.
- Daily EOD bars come from `EodhdClient.eod()` in `src/jobs/eodhd-market-bars.ts:25-43`; the index CronJob calls `--class index`. Current stored index series each have around 1,200–1,450 daily rows from 2021-11-08. The Sunday component job calls fundamentals `filter=Components`, charges the code 10 calls per request, retries after 28 days, and stores code/exchange/name/sector/industry/weight in `index_components`. `src/jobs/eodhd-index-components.ts:27-54`, `src/db/markets.ts:120-175`, `migrations/120_markets_views.sql:5-22`.
- Historical market cap runs weekly for a bounded set of stock subjects (`--max-symbols 80`), not indices. `src/jobs/eodhd-market-cap.ts:29-61`, `src/db/market-cap.ts`, CronJobs in `deploy/gitops/gitops/apps/invest-buddy/base/markets-cronjob.yaml:3-42,189-304`.
- Page gate: `assertViewable("eodhd")`; the current EODHD registry record is unverified and `canDisplay("eodhd")` is false. Migrations document `display_allowed=false` for the stored market rows. Production counts also returned zero display-allowed index bars, components, and market-cap rows. Customer delivery of these vendor values is blocked on licence confirmation. Sources: `src/markets/gate.ts`, `src/data/sources-registry.ts:86,100-117`, `migrations/102_market_assets.sql:18-19`, `migrations/120_markets_views.sql:2,14-15,35-36,63-64`.

## Production counts

Tracked assets include 25 indices (migration seed has 25). The requested eight have bars as follows. The bar table has 31,665 total bars across these 25 indices (sum of the per-index counts below); each starts 2021-11-08. The last bar is 2026-11-11 for AEX and 2026-11-12 for the other 24.

| Index | Symbol | Bars | Latest component rows | Weighted rows |
|---|---|---:|---:|---:|
| S&P 500 | GSPC.INDX | 1,259 | 503 | 503 |
| Nasdaq 100 | NDX.INDX | 1,259 | 101 | 0 |
| Dow | DJI.INDX | 1,259 | 30 | 30 |
| VIX | VIX.INDX | 1,292 | 0 (refresh `empty`) | 0 |
| DAX | GDAXI.INDX | 1,279 | 39 | 0 |
| CAC 40 | FCHI.INDX | 1,285 | 40 | 0 |
| Euro Stoxx 50 | STOXX50E.INDX | 1,289 | 47 | 0 |
| Nikkei 225 | N225.INDX | 1,226 | 224 | 0 |

Across all indices, `asset_bars` has 31,665 rows; all 25 have data. `index_components` has 8,293 rows across 24 indices, all latest snapshots dated 2026-11-06; refresh results are 24 `ok`, 1 `empty` (VIX). The current components table has 3,584 distinct US components. Weight coverage is confined to GSPC, DJI, DJT and DJU in the current data: 568 total weighted rows. This is a stored-data observation, not a vendor capability limit.

Latest component counts for all tracked indices: AEX 28; AXJO 199; BSESN 30; BVSP 69; DJI 30; DJT 20; DJU 15; FCHI 40; GDAXI 39; GSPC 503; GSPTSE 225; HSI 95; IBEX 35; IXIC 3,234; KS11 785; MXX 32; N100 100; N225 224; NDX 101; NSEI 50; SSEC 1,445; SSMI 20; STOXX50E 47; TWII 927; VIX 0. The 8,293 historical component rows represent 7,874 distinct code/exchange pairs.

`market_cap_weekly`: 41,584 points for 160 stock symbols, from 2021-07-23 to 2026-11-04. Joining current component codes to US cap tickers gives 76/503 S&P 500, 30/101 Nasdaq 100, 7/30 Dow; coverage outside these US universes is near zero (STOXX50E 1/47, GDAXI 0/39, FCHI 0/40, Nikkei 0/224). A broader join by each component exchange found 115 current US components with cap; none for the other exchange codes. These are narrow-coverage historical caps, not a complete market-cap feed for index holdings.

Stored fundamentals: `fundamentals_pit` has 612,916 fact rows, 1,503 tickers and 16 concepts. It contains stock filing fundamentals (revenue, income, EPS, shares and expenses), not stored EODHD index `General`/`Components` snapshots. `fundamentals_snapshots` has 3,784 rows for 519 tickers (2026-10-02 to 2026-11-12) with these top-level score inputs: `epsBeat`, `memePump`, `noRevenue`, `guidanceRaised`, `productCatalyst`, `revenueDeclining`, `revenueGrowthPrior`, `revenueAccelerating`, `revenueGrowthCurrent`, `earningsMissAndGuidanceCut`, `insiderOrInstitutionalAccumulation`. It has no stored valuation history. Among current component codes, point-in-time fundamentals coverage is GSPC 341/503; NDX 97/101; Dow 30/30; DAX 2/39; CAC 2/40; Euro Stoxx 5/47; Nikkei 0/224. Those numbers count a PIT record for the bare code, not complete valuation coverage.

Latest stock score data mapped to current index membership by ticker code: S&P 500 has 185 scored of 503, Nasdaq 69/101, Dow 11/30, DAX 1/39, CAC 1/40, Euro Stoxx 3/47, Nikkei 0/224. VIX has no components. Stored `state='Criteria broken'` counts in those scored overlaps were S&P 103, Nasdaq 47, Dow 5, Euro Stoxx 1, DAX/CAC/Nikkei 0. `Setup met` was 0 in all overlaps (0 in this query because SQL uses stored state and latest components; display-state reconciliation may differ). This mismatch and the partial ticker join mean component score share must carry a coverage denominator and be checked using the app's canonical symbol mapping before it affects a rating.

### SQL evidence

The production bar query (run read-only) was:

```sql
SELECT a.vendor_symbol,count(b.bar_date) bars,min(b.bar_date),max(b.bar_date),
       count(*) FILTER (WHERE b.display_allowed) public_allowed
FROM tracked_assets a LEFT JOIN asset_bars b USING(vendor_symbol)
WHERE a.asset_class='index'
GROUP BY a.vendor_symbol,a.sort ORDER BY a.sort;
```

The component counts used the latest date per index:

```sql
SELECT index_symbol,max(as_of),
       count(*) FILTER (WHERE as_of=(SELECT max(x.as_of) FROM index_components x
                                    WHERE x.index_symbol=c.index_symbol)) latest_rows,
       count(*) FILTER (WHERE weight IS NOT NULL AND as_of=(SELECT max(x.as_of)
            FROM index_components x WHERE x.index_symbol=c.index_symbol)) latest_weighted
FROM index_components c GROUP BY index_symbol ORDER BY index_symbol;
```

The main count queries also checked `index_component_refresh` by status, `market_cap_weekly` rows/distinct symbols/date range/display flag, and latest fundamentals/score joins. Example coverage join (simplified to latest member snapshots; bare ticker matching is imperfect):

```sql
WITH c AS (
  SELECT DISTINCT ON(index_symbol,code) index_symbol,code,exchange
  FROM index_components ORDER BY index_symbol,code,as_of DESC
), fp AS (SELECT DISTINCT ticker FROM fundamentals_pit),
fs AS (SELECT DISTINCT ticker FROM fundamentals_snapshots),
sr AS (SELECT DISTINCT ON(ticker) ticker FROM score_results ORDER BY ticker,as_of DESC),
mc AS (SELECT DISTINCT ON(vendor_symbol) vendor_symbol FROM market_cap_weekly
       ORDER BY vendor_symbol,week_end DESC)
SELECT a.vendor_symbol,count(*) members,
 count(*) FILTER(WHERE fp.ticker IS NOT NULL) with_pit,
 count(*) FILTER(WHERE fs.ticker IS NOT NULL) with_snapshot,
 count(*) FILTER(WHERE sr.ticker IS NOT NULL) with_score,
 count(*) FILTER(WHERE mc.vendor_symbol IS NOT NULL) with_cap
FROM tracked_assets a JOIN c ON c.index_symbol=a.vendor_symbol
LEFT JOIN fp ON fp.ticker=c.code LEFT JOIN fs ON fs.ticker=c.code
LEFT JOIN sr ON sr.ticker=c.code LEFT JOIN mc ON mc.vendor_symbol=c.code||'.US'
WHERE a.vendor_symbol IN ('GSPC.INDX','NDX.INDX','DJI.INDX','VIX.INDX',
 'GDAXI.INDX','FCHI.INDX','STOXX50E.INDX','N225.INDX')
GROUP BY a.vendor_symbol,a.sort ORDER BY a.sort;
```

## EODHD availability

| Input | Vendor availability | Stored now / caveats |
|---|---|---|
| Current index constituents | Fundamentals `filter=Components`, fields code, exchange, name, sector, industry, weight. | Collected every 28 days. 24 indices successful, VIX empty. 503 S&P and 101 Nasdaq row counts match samples, but weights are missing for most indexes. Current page hides weight. |
| Historical constituents | Fundamentals history covers S&P 500. For broad world-index daily history, EODHD lists a separate Marketplace product covering 100+ indexes. | Not collected. Historical reconstruction must account for survivorship and Marketplace access/cost. |
| Index EOD history | EOD endpoint supports ticker history; docs list indices in the all-world EOD plan. | Existing index bars go back about five years, enough for MA50/200, drawdown, volatility and relative strength; currently only 30-close sparkline on list, up to 400 bars on detail. Verify EOD redistribution permission. |
| Index fundamentals `General` | Fundamentals endpoint accepts `.INDX` and returns `General`; docs describe it as index metadata. | No index fundamentals snapshots collected. Do not assume it contains valuation/growth ratios. |
| Component valuation/growth | Stock fundamentals sections list trailing/forward P/E, P/S, revenue and earnings growth fields. | Current persisted `fundamentals_snapshots` are score-oriented inputs, while `fundamentals_pit` has 16 filing concepts. Coverage is thin by index and no history of valuation ratios. New collection required; weighted aggregates require weights and compatible reporting periods. |
| Technical indicators API | EODHD supports SMA, volatility, slope, RSI, beta, etc., each technical request costs five API calls. | No technical API endpoint in `EodhdClient`; all listed index technical indicators can be calculated locally from stored OHLC closes at no vendor-call cost. |
| Historical market cap | EODHD separate historical market-cap endpoint supports US stocks and digital currencies; each call charged as 10 by current job. | Weekly collection is only a 160-symbol subject set and covers a small part of requested index membership. |
| Sector weights | Can derive from component weights + component sector fields; ETF/fund `ETF_Data` includes sector weights but that is an ETF/fund response, not evidence of index values. | Stored component sector/industry coverage exists but no weights for most requested indices; derive when weights reliable or show member counts and incomplete weights separately. |

Vendor sources: [EODHD Fundamentals API, index components and historical membership](https://eodhd.com/financial-apis/stock-etfs-fundamental-data-feeds), [EOD historical prices](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes), [Technical Indicators API](https://eodhd.com/financial-apis/technical-indicators-api), [plan coverage](https://eodhd.com/help/plans). Docs state only S&P 500 historical membership is included in ordinary Fundamentals; extended history needs the Marketplace product. Vendor documentation was checked online on 2026-11-13.

## Proposed informational market-condition rating

Keep this separate from the stock score and avoid buy/sell language per ADR-001. Proposed score is 0–100; calculate only on evidence with minimum coverage, publish a coverage percentage and a `not enough data` state if required inputs are missing. Bands: 80–100 Broad strength; 65–79 Constructive; 45–64 Mixed; 25–44 Weakening; 0–24 Broad weakness. These names describe current measured conditions, not a forecast or personal instruction. Thresholds below are an initial design proposal, not validated against outcomes.

| Factor | Points / initial rule | Source and coverage |
|---|---|---|
| Trend | 25: close above MA50 and MA200, MA50 above MA200, positive 50-session MA slope (6 each, 7 for slope); 12 for two conditions; 0 otherwise. | Existing 1,200+ index bars; derive local SMA/slope. VIX sign should be inverted or excluded from ordinary equity-market aggregate. |
| Breadth | 20: proportion above 50/200-day MAs: up to 10 each, linearly from 20% to 80%. Could also report advances/declines and 20-day new highs/lows. | Requires stock price series for current constituents, correctly mapped across exchanges, adjusted for corporate actions, with historical membership for point-in-time accuracy. Current coverage inadequate. |
| Valuation vs own history | 15: lower forward/trailing P/E percentile gets higher points; compare each index aggregate with its own 5-year history. No score where negative earnings or coverage is insufficient. | Requires stored component valuation snapshots and historical constituent weights, PIT membership (S&P 500 history or Marketplace for others). Current values/history absent. Do not substitute market cap for valuation. |
| Earnings momentum | 15: percentage of weighted components with positive YoY revenue and EPS growth, plus accelerating growth; normalize 0/50/80% to 0/half/full. | PIT filing fundamentals exist, but ticker/index coverage varies from 0 to 341 members and collection points do not capture full universe. Require per-factor sample denominator and common period/filing-date rules. |
| Volatility and drawdown | 15: 10 from annualized 20-day realized vol percentile vs its own 3-year history (lower vol more points); 5 for drawdown band (<5% full, 5–10% 3, >10% 0). | Local bars sufficient for each index. VIX index level may be a separate global context KPI, not a directional input to its own rating. |
| Our stock-score distribution | 10: share Setup met (0–5 points, 0 at 0%, 5 at 20%+), less Criteria broken share (0–5 point penalty, 0 at 0%, full penalty at 50%+). | Existing latest score rows cover 185/503 S&P, 69/101 Nasdaq, 11/30 Dow, sparse Europe, zero Nikkei; needs reliable component-to-instrument IDs and display-state classification. Require >=70% scored coverage before using; otherwise omit and renormalize. |

Neutral/partial-data handling: preserve factor-level `not assessed`; renormalize only over factors with coverage, but suppress the composite unless Trend and at least two other factors are assessed and total assessed weight is >=60%. Label score with as-of date and coverage. Disclose weights, input definitions, missing-data rate and licence/source note. Before launch, replay history and check stability; do not imply predictive validity.

Other computable details: index drawdown from rolling high, MA50/MA200 distance/slope, 1/5/20/63/252-session return and volatility are fully derivable from existing `asset_bars`. Relative strength vs other indices is derivable as returns in a common currency (or explicitly local currency); current bars are unadjusted close and currency conversion is a separate issue. VIX regimes can use its existing close series with labelled thresholds and percentiles. Advance/decline and new high/low counts need daily component bars and historical constituents; current constituent-only lists cannot produce unbiased history. Sector weights require component weights; current weight coverage is insufficient for most requested indices. Weighted P/E must be computed as aggregate market cap / aggregate earnings (or a documented weighted statistic), not average P/E, to avoid negative/near-zero denominator distortions.

## Page proposals

**Index list:** retain last close, 1d, 5d, YTD and 30-close sparkline; add a compact condition band/score with date and coverage, 1-month/3-month/1-year return, trend marker (close vs MA50/200), drawdown, and VIX context. Filters for region and instrument type; show last update/stale state. Keep rating methodology link and informational wording adjacent. Hide unsupported metrics rather than present zeros.

**Index detail:** header with score/band, input coverage and freshness; KPI row for close, 1d/5d/YTD, 1y return, drawdown, MA50/200 distance, realized volatility. Add selectable 1y/3y/5y price chart with MA overlays and drawdown strip; breadth history (above 50/200 MA, A/D, highs/lows) when coverage permits; factor contribution/evidence panel; valuation and earnings history with dates/sample sizes; sector weights and top components; full components table with weight, sector, industry, last price/change, rating state, and source date. VIX detail should use volatility-specific context, not equity breadth or component metrics.

## Ordered implementation plan: non-overlapping writers

1. **Market data model and collection writer** — owns `src/db/markets.ts` only. Add a dedicated index rating read model/query and correct ticker/exchange resolution helpers. Do not change page files, migrations or vendor jobs.
2. **Fundamentals collection writer** — owns new `src/jobs/eodhd-index-fundamentals.ts` plus its own job test and its own new migration file. Collect/store index `General` and current component snapshots with as-of/provenance and independent weight coverage; request historical membership only after confirming Marketplace product access/cost. No edits to page or rating-engine files.
3. **Rating engine writer** — owns new `src/markets/index-rating.ts` and its tests. Implement deterministic factor rules, min coverage, neutral bands, dates and evidence outputs using inputs from task 1; no DB, UI or job changes.
4. **Derived constituent analytics writer** — owns new `src/markets/index-analytics.ts` and its tests. Add breadth, sector aggregation, weighted valuation/earnings and stock-score distribution, with data-quality/coverage fields; does not change the rating score or pages.
5. **Index list page writer** — owns only `src/app/[locale]/(app)/indices/page.tsx`, `src/app/[locale]/(app)/indices/_components/asset-table.tsx`, and the index-list message keys. Integrates the read model and adds table signals; no detail-page or CSS shared-file edits (add new page-specific stylesheet if needed).
6. **Index detail writer** — owns only `src/app/[locale]/(app)/indices/[symbol]/page.tsx` and a new index-detail component/style/message set. Integrates analytics and factor evidence, adds chart panels and richer component table; does not modify shared `asset-pages.tsx` to avoid overlap.
7. **Independent reviewer** — after implementation, review licence gates, ticker mapping, missing-data handling, historical survivorship bias and public informational wording. This is review work, no file ownership.

## Risks and gaps

- **Redistribution licence is the release gate.** EODHD rows currently have `display_allowed=false`; registry says terms are unverified. Owner previously deferred a commercial licence decision until paying customers (TASK-064). Do not expose EODHD prices, components, weights, caps or derived outputs to customers before licensing confirms derived/public redistribution rights.
- **Weights are absent for seven of the eight requested indexes** in current storage; the VIX component query is empty. Weight values are fractions when supplied; UI must format ×100 for percent.
- **Coverage and symbol mapping:** existing schema has bare component code plus exchange, whereas stock prices and fundamentals use separate ID mappings. Naive bare-ticker joins can create collisions and country gaps; use `instrument_ids.vendor_symbols`/`symbols` and surface unmatched share.
- **Survivorship bias:** current membership snapshots date 2026-11-06. Historical breadth or rating replay needs dated constituents; S&P 500 regular history is available from vendor only from 2012 and earlier records are incomplete. Other index history is Marketplace-only per EODHD docs.
- **Valuation and aggregate ratios:** no historical valuation series collected; stock-level P/E averages are mathematically misleading and negative earners need explicit handling. Require complete/representative weight coverage and period alignment.
- **Methodology risk:** do not call the result a stock rating or investment recommendation. Use condition labels, source date, data coverage and factor evidence; validate retrospectively and avoid forecast claims.

## Repository evidence references

- `src/app/[locale]/(app)/indices/page.tsx:19-20`
- `src/app/[locale]/(app)/indices/[symbol]/page.tsx:24-48`
- `src/db/markets.ts:31-69,72-140,145-175`
- `src/jobs/eodhd-market-bars.ts:25-43`
- `src/jobs/eodhd-index-components.ts:27-54`
- `src/jobs/eodhd-market-cap.ts:29-61`
- `migrations/102_market_assets.sql:1-52`
- `migrations/120_markets_views.sql:1-65`
- `deploy/gitops/gitops/apps/invest-buddy/base/markets-cronjob.yaml:3-42,189-304`
- ADR-001/product boundary: `~/Documents/ops-brain/projects/investing-platform/PRODUCT.md:7-9`; owner scoring reference: `~/Documents/ops-brain/moje/invest/InvestingGuide.md`, sections 5–6.
