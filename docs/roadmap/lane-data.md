# Lane DATA: collect now, so history exists by 2026-12-31

Synthesis 2026-10-09: this copy is the working version for the window. The master plan is `docs/roadmap/README.md`. Lines starting with "Synthesis note" and the section "Changes by the synthesis" at the end are the only additions to the lane draft in ops-brain. Migration numbers written below (022, 023 and so on) are placeholders: several lanes claim the same numbers, so each PR takes the next free number when it opens (PL7 rule, PL15 lint). IDs from `docs/tasks-open.md` (A1 to I1, for example E1, C2, D1b, D2) are written with the prefix "tasks-open" where they could be read as a data lane ID.

Status 2026-10-09. Planning only, nothing changed in the repo or the cluster. IDs D1 to D44. Size: S = 0.5 to 1 working day, M = 2 to 4, L = 5 to 10, for one engineer-agent. Each task is one PR. "Cluster write" means an infra PR plus Argo sync or a manual Job, which needs owner approval under the ops-brain rules.

## Goal

Owner decision of 2026-10-09: use the 12 weeks to 2026-12-31 to collect as much market and fundamentals data as free or already-owned sources allow. Data that cannot be rebuilt later is the priority: what a source said on a given day (analyst estimates, earnings dates, vendor price revisions), which names were in the universe, what inputs a score was computed from, and raw filings. Data that is public and re-fetchable later (SEC history, Treasury, FRED) can be backfilled at any time, so it comes second. Every stored row must say where it came from and whether we may show it, so the web lane can respect licences. The adapter layer must let us swap in a paid vendor without touching scoring.

## What exists today

Read from code and from a SELECT-only look at the live database on 2026-10-09 (`kubectl -n invest exec deploy/postgres`, `psql`).

Universe. Table `instruments`: 37 rows (28 `guide`, 7 `sample extension`, 1 `discovery` = PCVX, 1 `benchmark` = SPY). `scanner/universe.json` is only an offline fallback. SQ is requested as XYZ at Twelve Data (`DEFAULT_SYMBOL_MAP` in `src/data/twelvedata.ts`). There is no membership history and no start or end date for a name.

Jobs live in `invest` (16 CronJobs, `kubectl get cronjob` 2026-10-09), Europe/Bratislava, Tue to Sat unless noted:
- prices 00:30: `src/jobs/prices.ts`, Twelve Data free key, 260 daily bars per ticker for 36 tickers plus SPY (37 requests of the 800 per day, 7 per minute). Writes `daily_bars` with `ON CONFLICT DO UPDATE` (`src/db/prices.ts`), so a vendor revision silently replaces the stored bar.
- watch 00:45: `filing_watch`, 33,719 rows, filings from 1995-05-19 to 2026-10-08. Cursor only, no text.
- collect 01:00 (default sources `edgar` and `rss`): `src/collectors/edgar.ts` stores 8-K, 8-K/A, 10-Q, 10-K, 6-K, 20-F, Form 4 text and 8-K exhibits in `source_documents` (body capped at 200 KB, `migrations/007`). Look-back is 100 days (90 for Form 4). RSS now reads PR Newswire first and GlobeNewswire second; GlobeNewswire fails from the cluster (`docs/tasks-open.md` A4, D31).
- detect 01:35 (`scheduled_gates`), extract 01:50, macro 04:00 (FRED DGS10 and Cboe VIX stored as one document each, `macro_findings`), reconcile 04:10, daily 04:25, judge 05:30, portfolio 06:00 UTC (`portfolio_nav_history`, 234 rows 2025-11-17 to 2026-10-08).
- Saturday: collect-alphavantage 08:00 (live state is not suspended although `docs/data.md` says suspended; it has never run, LAST SCHEDULE is none; the key name exists in secret `invest-buddy-source-keys`), discovery 09:30 (`discovery_price_bars`, `discovery_candidates`), review calendar 11:00.
- Suspended: backup, digest, retention.
- Code that exists but no CronJob runs: sources `frames`, `getcurrent`, `13f`, `openfda`, `clinicaltrials`, `usaspending`, `fed`, `treasury`, `bls`, `gnews`, `gdelt` (`src/collectors/sources/registry.ts`). Discovery calls frames and getcurrent itself.

Volumes on 2026-10-09 (live counts):
| Table | Rows | Range or note |
|---|---|---|
| `daily_bars` | 9,766 | 37 tickers, 2025-09-22 to 2026-10-08 |
| `discovery_price_bars` | 9,332 | 37 symbols, 2025-07-02 to 2026-10-08 |
| `source_documents` | 1,087 | edgar 1,064, alphavantage 20, fred 2, cboe 1; 9.9 MB of body text; published 2026-06-29 to 2026-10-08; `expires_at` from 2026-11-05 |
| `collected_facts` | 438 | 5 keys only: `latest_earnings_8k` 28, `eps_surprise_latest` 20, `volume_ratio_20d` 143, `price_move_5d` 143, `insider_net_buy_90d` 101; 30-day expiry |
| `score_results` | 178 | 2026-10-02 to 2026-10-08 |
| `consensus_findings` | 1,356 | 2026-10-02 to 2026-10-08 |
| `record_snapshots` | 103 | immutable, since 2026-10-06 |
| `cusip_map` | 0 | 13F source never ran |
| database | 30 MB | PVC `postgres-data` 5 Gi `local-path` on one node, backup suspended |

Gaps that matter for this lane, each shown by the code above:
1. Retention is suspended now. When it is switched on, `src/jobs/retention.ts` deletes documents after 30 to 100 days and facts after 30 days. Raw filings would be lost. The first documents expire on 2026-11-05.
2. `daily_bars` and `source_documents` upsert in place. `score_results` is refreshed on the same date. `consensus_findings` has primary key (symbol, field, as_of). Only `record_snapshots` and `record_signals` are immutable. So we cannot reproduce what we knew on a past day.
3. No fundamentals history. `revenue_growth_quarterly` is computed but the live table holds no such fact; EPS surprise keeps only the newest quarter.
4. No security master, no corporate-action record, no trading calendar, no data quality checks beyond bar validation at ingest.
5. Licence is a free-form `meta.display_allowed` on documents only. Bars and facts carry no source or licence field.
6. API budgets are tracked only for Alpha Vantage (`collector_runs.api_requests`).

## Source terms (checked 2026-10-09 unless noted)

Status words: verified = read on the date shown; partly = page read but a needed point is missing; unverified = not read or page unreadable. Nothing below is legal advice.

| Source | What we can get | Terms status |
|---|---|---|
| SEC EDGAR (submissions, companyfacts, frames, filings, bulk data sets) | filings, XBRL facts, Form 4, 13D/G, 13F | verified. https://www.sec.gov/about/webmaster-frequently-asked-questions says "All Government-created content on sec.gov and EDGAR public filing content are free to access and reuse"; asks for a declared User-Agent; max 10 requests per second (https://www.sec.gov/about/developer-resources). Our code stays under 5 per second. Financial Statement Data Sets page (https://www.sec.gov/dera/data/financial-statement-data-sets) has no formal terms, only an accuracy disclaimer, quarterly zips. Insider Transactions Data Sets not found on that page (unverified). |
| FRED API | macro series | partly. https://fred.stlouisfed.org/docs/api/terms_of_use.html requires the notice "This product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis", and says series whose notes contain "Copyright" need the owner's permission. It does not address storage or redisplay of fetched values. Use only series without a copyright note, check each. |
| Treasury FiscalData API | rates, debt | verified. https://fiscaldata.treasury.gov/api-documentation/ says data is "offered free, without restriction", no token needed; rate limit not stated. |
| ECB euro reference rates | EUR/USD daily | partly. https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html allows reuse if the ECB is cited and changes are stated; the page does not name the FX feed specifically. |
| Alpha Vantage free key | EARNINGS (actual and estimated EPS), EARNINGS_CALENDAR, prices | verified for the EULA: https://www.alphavantage.co/terms_of_service/ (PDF) grants use "for personal, non-commercial use, unless you and Alpha Vantage have agreed otherwise in writing". The 25 calls per day limit comes from `docs/data.md`, not re-read today. Internal use only until written permission. |
| Twelve Data | daily bars, splits, dividends, fundamentals | verified for pricing page https://twelvedata.com/pricing: Basic free, 8 credits per minute, 800 per day, "Internal non-display usage"; Grow 79 USD monthly or 66 USD per month yearly, 55 per minute, "Internal display data access"; Pro 229 or 191; Ultra 999 or 832. The page says plans are for "personal, internal, and non-commercial purposes". Redistribution is not addressed. History depth per plan is not stated. Splits, dividends and `outputsize` maximum for the free plan are unverified. |
| Tiingo | prices, fundamentals (5 years), news | verified. https://www.tiingo.com/about/pricing: Starter free, 50 requests per hour, 1,000 per day, 500 symbols per month, 30+ years of prices, "Internal Use Only", may not display or share. Internal commercial use 50 USD per month or 499 per year. Redistribution through sales. |
| Finnhub | quotes, earnings, recommendations, estimates | partly. https://finnhub.io/terms-of-service: plans "strictly for personal use unless explicitly stated otherwise", no sharing of data or derived results, global cap 30 calls per second. Free limits and free endpoints were not readable (pricing page returned only a tagline). The 60 per minute figure in `research/data-providers.md` is unverified. |
| Massive (formerly Polygon) | EOD, corporate actions | partly. https://massive.com/pricing: Stocks Basic free, 5 calls per minute, 2 years of history, end-of-day plus corporate actions; paid plans labelled "Individual use"; Starter 29 USD, Developer 79, Advanced 199. Terms of service not read. |
| Cboe VIX history CSV | VIX daily close | verified that display needs approval: https://www.cboe.com/use-of-content says any use of Cboe content needs approval in advance and a signed licence (permissions@cboe.com). The VIX page (https://www.cboe.com/tradable_products/vix/vix_historical_data/) links a free CSV and a disclaimer, with no reuse grant. Today we store it with `display_allowed: false`. |
| Yahoo Finance and yfinance | prices, estimates | excluded. Yahoo terms bar commercial reuse without written permission (search summary 2026-10-09 of https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html; the primary page was not read). Matches `research/data-providers.md`. |
| Stooq | bulk daily prices | excluded. Page returned nothing today; `docs/tasks-accounts-needed.md` (2026-10-05) records a bot wall. |
| FINRA short interest | short interest | unverified. https://www.finra.org/finra-data/browse-catalog/equity-short-interest/data shows a rolling one year and a pipe-delimited file, says nothing on schedule, fees or reuse, and mentions "non-commercial use" for FINRA Data views. Equity ToS not read. `docs/tasks-accounts-needed.md` row 10 notes an unauthenticated CSV that is not documented. |
| OpenFIGI | CUSIP to ticker, FIGI | partly. https://www.openfigi.com/api/documentation: free, 25 mapping requests per minute without key, 25 per 6 seconds with key (the repo has a key). Terms page not read. |
| NBS (nbs.sk), BSSE (bsse.sk) | SK macro and FX; SAX index, SK listed securities | unverified. NBS page lists exchange-rate datasets and a disclaimer link; BSSE page says trade data is delayed 15 minutes and the SAX index is not, and links "Právne informácie". Neither terms page was read. https://www.bcpb.sk failed the certificate check; the exchange's host is bsse.sk. |
| Finstat, Czech sources (CNB, BCPP) | company registry data | unverified, not checked. Not needed for a US growth screen. Park until the web lane asks for SK or CZ issuers. |
| Google News RSS, GDELT, press-release RSS | headlines | Google: copyright line limits the feed to personal non-commercial use (`docs/tasks-accounts-needed.md` row 11, 2026-10-05), so avoid. GDELT terms read 2026-10-10 (D31): free for commercial use with citation; headline text rights not covered. Press-release RSS: PR Newswire works, GlobeNewswire times out from the cluster. |
| FMP, EODHD | prices, fundamentals, estimates | unverified today. `research/data-providers.md` (2026-10-04) says FMP display needs a separate licence and EODHD commercial is about 399 USD per month; free limits there are from a worker report. |

## Owner decisions needed (data lane)

1. Twelve Data. The free key is internal non-display. The company page plots closes today (`research/market-homework/130-positioning-and-business-model.md` section 8). Decide: keep it and accept the risk until the paid decision, replace the chart by a derived view, or hide it. Also decide if Twelve Data Grow (66 to 79 USD per month) is worth buying early for rate limit and history, or only after the waitlist.
2. Written permissions. Send the requests drafted in D42 (Alpha Vantage, Cboe, Twelve Data, FINRA, Finnhub, GDELT). Until a yes arrives those rows stay `display_allowed = false`.
3. Spend cap for this window. Proposed default: 0 EUR. Name any ceiling per month before D8 sets it as the hard stop.
4. Universe widening: approve criteria in D35 (placeholders), the 150 target by about 2026-11-15 and 300 by about 2026-12-10, and whether foreign 20-F filers count.
5. Retention: approve keeping raw SEC filings forever (D5, D19) and the storage and backup plan (D38), which needs E1 (backup secrets and an off-node target).
6. New accounts: Finnhub free key, Massive free key, FINRA API credential (D29, D30, D32). Each is a third-party signup.
7. Analyst estimates have no free redistributable source. Accept that the paid-data stage (D44) will fill this, and that until then we only snapshot what Alpha Vantage and Finnhub give for internal use.
8. VIX: accept a realised-volatility fallback from our own SPY bars if Cboe says no (D25).

## What the data lane needs from the owner

Keys and accounts (names only, never paste values): `ALPHA_VANTAGE_API_KEY` exists in `invest-buddy-source-keys`; `FRED_API_KEY`, `BLS_API_KEY`, `EIA_API_KEY`, `OPENFIGI_API_KEY` exist there too; `TWELVE_DATA_API_KEY` in `invest-buddy-market-secrets`. New: `FINNHUB_API_KEY`, `MASSIVE_API_KEY`, a FINRA credential. Confirm `SEC_USER_AGENT` carries a monitored contact address (listed as a placeholder in `docs/tasks-accounts-needed.md` row 7 on 2026-10-05; not rechecked today). Spend: 0 EUR proposed; optional Twelve Data Grow. Approvals: each new CronJob and each live migration is a cluster write; E1 backup secrets (external restic target).

## Task order at a glance

D1 to D8 safety and licence foundations (start now: D5 before 2026-11-05). D9 to D15 adapters, point-in-time and history tables. D16 to D17 quality and raw store. D18 to D33 collectors by source. D34 backfill. D35 to D37 universe. D38 to D44 operations, display contract, paid-data path.

---

### D1 Baseline data inventory and growth report
Status: done 2026-10-10, PR #93, merged and live.
Why: no single place lists what we hold and at what rate it grows; numbers above were hand-queried (`docs/data.md` has no volumes).
Steps: 1. Add `scripts/data-inventory.ts` that runs SELECT-only queries (row counts, min and max dates, table sizes via `pg_total_relation_size`, per source document counts and body bytes, expiry histogram). 2. Print JSON and a markdown table. 3. Add `docs/data-inventory.md` with the 2026-10-09 baseline from this file. 4. Add npm script `data:inventory`.
Acceptance: running with `DATABASE_URL` prints all tables listed above with sizes; test `scripts/data-inventory.test.ts` runs against `TEST_DATABASE_URL` seeded rows and checks counts and that no non-SELECT statement is issued (assert on the query log).
Size: S
Depends on: none
Who: agent
Approval needed: none (read-only; a cluster run is a manual exec by the owner or a read-only Job)
Risk or open question: numbers drift daily; the doc is a dated baseline, not a live view (D39 is the live view).

### D2 Data source registry with licence classes
Status: done 2026-10-10, PR #91, merged and live.
Why: licence lives as free text in `meta.license_note` and `meta.display_allowed` (`src/collectors/sources/common.ts` `LICENSES`); the display layer needs one table. Source: `docs/data.md` collectors section.
Steps: 1. Migration 022 `data_sources` (id, name, kind, licence_class in `public_gov`, `public_attrib`, `internal_only`, `licensed`, `unknown`; display_allowed boolean; redistribution_allowed boolean; terms_url; terms_checked_on date; attribution_text; rate_limit_note; daily_cap; monthly_cost_cap_eur; notes). 2. Seed rows for every source in the terms table above with the status found on 2026-10-09 (unverified stays `unknown`, display false). 3. `src/data/sources-registry.ts` with typed read and a pure `canDisplay(sourceId)`. 4. Move `LICENSES` in `common.ts` to read from the same constants so there is one list.
Acceptance: migration applies on empty and on the live schema; tests: every source name in `registry.ts` has a row, a source with `unknown` class returns `canDisplay` false, seeded SEC row returns true; `npm run typecheck` clean.
Size: M
Depends on: none
Who: agent
Approval needed: cluster write (migration runs in the web init container after merge, `deploy/README.md`)
Risk or open question: licence_class vocabulary should match what the web lane's paywall uses; confirm with that lane.

### D3 Row-level provenance on bars, facts and documents
Status: done 2026-10-10, PR #97, merged and live.
Why: a displayed number must be traceable to a source and licence. Only documents carry `meta.display_allowed`; `daily_bars` and `collected_facts` have no source column (`migrations/001`, `007`).
Steps: 1. Migration 023: add `source_id`, `fetched_at`, `vendor_symbol` to `daily_bars`; `source_id` and `licence_class` to `collected_facts`; `source_id`, `licence_class`, `display_allowed` (promoted from meta) to `source_documents`. 2. Backfill existing rows (bars: `twelvedata`, internal; documents by `source` column; facts by key map) in the same migration. 3. Update `src/db/prices.ts`, `src/db/collectors.ts` upserts to set the fields. 4. Update the collectors that build documents (`common.ts sourceDocument`) to pass `source_id`.
Acceptance: after migration no row has null `source_id` (SQL check in test); a new prices run writes `twelvedata`; tests in `src/db/collectors-pg.test.ts` and `src/jobs/prices.test.ts` cover both; `display_allowed` column equals `meta.display_allowed` for all rows before and after.
Size: M
Depends on: D2
Who: agent
Approval needed: cluster write (live migration)
Risk or open question: keep `meta.display_allowed` readable until all consumers (`src/data/sources.ts`, `src/db/bundle.ts`) move to the column.

### D4 Display guard for the data access layer
Synthesis note: the `RAW_SERIES_DISPLAY` flag is added to the typed flag module from W1 (`src/config/flags.ts`), not read from `process.env` directly, so it depends on W1. Owner decision 14 in `docs/roadmap/README.md` covers the chart.
Why: ADR-002 says store derived scores, not raw vendor series; `docs/data.md` says the raw Twelve Data series is never published but the company page chart uses closes. One enforced function prevents leaks. Source: `docs/data.md` Judge section, `docs/tasks-accounts-needed.md` row 14.
Steps: 1. Add `src/data/license.ts` exporting `filterDisplayable(rows, ctx)` using D2 and D3 fields. 2. Route the public readers in `src/data/store.ts` and `src/db/bundle.ts` through it. 3. Add an allow-list test that scans `src/app/**` for imports of raw table readers (`daily_bars`, `source_documents`) and fails if a page uses them directly. 4. Add flag `RAW_SERIES_DISPLAY=off` (default) that blocks raw price arrays from page props; the chart reads derived points only until owner decision 1.
Acceptance: tests: a bar with `internal_only` never appears in page props (render test per public page); with the flag on and licence `licensed` it appears; the allow-list test fails on a seeded violation.
Size: M
Depends on: D3, W1
Who: agent
Approval needed: none
Risk or open question: this may blank the price chart on company pages; coordinate with the web lane and decision 1.

### D5 Retention that archives instead of deleting
Status: done 2026-10-10, PR #100, merged and live.
Synthesis note: `src/jobs/retention.ts` is also changed by W11 (unconfirmed waitlist purge), PL26 (job_runs purge) and PL44 (rate limit rows). D5 lands first and the others rebase on it. EN21 step 4 (keep raw documents on the 30 day rule) is overruled for public SEC filings, which this task archives; internal-only text is still deleted after 30 days, which matches EN21's licence concern.
Why: `src/jobs/retention.ts` deletes documents after 30 to 100 days and facts after 30; the first documents expire 2026-11-05 (live `expires_at` min). A switched-on retention would destroy raw filings that cannot be recovered cheaply and break history. Source: live DB, `docs/data.md` Collectors.
Steps: 1. Migration 024: `source_documents_archive` and `collected_facts_archive` with the same columns plus `archived_at`. 2. Change `retention.ts`: for sources `edgar` and public-gov classes, move rows to the archive in one transaction instead of `DELETE`; keep deleting `internal_only` news text after 30 days. 3. Keep the CronJob suspended in infra until merged and tested. 4. Extend `--dry-run` output with archive counts. 5. Update `docs/data.md` retention paragraph.
Acceptance: test in `src/jobs/retention.test.ts` (TEST_DATABASE_URL): an expired edgar document is in the archive and gone from the live table; an expired rss document is deleted; facts archived; ids unique; dry run changes nothing. Live: `retention --dry-run` as a one-off Job lists counts and changes no row.
Size: M
Depends on: D3
Who: agent
Approval needed: cluster write (migration; unsuspending retention later is a separate infra PR)
Risk or open question: archive growth (see D38). Alternative is a longer `expires_at`; archive keeps the live table small for queries.

### D6 Point-in-time storage design (ADR)
Status: done 2026-10-10, PR #87, merged and live.
Synthesis note: EN21 step 1 (retention audit per table) is folded into this ADR's table-by-table list.
Why: later features (history, backtests, track record, paid depth) need "what did we know on day X". Today bars, documents and scores are overwritten (see gap 2). Source: `migrations/018_track_record.sql` already uses immutable triggers for two tables.
Steps: 1. Write `docs/adr-point-in-time.md`: every observation table has `observed_at` (when we fetched) and a business date (`as_of`, `period_end`, `filed`); append-only revision tables for bars, scores, consensus, estimates; documents keyed by content hash; immutable trigger pattern from `018`; query pattern `as_of_known(date)`. 2. List which tables become append-only (D12, D14, D15, D18 to D20, D27, D28). 3. Define retention per class (never delete: filings, revisions, score inputs).
Acceptance: doc merged with a table-by-table decision list, one worked SQL example per pattern, and review by the owner; no code change.
Size: S
Depends on: none
Who: agent
Approval needed: none
Risk or open question: bitemporal modelling adds query complexity; the ADR must keep reads simple (views).

### D7 Trading calendar module
Status: done 2026-10-10, PR #94, merged and live.
Why: data quality checks and "bar missing" logic need to know holidays and half days. `daily.ts` only uses a 3 calendar day freshness rule (C8).
Steps: 1. Add `src/data/trading-calendar.ts` with NYSE holidays and early closes 2025 to 2027 as static data, functions `isSession(date)`, `sessionsBetween`, `previousSession`. 2. Cite the NYSE holiday page in a comment with the check date; leave a `TODO verify` marker only if the page is unreachable. 3. Replace ad hoc weekday logic in `src/jobs/macro.ts` and the extract default date where they compute "last completed weekday session".
Acceptance: unit tests for Thanksgiving, Christmas 2026, Good Friday 2027, a half day, and a weekend; existing macro and extract date tests still pass.
Size: S
Depends on: none
Who: agent
Approval needed: none
Risk or open question: holiday list must be re-verified each December; D16 adds a check that fails when the calendar ends within 60 days.

### D8 API usage ledger and cost caps
Status: done 2026-10-10, PR #95, merged and live.
Synthesis note: PL42 (data call ledger and guard) is merged into this task. There is one ledger (`api_usage`) and one guard (`src/data/usage.ts`), with limits read from `data_sources` (D2), not a second `api_calls` table or `config/providers.json`. Added from PL42: a share of the Twelve Data daily cap is reserved for `prices`, and a job over its share logs `quota_skip` and ends `partial` instead of failing. PL29 lists the ledger in the ops report.
Why: only Alpha Vantage requests are counted (`collector_runs.api_requests`, migration 012). With more sources, a runaway job could exhaust a daily quota or, after a paid plan, spend money. Source: `docs/data.md` Alpha Vantage section.
Steps: 1. Migration 025 `api_usage` (source_id, day, requests, credits, est_cost_eur, job, run_id). 2. `src/data/usage.ts` with `reserve(source, n)` that reads daily and monthly caps from `data_sources` (D2) and throws `CapReached` before the call. 3. Wire Twelve Data (`src/data/twelvedata.ts`) and Alpha Vantage first; later collectors use it. 4. Default `monthly_cost_cap_eur = 0` for every row; a paid source cannot be called while the cap is 0.
Acceptance: tests: reserve beyond cap throws and writes nothing; two concurrent reserves respect the cap (advisory lock); prices job logs usage; Twelve Data run of 37 symbols records 37 requests; a second job cannot take the share reserved for `prices`, and `prices` still fetches every symbol when discovery runs at the limit (from PL42).
Size: M
Depends on: D2
Who: agent
Approval needed: cluster write (migration)
Risk or open question: credits per request differ by endpoint at Twelve Data; record `credits` separately and mark unknown multipliers as unverified.

### D9 Provider adapter interface, version 2
Why: ADR-002 and `ARCHITECTURE.md` call for provider interfaces; `src/data/providers.ts` has `MarketDataProvider.bars(ticker)` only, with no capabilities, licence, cost or date range. The paid upgrade (D44) needs a clean swap.
Steps: 1. Define in `src/data/adapters/types.ts`: `BarsAdapter` (`bars(symbol, from, to)`), `FundamentalsAdapter`, `EstimatesAdapter`, `CorporateActionsAdapter`, `CalendarAdapter`, each with `meta` (sourceId, licenceClass, rateLimit, costPerCall, supportsAdjusted). 2. Wrap `TwelveDataProvider` as `adapters/twelvedata.ts`, keep old class working. 3. Add `adapters/registry.ts` choosing adapters by config, with a fallback order. 4. Add a shared contract test suite `src/data/adapters/contract.test.ts` that any adapter must pass using recorded fixtures (valid bar, bad OHLC, symbol rejected, rate limit).
Acceptance: prices job runs through the new interface with identical stored rows in a fixture run (snapshot test on `daily_bars`); contract suite passes for the Twelve Data adapter and a fake second adapter; docs section "Adding a provider" lists the steps.
Size: M
Depends on: D2, D8
Who: agent
Approval needed: none
Risk or open question: do not over-design; only the five interfaces above.

### D10 Security master
Status: done 2026-10-10, PR #96, merged and live.
Why: tickers change (SQ to XYZ), and sources key on CIK, CUSIP or FIGI. The map lives in code (`DEFAULT_SYMBOL_MAP`) and a CUSIP cache with 0 rows. Source: `src/data/twelvedata.ts`, `migrations/008`.
Steps: 1. Migration 026 `instrument_ids` (ticker, cik, figi, composite_figi, exchange, currency, sic, sic_description, fiscal_year_end, vendor_symbols jsonb, status, valid_from, valid_to). 2. Seed from SEC `company_tickers.json` and submissions (no new source) for the 36 names; SPY by hand. 3. Replace `DEFAULT_SYMBOL_MAP` reads with a lookup that falls back to the constant. 4. Script `scripts/master-refresh.ts` to refresh weekly and log changes.
Acceptance: all 37 instruments have a CIK (SPY none, flagged `etf`); SQ resolves to vendor symbol XYZ for Twelve Data and for SEC; test with a ticker change fixture; refresh is idempotent.
Size: M
Depends on: D2
Who: agent
Approval needed: cluster write (migration; CronJob later in D40)
Risk or open question: foreign filers (ASML, SE) may lack some ids; keep nullable.

### D11 Universe membership history
Synthesis note: EN44 adds EFXT and WULF through `scripts/universe-change.ts` once this task is merged, so the membership history records them.
Why: a score on 2026-10-08 means little in a year without knowing who was in the universe and why. `instruments` has no dates (`migrations/001`, `017`).
Steps: 1. Migration 027 `universe_membership` (ticker, list in `core`, `extended`, `discovery`, `benchmark`; valid_from; valid_to null; reason; criteria_version; added_by). 2. Seed 36 names as of 2026-10-09, SPY as benchmark. 3. `loadUniverse` in `src/db/universe.ts` takes an optional `asOf` and returns members valid on that date. 4. Admin script `scripts/universe-change.ts add|remove` that writes membership rows and the instrument row together.
Acceptance: tests: asOf before an addition excludes the name; removal keeps bars and scores; the default call equals today's list (36 plus benchmark rules unchanged); `daily` output on the fixture universe unchanged.
Size: M
Depends on: D10
Who: agent
Approval needed: cluster write (migration)
Risk or open question: tier (1 to 3) is a guide concept; store it in membership, not only in `instruments`.

### D12 Price revision log
Status: done 2026-10-10, PR #102, merged and live.
Synthesis note: together with D14 and D15 this replaces the `pit_fields` table proposed in EN21.
Why: `daily_bars` upserts overwrite. A split or a vendor correction changes old rows with no trace, and the job refetches 260 days each night. Source: `src/db/prices.ts` line `ON CONFLICT ... DO UPDATE`.
Steps: 1. Migration 028 `daily_bar_revisions` (ticker, bar_date, observed_at, open, high, low, close, volume, source_id), append-only with the immutable trigger pattern from `018`. 2. In the prices upsert, when a stored bar differs from the new one, insert the old values into revisions inside the same transaction. 3. Also store the first observation of every new bar (so the close at first sight is kept). 4. Log the count of revised bars per run in `price_ingest_runs` (new column `bars_revised`).
Acceptance: test: run twice with identical data, zero revisions; change one close and a split-like scale of the whole history, revisions equal the changed rows; trigger blocks UPDATE and DELETE; job log shows `barsRevised`.
Size: M
Depends on: D3, D6
Who: agent
Approval needed: cluster write (migration)
Risk or open question: volume is small (about 37 rows a day plus rare revisions); the open question is whether Twelve Data's free time series is split-adjusted only or also dividend-adjusted. Unverified; D13 records the answer from a fetch.

### D13 Corporate actions record and split detection
Why: price history is only comparable if splits are known. Today nothing records them. Source: gap 4.
Steps: 1. Migration 029 `corporate_actions` (ticker, action_date, kind `split`, `reverse_split`, `dividend`, `spinoff`, `symbol_change`, ratio, amount, source_id, detected_by `vendor` or `heuristic`). 2. `src/jobs/dq-corporate-actions.ts`: detect a split when D12 shows an old-bar scale factor close to a rational ratio for the whole history, or a daily close move beyond 40% with volume spike. 3. Optional vendor source: ask the adapter interface for `CorporateActionsAdapter`; implement for Twelve Data only after a free-plan check of the splits endpoint (record the answer in `data_sources.notes`). 4. Use SEC 8-K Item 5.03 and 3.03 text from stored documents as a hint only.
Acceptance: tests with a 4:1 fixture detect ratio 4 and write one row; a normal 12% day does not; re-run is idempotent; the endpoint answer is recorded.
Size: M
Depends on: D12
Who: agent
Approval needed: none (uses existing key and quota; if the endpoint costs more credits per call, D8 caps apply)
Risk or open question: whether the Basic plan includes splits and dividends is unverified.

### D14 Append-only score and input snapshots
Status: done 2026-10-10, PR #104, merged and live.
Synthesis note: covers EN21's per-day copy of score inputs; EN21 is not built separately.
Why: `score_results` is refreshed on the same date (`docs/data.md`, "Same-day scores are refreshed"), and `record_snapshots` keeps only score, state and rule hits. We need the inputs and the rule version to reproduce any past score, and to compare rule versions over the 12 weeks. Source: `src/jobs/daily.ts`, `migrations/005`, `018`.
Steps: 1. Migration 030 `score_input_snapshots` (ticker, as_of, observed_at, rules_version, inputs_fingerprint, inputs jsonb containing the audit inputs and consensus rows used, bars_hash of the last 260 closes, bar_last_date), append-only, one row per distinct fingerprint. 2. In `daily.ts` insert a row whenever the fingerprint changes. 3. Add `scripts/replay-score.ts` that rebuilds a score from a snapshot row and compares it with `score_results`.
Acceptance: test: two runs with the same inputs write one snapshot, a changed input writes a second; replay of a stored snapshot reproduces the stored total and rule hits for NVDA fixture; trigger blocks updates.
Size: M
Depends on: D6
Who: agent
Approval needed: cluster write (migration)
Risk or open question: `inputs` jsonb size per row; estimate with D1 numbers (about 178 audits in 7 days of `audit` already, 2.5 MB table), fine at 300 names.

### D15 Consensus finding history
Status: done 2026-10-10, PR #92, merged and live.
Synthesis note: covers EN21's per-day copy of consensus rows; EN21 is not built separately.
Why: `consensus_findings` has primary key (symbol, field, as_of); a rerun the same day replaces the row, losing the earlier decision and the agent values. Source: `migrations/004`.
Steps: 1. Migration 031 `consensus_findings_history` with the same columns plus `superseded_at`. 2. Trigger on the live table: before UPDATE or DELETE insert the old row. 3. No change to reads.
Acceptance: test: reconcile twice with a different agent value, history has one row with the old value; row count of the live table unchanged; trigger overhead test under 50 ms for 300 symbols by 12 fields (log timing only).
Size: S
Depends on: D6
Who: agent
Approval needed: cluster write (migration)
Risk or open question: none known.

### D16 Data quality check framework and price checks
Status: done 2026-10-10, PR #103, merged and live.
Why: only ingest-time validation exists (`parseTimeSeries`). Gaps, stale tickers and outliers are not tracked over time. Source: `src/data/twelvedata.ts`, `docs/data.md` Price ingest.
Steps: 1. Migration 032 `dq_results` (check_id, subject, as_of, status `pass`, `warn`, `fail`, detail jsonb, run_at). 2. `src/jobs/dq.ts` with checks: missing sessions per ticker using D7, bar older than 3 days (matches C8), daily move over 40%, volume zero on a session, high below low, duplicate dates, rows per ticker below 200 (the db-mode minimum), calendar ends within 60 days. 3. Register jobs output in `runLoggedJob`. 4. Add `build:jobs` entry in `package.json`.
Acceptance: unit tests with seeded gaps and outliers produce the exact expected `warn` and `fail` rows; a clean fixture produces only `pass`; the job exits 1 if any `fail`; build step includes `dq.js`.
Size: M
Depends on: D7
Who: agent
Approval needed: cluster write (migration; CronJob in D40)
Risk or open question: thresholds are placeholders for the owner.

### D17 Raw snapshot store
Status: done 2026-10-10, PR #99, merged and live.
Why: restated XBRL, estimates and calendars change; we need the raw response at the time. `source_documents.body` caps at 200 KB and expires. Source: `migrations/007`.
Steps: 1. Migration 033 `raw_snapshots` (id, source_id, key, fetched_at, content_hash, content_type, size_bytes, body bytea gzip, meta jsonb) unique on (source_id, key, content_hash), no expiry. 2. `src/data/raw-store.ts` with `putSnapshot` (gzip, dedupe by hash, reject over 20 MB) and `getSnapshot`. 3. Accept that bodies go in Postgres TOAST for now; keep the API narrow so a later move to files or object storage changes one module.
Acceptance: tests: same body twice stores one row; 1 MB JSON round-trips byte for byte; oversize rejected; hash stable; `data:inventory` (D1) reports size.
Size: M
Depends on: D3
Who: agent
Approval needed: cluster write (migration)
Risk or open question: companyfacts JSON per large filer can reach several MB uncompressed (size not measured; D18 measures it). Storage plan in D38.

### D18 SEC companyfacts into a point-in-time fundamentals table
Synthesis note: EN25 reads `fundamentals_as_of(date)` from this table for the replay instead of its own companyfacts cache.
Why: fundamentals history is the main value of 12 weeks of collection, and SEC data carries a `filed` date, so history can be rebuilt as of any day. Today only revenue growth is computed (`src/data/sec.ts`), cached one day, nothing stored. Terms: verified free to reuse (table above).
Steps: 1. Migration 034 `fundamentals_pit` (ticker, concept, taxonomy, unit, period_start, period_end, fy, fp, form, filed, accession, value, frame, first_seen_at) unique on (ticker, concept, period_end, accession). 2. `src/collectors/sources/companyfacts.ts` fetches `data.sec.gov/api/xbrl/companyfacts/CIK##########.json` per universe CIK (D10), stores the raw JSON via D17, inserts only new rows. 3. Concepts allow-list in `src/data/fundamentals-concepts.ts` (Revenues and the revenue concepts in `frames.ts`, GrossProfit, OperatingIncomeLoss, NetIncomeLoss, EarningsPerShareDiluted, NetCashProvidedByOperatingActivities, PaymentsToAcquirePropertyPlantAndEquipment, ResearchAndDevelopmentExpense, dei EntityCommonStockSharesOutstanding). 4. Weekly run plus a run on a watch-detected 10-Q or 10-K. 5. Respect SEC rate (under 5 per second as in `docs/data.md`).
Acceptance: fixture test for NVDA companyfacts stores N rows and a second identical run stores 0; a restated value (new accession) adds a row and keeps the old; a SQL view `fundamentals_as_of(date)` returns only facts with `filed <= date`; live dry run for 36 symbols reports total bytes (recorded in `docs/data-inventory.md`).
Size: L
Depends on: D10, D17
Who: agent
Approval needed: cluster write (migration; CronJob via D40)
Risk or open question: concept coverage differs per company and per taxonomy year; the allow-list may need growth. Foreign filers (20-F) have no companyfacts for some concepts.

### D19 Filing text archive without expiry, with 3-year backfill
Synthesis note: EN42 starts storing 424B5 filings in `collectEdgar`; this archive keeps every form that `collectEdgar` stores, so 424B5 is archived without a separate step.
Why: 8-K, 10-Q, 10-K and exhibits are the evidence for every claim (`docs/data.md` Extraction). Bodies are cut at 200 KB and the look-back is 100 days (`src/jobs/collect.ts` `daysAgo(now, 100)`), so the base for later research starts at 2026-06-29. Public EDGAR content is free to reuse (verified).
Steps: 1. New table `filings` (accession pk, cik, ticker, form, items, filed_at, primary_doc_url, size_bytes, content_hash, body_gz bytea, fetched_at). 2. Extend `collectEdgar` to also write there, full primary document up to 5 MB gzip, no expiry. 3. Backfill job reading the submissions `files` pages back to 2023-10-01 for 8-K, 10-Q, 10-K and exhibits (Form 4 goes to D20). 4. Keep `source_documents` as the short-lived extraction input.
Acceptance: test: a 600 KB 10-K is stored whole and its hash matches; rerun adds nothing; backfill with a fixture of 3 pages resumes after a simulated crash (cursor from D34); `SELECT count(*)` per ticker matches the filing count in submissions for a fixture.
Size: L
Depends on: D5, D17, D34
Who: agent
Approval needed: cluster write (migration, one-off backfill Jobs)
Risk or open question: size. Rough scale from live data: 1,087 documents are 9.9 MB for 100 days at 36 names; 3 years of non-Form-4 filings for 300 names will be larger; D38 models it with measured figures.

### D20 Form 4 structured transactions and backfill
Why: insider rule is open ("routine-trader exclusion needs insider identity and more than 91 days of history", `docs/data.md`). Form 4 is 735 of 763 documents in the first collect (`docs/tasks-open.md` A4). `parseForm4` already extracts trades into `meta.trades`.
Steps: 1. Migration 035 `insider_transactions` (accession, line_no, ticker, owner_cik, owner_name, relationship flags, transaction_date, code, shares, price, acquired_disposed, derivative boolean, shares_after, filed_at) unique on (accession, line_no). 2. Write from `collectEdgar` and from a backfill to 2023-10-01 (D34). 3. View `insider_net_buy(ticker, as_of, window)` used later by the gate. 4. Flag whether a 10b5-1 indicator is present in the XML; if the field is not in our parser, mark `unknown`, do not guess.
Acceptance: fixture tests for a purchase, a sale, an option exercise code M, a derivative row; parity test: net 90 day buy dollars from the table equals the existing `insider_net_buy_90d` fact for NVDA fixture; backfill idempotent.
Size: M
Depends on: D17, D34
Who: agent
Approval needed: cluster write (migration)
Risk or open question: the 10b5-1 checkbox exists only in newer forms; mark older rows unknown.

### D21 Holder events: 13D, 13G and current 8-K feed
Why: ownership signals accumulate and cannot be recovered cheaply from the live feed later. The `getcurrent` source exists but is not scheduled (`registry.ts`). Free SEC data (verified).
Steps: 1. Migration 036 `holder_events` (accession, ticker, filer_name, filer_cik, form, filed_at, percent, shares) unique on accession. 2. Make `getcurrent.ts` write rows; parse percent where the filing exposes structured data, else leave null (do not infer). 3. Daily run on weekdays after watch.
Acceptance: fixture test with a 13D, a 13G/A and an unrelated filer; only universe issuers stored; second run adds none; fact `holder_5pct_events` unchanged.
Size: M
Depends on: D10, D17
Who: agent
Approval needed: cluster write (migration, CronJob via D40)
Risk or open question: structured 13D/G format status on EDGAR was not checked today; parser may need text extraction.

### D22 13F quarterly holdings job
Why: institutional accumulation is a rule input (`InvestingGuide.md` 4.1 E, 6.1) and `13f` source exists but never ran (`cusip_map` has 0 rows). The Q3 13F deadline is mid-November (`docs/tasks-open.md` F7), which falls inside the window.
Steps: 1. Migration 037 `institutional_holdings` (period, filer_cik, filer_name, ticker, shares, value_usd) unique on (period, filer_cik, ticker). 2. Rework `thirteenf.ts` to store per-filer rows for universe CUSIPs, not just aggregates. 3. Resolve CUSIPs with OpenFIGI (key exists, limit 25 per 6 seconds) and fill `cusip_map`. 4. Schedule one run on 2026-11-20 and one after 2027-02-15 rather than daily.
Acceptance: fixture zip with 3 filers and 2 universe names stores 6 rows or fewer as expected; `cusip_map` filled for universe CUSIPs; the temp zip is deleted; second run adds none.
Size: M
Depends on: D10, D17
Who: agent
Approval needed: cluster write (migration, CronJob)
Risk or open question: size of the 13F data set zip (not measured); 13F lists positions, not trades.

### D23 Company profile and shares outstanding snapshots
Why: market cap, float and sector grouping are needed for universe criteria (D35) and later display, and we have none. Free from SEC submissions and companyfacts.
Steps: 1. Use D10 `instrument_ids` fields (sic, fiscal year end, state of incorporation) from submissions weekly. 2. From D18 take the latest dei shares outstanding and compute `market_cap_est` = shares times last close in a view `instrument_size`. 3. Store with `observed_at`.
Acceptance: view returns a market cap estimate for NVDA fixture; test: a missing shares value returns null, not zero; documented as an estimate.
Size: S
Depends on: D10, D18
Who: agent
Approval needed: none
Risk or open question: dual-class shares make the estimate wrong; mark `estimate_quality`.

### D24 Macro observations: FRED and Treasury yields
Synthesis note: EN40 needs CPI, PPI and FOMC inputs. The `bls` and `fed` collectors exist in code but no CronJob runs them (live `source_documents` on 2026-10-09 hold only edgar, alphavantage, fred and cboe rows), so EN40 either uses series stored here or waits for a D40 slot for those collectors.
Why: macro rules use only DGS10 (40 observations stored as one document, `src/collectors/fred.ts`). History of rates, curve and credit spreads is easy to collect and cannot be dated later except through vintages. Terms: Treasury verified free; FRED partly (notice required, check copyright notes per series).
Steps: 1. Migration 038 `macro_observations` (series_id, obs_date, value, realtime_start, source_id, observed_at) unique on (series_id, obs_date, realtime_start). 2. Series list in `src/data/macro-series.ts`: DGS2, DGS10, DGS3MO, T10Y2Y, FEDFUNDS, and others only after reading each series' notes for the word "Copyright" (script `scripts/fred-check-notes.ts`). 3. Treasury daily par yield curve from FiscalData as a cross-check series. 4. Daily run inside the macro job.
Acceptance: fixture test stores 5 series; a series with a copyright note is rejected by the script and not stored; FRED API key is read from env only; notice text is available from D41 for display.
Size: M
Depends on: D2
Who: agent
Approval needed: none (existing FRED key); cluster write for the migration
Risk or open question: exact Treasury endpoint for the par yield curve was not checked today.

### D25 VIX permission and realised-volatility fallback
Why: the macro rule needs VIX; Cboe says any use needs prior approval and a signed licence (verified). We store the close daily with display false (`src/collectors/sources/vix.ts`). Source: `docs/data.md` Macro rules.
Steps: 1. Compute 20-day realised volatility of SPY from `daily_bars` into `macro_observations` as series `RV20_SPY` (derived from our own data, no Cboe content). 2. Keep VIX collection internal and mark `licence_class = unknown`; stop writing the Cboe page text as a document body if D42's answer is no. 3. Add a macro rule switch `MACRO_VOL_SOURCE=vix|rv20` (default unchanged).
Acceptance: unit test of the RV20 formula against a hand-computed fixture; macro rule test passes with either source; with `rv20` the job never calls the Cboe URL (network stub asserts).
Size: S
Depends on: D24
Who: agent
Approval needed: none; owner sends the Cboe request (D42)
Risk or open question: rule thresholds (VIX below 25) do not transfer to RV20; owner review under tasks-open D1b and EN40.

### D26 ECB euro FX reference rates
Why: the owner view and any EUR price display need EUR/USD by day; ECB allows reuse with citation (partly verified). Small and free.
Steps: 1. Add source `ecb` in `data_sources` with attribution text. 2. Collector `src/collectors/sources/ecb-fx.ts` for the daily reference rate for USD, CZK, GBP into `macro_observations` (series `ECB_EURUSD` etc.). 3. Backfill the available history through the same endpoint.
Acceptance: fixture XML parses to three series; second run adds none; weekend gaps are not filled; test verifies the attribution field is set.
Size: S
Depends on: D24
Who: agent
Approval needed: none
Risk or open question: exact ECB endpoint and its cadence not verified today (use the ECB data portal page when implementing and record the URL in the PR).

### D27 Earnings calendar daily snapshot
Why: expected earnings dates move, and the history of "what date did we expect on day X" is lost if not stored. Alpha Vantage `EARNINGS_CALENDAR` returns the forward calendar in one request (per `docs/tasks-accounts-needed.md` row 1, 2026-10-05), cheap against the 25 per day limit. EULA allows personal non-commercial use only (verified), so internal.
Steps: 1. Migration 039 `earnings_calendar_snapshots` (observed_at, ticker, report_date, fiscal_date_ending, estimate, currency, source_id) unique on (observed_at date, ticker). 2. Collector `alphavantage-calendar.ts` using D8 reserve (one call a day for the 12 month horizon). 3. Store raw CSV via D17. 4. Mark `licence_class internal_only`.
Acceptance: fixture CSV with 36 universe and 200 other rows stores universe rows only (plus all rows in raw store); rerun same day adds none; a changed date the next day adds a row; usage ledger shows 1 request.
Size: S
Depends on: D8, D17
Who: agent
Approval needed: cluster write (migration, CronJob); owner confirms the key still works
Risk or open question: whether the `estimate` column is populated for the whole universe is unverified.

### D28 Earnings history and estimate snapshots (Alpha Vantage)
Synthesis note: EN41 step 3 (eps surprise history) is this table; EN41 keeps only the decision and the display rule. Read on 2026-10-09 by the synthesis: `invest-buddy-collect-alphavantage` has `suspend: false` and no last schedule time, and `ALPHA_VANTAGE_API_KEY` is a key in `invest-buddy-source-keys`.
Why: `eps_surprise_latest` keeps only the newest quarter and expires in 100 days; the free `EARNINGS` endpoint returns all quarters with estimated and reported EPS. History of surprises and of the estimate at each date is exactly the data that has no free source later (`docs/tasks-accounts-needed.md` "Still unsolved"). Internal use only.
Steps: 1. Migration 040 `eps_history` (ticker, fiscal_date_ending, reported_date, reported_eps, estimated_eps, surprise_pct, observed_at, source_id) unique on (ticker, fiscal_date_ending, observed_at). 2. Extend `alphavantage.ts` to store every quarter returned and the raw response (D17), keep the existing fact. 3. Respect the 20 per run cap; with 36 names the weekly run covers all names in two Saturdays; with 150 to 300 names rotate by oldest `observed_at` and note that coverage falls (see D36). 4. Unsuspend decision: the live CronJob is not suspended; confirm it ran on 2026-10-10 08:00.
Acceptance: fixture with 8 quarters stores 8 rows; a later response with a revised estimate adds a row, old row stays; cap logic test unchanged; docs updated.
Size: M
Depends on: D8, D17
Who: agent
Approval needed: cluster write (migration); no new secret
Risk or open question: 25 calls a day cannot cover 300 names weekly; a second source (D29) or Twelve Data Grow is the only way to widen.

### D29 Finnhub second source for earnings and recommendations
Synthesis note: the engine lane read the same Finnhub terms page on 2026-10-09 as "no business use even internal without written approval". Until Finnhub answers the D42 request in writing, this task stays unscheduled; D33 check (b) then reports `skip`.
Why: independent EPS surprise data allows reconciliation with Alpha Vantage (D33), and recommendation trend snapshots are unrecoverable history. Terms: personal use only, no sharing (verified), so internal; free endpoint list not verified.
Steps: 1. Owner creates a free key (D42). 2. Read the live API docs and record in `data_sources` which of earnings, recommendation trends and price target are free (do not assume). 3. Adapter `adapters/finnhub.ts` through D9 with D8 caps (global cap 30 per second from the terms, our own cap far lower). 4. Daily snapshot of recommendation trends for the universe into `analyst_snapshots` (ticker, observed_at, strong_buy, buy, hold, sell, strong_sell, period) if free.
Acceptance: contract test suite passes with fixtures; with no key the job prints skip and exits 0 (same pattern as FRED); `licence_class internal_only`; usage ledger rows exist.
Size: M
Depends on: D9, D8, D42 (written approval from Finnhub)
Who: agent
Approval needed: third-party signup and new secret (`FINNHUB_API_KEY`, sealed secret flow)
Risk or open question: free access to analyst data may be absent; then drop the snapshot part and keep earnings only.

### D30 FINRA short interest
Why: a free positioning signal with history we can accumulate; `docs/tasks-accounts-needed.md` row 10 lists it as wanted but unwired.
Steps: 1. Owner reads the FINRA terms and gets an API credential (D42). 2. Record the terms status in `data_sources` with URL and date. 3. If allowed for storage, collector `finra-short-interest.ts` through D9, settlement-date keyed rows in `short_interest` (ticker, settlement_date, shares_short, avg_daily_volume, days_to_cover, published_at, observed_at). 4. Schedule twice a month only after the real publication schedule is read from FINRA docs.
Acceptance: fixture test parses the pipe-delimited file; duplicates by settlement date are skipped; `licence_class` set from the terms result; collector refuses to run if `data_sources.terms_checked_on` is null.
Size: M
Depends on: D2, D8
Who: agent
Approval needed: third-party signup, new secret, legal read of FINRA terms
Risk or open question: the NYSE and Nasdaq listed equity file may need the licensed route; unverified.

### D31 News headline source decision and hardening
Why: news is a sentiment and catalyst input, but display rights are the problem. Google News feed is limited to personal non-commercial use (copyright line quoted in `docs/tasks-accounts-needed.md` row 11); GDELT terms unread; GlobeNewswire fails egress.
Steps: 1. Read the GDELT terms and record URL and date in `data_sources`. 2. Decide per source `keep internal`, `drop`. Default: drop Google News from any scheduled run. 3. Add a daily GDELT headline snapshot (title, url, time, outlet, tickers) with the 429 and slow-response handling already in `gdelt.ts`; store metadata only. 4. Add company press releases via SEC 8-K Item 7.01 and 8.01 exhibits, already collected.
Acceptance: `data_sources` rows updated with dates; a test asserts no scheduled job lists `gnews`; GDELT run with the 11 to 19 second latency stub completes within the Job deadline and stores headline rows without body text.
Size: S
Depends on: D2
Who: agent
Approval needed: none; owner decides keep or drop
Risk or open question: headline metadata display rights are not settled for any source here.
Status 2026-10-10: done except the daily GDELT schedule. Decision and probe results are in `docs/data.md` ("News headline sources"). Migration 042 records the GDELT terms and renames the `rss` row.

### D32 Second price source for cross-check
Why: one free vendor means errors go unseen. Massive free allows 5 calls per minute, 2 years of EOD history and corporate actions (partly verified); Tiingo free is internal use only, 500 symbols a month (verified). A cross-check never displays, so internal terms fit if the terms permit internal use.
Steps: 1. Owner creates a Massive free key (D42) and reads its terms. 2. Adapter via D9 for end-of-day bars. 3. Daily job fetches a rotating sample of 5 names plus SPY (6 calls, one minute) into `price_crosscheck` (ticker, bar_date, close_a, close_b, diff_pct, source_b). 4. Alternative if Massive terms fail: Tiingo.
Acceptance: contract tests pass; fixture with a 3% difference writes a `warn` dq row via D16; job never writes to `daily_bars`; request count recorded.
Size: M
Depends on: D9, D16
Who: agent
Approval needed: third-party signup, new secret
Risk or open question: Massive terms of service were not read; mark internal use unverified until the owner reads them.

### D33 Reconciliation report across sources
Why: the pipeline already reconciles AI extraction (`consensus_findings`); numeric data has no equivalent. Cross-source checks tell us which source to trust and when to pay.
Steps: 1. `src/jobs/dq-reconcile.ts`: compare (a) SEC companyfacts revenue with the stored `revenue_growth_quarterly` computation, (b) Alpha Vantage EPS with Finnhub EPS where both exist, (c) Twelve Data closes with D32, (d) FRED DGS10 with Treasury par yield. 2. Write `dq_results` with tolerance per check (placeholder). 3. Weekly markdown summary to the job log, no email.
Acceptance: seeded disagreement beyond tolerance produces `fail`; matching data produces `pass`; each check handles a missing second source as `skip`, not `fail`; tests per check.
Size: M
Depends on: D16, D18, D24, D28, D29, D32
Who: agent
Approval needed: none
Risk or open question: tolerances are guesses; owner or the owner's rules should set them.

### D34 Resumable backfill framework
Status: done 2026-10-10, PR #101, merged and live.
Synthesis note: the runner lands here with a fake job in its tests. Each source task registers its own plug-in when it lands: D19 `filings`, D20 `form4`, D18 `companyfacts`, EN22 `prices` (EN22 is the long price backfill and runs through this runner).
Why: several tasks need long, rate-limited history pulls (filings 3 years, Form 4 3 years, companyfacts, price history). A crash or a daily cap must not restart from zero.
Steps: 1. Migration 041 `backfill_state` (job, subject, cursor jsonb, status, updated_at). 2. `src/jobs/backfill.ts` with a generic runner (`--job`, `--only`, `--max-requests`, `--dry-run`) that reads the cursor, uses D8 reserve, and stops cleanly at a cap. 3. Plug in jobs: `filings`, `form4`, `companyfacts`, `prices`. 4. Add to `build:jobs` and the scanner-free web image.
Acceptance: test: runner stopped after 3 requests resumes at the 4th; dry run writes nothing; cap stop writes status `paused` with a reason; a second runner while one is active exits (advisory lock).
Size: M
Depends on: D8
Who: agent
Approval needed: cluster write (migration; backfill Jobs one at a time)
Risk or open question: SEC limit is 10 per second; our client keeps under 5; keep it.

### D35 Universe criteria and selection script (36 to 150 to 300)
Why: owner wants wider coverage to accumulate more history. Today the universe is the Guide list plus 7 sample names plus PCVX, and discovery stores at most 5 candidates a week from about 373 symbols (`docs/tasks-open.md` F7).
Steps: 1. Write `docs/universe-criteria.md`, thresholds are placeholders for owner review: US-listed common stock (no warrants, units, rights, preferreds, already filtered in discovery); SEC domestic filer with at least 4 quarters of reported revenue; price above 5 USD; 50-day average dollar volume above a floor (starting value 10 million USD, derived from our own bars); positive latest quarterly YoY revenue growth, with names above 15% ranked first (same 15% as `discovery-config.ts`); sector spread cap so no sector exceeds 25% of the list. 2. `scripts/select-universe.ts` builds a ranked list from `discovery_price_bars`, frames output, D23 size estimates and `filing_watch`; writes a CSV and a review file, no database write. 3. Keep the 36 current names in the list regardless of criteria and mark them `core`.
Acceptance: script on a fixture produces exactly the expected 150-name list; excluded names carry a reason code; output is deterministic (run twice, same file hash); owner can review the CSV before any import.
Size: M
Depends on: D11, D23
Who: agent
Approval needed: none for the script; owner approves the criteria and the list before D36
Risk or open question: free data gives no analyst-based or float filter; criteria are revenue and liquidity only. Survivorship: only currently listed names are visible, so history for delisted names is not covered.

### D36 Roll out 150 names
Synthesis note: the dependency chain D2, D3, D17, D18, D23, D35 and D38 makes "150 by about 2026-11-15" (owner decision 4 above) reachable only at the lower size bound; the master schedule puts this rollout in week 7 (2026-11-23 to 2026-11-27). W20 adds every new instrument to the sitemap, so public company pages grow with this step. Discovery (EN36) and the cross-check (D32) share the same Twelve Data cap through D8.
Why: first step of widening. Cost check: Twelve Data free limits 800 requests per day and 8 per minute; the nightly price job for 150 names plus SPY needs 151 requests (about 22 minutes at 7 per minute, `docs/data.md`), within the limit but the job deadline is 25 minutes (`deploy/README.md`), so it needs a longer deadline or a split.
Steps: 1. After owner approval, use `scripts/universe-change.ts` (D11) to add the approved names as `extended`. 2. Run backfill (D34) for bars, filings, Form 4 and companyfacts for the new names over several days, within caps. 3. Adjust `prices` CronJob deadline and the chain order in `cronjob-order.test.ts` (prices must end before collect at 01:00). 4. Decide whether the new names are scored daily or only collected: start collect-only, add scoring after D16 shows clean data for 10 sessions. 5. Update Alpha Vantage rotation (D28).
Acceptance: `instruments` count 151 plus SPY; D16 shows no `fail` for 10 consecutive sessions for added names; chain-order test passes; prices job ends before 01:00 in a manual run; usage ledger below 800 a day.
Size: M
Depends on: D16, D34, D35, D38
Who: agent (infra PR by agent, apply by owner)
Approval needed: cluster write (DB writes for new instruments, CronJob deadline change); owner approves the name list
Risk or open question: extract and judge cost; collect-only avoids AI spend for the new names.

### D37 Roll out 300 names
Why: second step; same logic at twice the load.
Steps: 1. Same procedure as D36 for the next 150 names. 2. Price job needs about 301 requests per night, 43 minutes at 7 per minute: split into two CronJobs (A to M, N to Z) or move to Twelve Data Grow if the owner buys it (55 per minute, verified). 3. Check storage after D38 numbers.
Acceptance: 301 instruments; both price Jobs finish before 01:00; D16 clean for 10 sessions; storage within the D38 limit; `docs/data-inventory.md` updated.
Size: M
Depends on: D36, D38
Who: agent
Approval needed: cluster write; spend only if Grow is chosen
Risk or open question: daily cap 800 leaves room for discovery (24 screens a week) and cross-checks; recheck the sum.

### D38 Storage model, retention classes and backup
Synthesis note: the backup itself is PL22 (target and secrets), PL23 (script) and PL24 (restore test), which together are tasks-open E1. This task supplies the growth figures and retention classes and links their result.
Why: PVC is 5 Gi on one node and backup is suspended; the live database is 30 MB (2026-10-09). Raw archives will grow with 300 names. Source: `deploy/README.md`, `docs/tasks-open.md` E1.
Steps: 1. From D1 and D19 and D20 measurements, write `docs/data-storage.md`: growth per table per 100 days at 36, 150 and 300 names (measured, not guessed; use dry runs). 2. Retention classes: never delete (filings, revisions, snapshots, fundamentals), 1 year (dq results, usage), 30 days (internal news text). 3. Set PVC resize plan and a size alert at 70%. 4. Prepare the E1 task inputs: restic target, secret names; restore test into a scratch database.
Acceptance: doc has three measured growth figures and a PVC decision; the PL22 off-node dump and the PL24 restore write-up (same DoD as tasks-open E1) are linked from the doc; alert rule drafted.
Size: M
Depends on: D19, D20; PL22 and PL24 for the backup part
Who: agent for the doc; owner for secrets and the backup target
Approval needed: new secret, cluster write (unsuspend backup, PVC change), spend if the target is paid
Risk or open question: `local-path` volume cannot always be resized in place (not verified on this cluster).

### D39 Coverage and freshness view
Synthesis note: PL18 keeps the public `/api/health` minimal and PL29 adds the owner-token `/api/ingest/ops-report`. The `data` block from step 2 goes into that ops report, not into `/api/health`.
Why: `/api/health` returns only latest scan, reconcile and score dates (`docs/data.md`). With many sources we need to see which stopped. E2 (alerts) is open.
Steps: 1. `src/db/coverage.ts`: per source last success, rows added in 24 hours and 7 days, last dq status, usage against cap, instruments with a bar on the last session. 2. Add a `data` block to the owner-token ops report from PL29 (public health stays minimal). 3. Add a flag field `stale` per source with source-specific thresholds in config. 4. Provide JSON for the E2 alert.
Acceptance: route test: stale source flagged after threshold; public health response unchanged; authorised response contains all sources; test with empty database returns nulls.
Size: M
Depends on: D1, D2, D16, PL29
Who: agent
Approval needed: none
Risk or open question: threshold per source is a guess until a few weeks of runs exist.

### D40 CronJob slots and infra manifests for the new jobs
Synthesis note: this slot table is the single schedule for every new CronJob in the window, including W37 alerts, EN28 outcomes, PL27 watchdog and the `bls` and `fed` collectors if EN40 needs them. `src/jobs/cronjob-order.test.ts` is a hot file: one PR at a time.
Why: a job in code is not a job in the cluster (`docs/STATUS.md` lessons: `watch` had no CronJob). New collectors need slots that keep the chain order and the Twelve Data limits. Source: `deploy/README.md`, `src/jobs/cronjob-order.test.ts`.
Steps: 1. Propose a slot table: dq 00:20 after prices ends (adjust once D36 changes prices), companyfacts weekly Sunday 02:00, holder events 01:20, calendar 01:25, macro series inside macro, ECB 16:30 UTC after publication (time to verify), backfill manual only, 13F on fixed dates. 2. Write manifests in infra `gitops/apps/invest-buddy/` (mirror in `deploy/gitops/`), all created suspended. 3. Extend `cronjob-order.test.ts` for the new jobs and deadlines. 4. Enable one at a time after a manual Job passes.
Acceptance: order test passes for every Tue to Sat chain; `kubectl -n invest get cronjob` matches the table after merge; each job has `concurrencyPolicy: Forbid` and a deadline; no two jobs hit the same API host above its limit at once (assert in test by host tag).
Size: M
Depends on: D16, D18, D21, D24, D27
Who: agent (PR), owner (Argo apply)
Approval needed: cluster write
Risk or open question: infra repo is the source of truth; mirror may drift (`deploy/README.md`).

### D41 Attribution and licence feed for the display layer
Why: FRED requires a notice, ECB requires citation, SEC asks nothing but we should name it; the web lane needs one function to render them. Source: terms table, `docs/data.md` FRED notice.
Steps: 1. `getAttributions(sourceIds)` in `src/data/sources-registry.ts` returning text and URL from `data_sources`. 2. `getLicenceSummary(rows)` returning the strictest class present, so a composite value (for example derived score input) knows its limit. 3. Document the contract in `docs/data-display-contract.md` for the web lane: derived numbers only unless `display_allowed`.
Acceptance: tests: FRED notice returned verbatim; composite of public and internal inputs reports internal; unknown source reports not displayable.
Size: S
Depends on: D2, D3
Who: agent
Approval needed: none
Risk or open question: whether a score derived from internal-only inputs may be shown is a legal question (not settled; ask in the lawyer session).

### D42 Terms-check pack for the owner
Status: done 2026-10-10, PR #98, merged and live.
Why: written permissions are the gate for any later display. Source: `docs/tasks-accounts-needed.md` rows 1, 8, 10, 11, 12, 14.
Steps: 1. Draft one short plain email or form text each for Alpha Vantage (display of EPS surprise and estimates; commercial use), Cboe (permissions@cboe.com, VIX close derived flags), Twelve Data (display of daily closes on a public company page; the Grow plan wording "internal display data access"), FINRA (short interest redistribution), Finnhub (display), GDELT. 2. Each states product, user count (none yet), what would be shown, and asks a yes or no with conditions. 3. Add a tracking table to `docs/data-inventory.md` with sent and answered dates.
Acceptance: drafts in `docs/terms-requests.md`; owner marks sent; answers update `data_sources` rows in a PR (terms_url, checked_on, class).
Size: S
Depends on: D2
Who: agent drafts, owner sends
Approval needed: third-party contact, legal if replies are conditional
Risk or open question: replies may take weeks; nothing in the window may rely on them.

### D43 History read model for the web lane
Synthesis note: W33 builds `scoreHistory` first, in this module (`src/data/history.ts`), for the company page. This task adds `fundamentalsHistory` and `universeAsOf` and routes all three through D4.
Why: the free and paid tiers will differ by history depth (`research/market-homework/99-lessons.md` sections on free tier, `130` section 8: "Score history per ticker: Paid, keep the last N days free"). The web lane should not query raw tables.
Steps: 1. SQL views and `src/data/history.ts`: `scoreHistory(ticker, from, to, tierLimitDays)`, `fundamentalsHistory(ticker, concept)`, `universeAsOf(date)`, each applying D4 licence filtering. 2. `tierLimitDays` is a parameter, not a gate; the gate belongs to the web lane. 3. Document the read contract and pagination.
Acceptance: tests: depth limit trims rows; internal-only fields never returned; query plans use existing indexes on 300 names by 90 days (explain in test log); response shape documented.
Size: M
Depends on: D4, D11, D14, D18, W33
Who: agent
Approval needed: none
Risk or open question: score history older than 2026-10-02 does not exist (`score_results` min date), so a long history cannot be promised yet.

### D44 Paid-data evaluation harness and decision pack
Why: owner wants to consider paid data once the waitlist is meaningful (decision 2026-10-09). The adapter interface (D9) makes a trial cheap if we have a harness and facts. Source: `research/data-providers.md`, terms table.
Steps: 1. Script `scripts/provider-compare.ts` that runs two adapters for the same 20 symbols and 60 sessions and reports bar mismatches, missing fields, split handling, latency, requests used. 2. Fill a decision table in `docs/paid-data-decision.md` for Twelve Data Grow or Pro, Massive Starter to Advanced, Tiingo commercial, EODHD, FMP: monthly price from the vendor page on the day, display and redistribution terms with URL and date, history depth, estimate data, rate limit. Mark each cell verified or unverified; FMP and EODHD start unverified (2026-10-04 notes only). 3. List what the paid stage would add: analyst estimates and revisions, wider history, redistribution rights, higher rate limit.
Acceptance: harness test with two fake adapters produces the expected diff report; decision doc has no empty cell (each is a value or the word unverified); owner picks a trial or defers.
Size: M
Depends on: D9, D32, D42
Who: agent, owner decides
Approval needed: spend and third-party signup only when the owner chooses a trial
Risk or open question: terms for display on a paid product often need a sales conversation (`research/data-providers.md`); price lists change.

## Changes by the synthesis

- Header: added the synthesis line (working copy, migration numbers are placeholders, tasks-open IDs get the prefix "tasks-open").
- Owner decision 7 and D9: the paid-data stage is D44, not D43 (D43 is the history read model).
- D25: "owner review under D1b" now says tasks-open D1b and EN40, so it is not read as this lane's D1.
- D4: the `RAW_SERIES_DISPLAY` flag goes into the W1 flag module; added dependency W1.
- D5: noted the shared file `src/jobs/retention.ts` (W11, PL26, PL44 land after D5) and that EN21 step 4 is overruled for public SEC filings.
- D6, D12, D14, D15: these tasks now cover EN21 (`pit_fields` is not built).
- D8: PL42 merged here; added PL42's reserved `prices` share and `quota_skip` partial status to the acceptance.
- D11: EN44 uses `scripts/universe-change.ts` once merged.
- D18: EN25 reads `fundamentals_as_of(date)` from here.
- D19: notes that 424B5 text from EN42 is archived here.
- D24: notes that EN40's CPI, PPI and FOMC inputs are not collected today (no CronJob runs `bls` or `fed`).
- D28: EN41 step 3 is this task; recorded the live state read on 2026-10-09 (Alpha Vantage CronJob not suspended, key present, no run yet).
- D29: the engine lane read Finnhub's terms as no business use without written approval; added dependency D42 (written approval) and left the task unscheduled.
- D34: plug-ins land with their source tasks (D18, D19, D20, EN22).
- D36: noted that its dependency chain makes "150 by about 2026-11-15" a lower-bound date; the master plan has week 7. Cross-references to W20, EN36, D32.
- D38: the backup is PL22 to PL24 (tasks-open E1); acceptance now links their result; dependency line names them.
- D39: the `data` block goes into the PL29 ops report instead of `/api/health` (PL18 keeps public health minimal); added dependency PL29.
- D40: the slot table is the single schedule for every new CronJob in the window.
- D43: W33 builds `scoreHistory` first in the same module; added dependency W33.
