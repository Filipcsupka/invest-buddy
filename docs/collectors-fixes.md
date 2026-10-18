# Collector fixes after the phase A review

Changes to `src/collectors/{edgar,http,types}.ts`, `src/jobs/{collect,detect}.ts`, `src/db/collectors.ts` and `collector-cronjobs.yaml`. Regression tests are in `src/jobs/collect-fixes.test.ts` and `src/jobs/detect.test.ts`.

## Behaviour changes

- **detect** only counts a collected fact as a change for `latest_earnings_8k`, a 5-day price move of 5% or more, or a volume ratio of 2 or more. `insider_net_buy_90d` no longer triggers a rescan, a new Form 4 already arrives as a new document. A stock that stays 5% or more up over 5 days is flagged again on each new trading day. `latest_earnings_8k` is now keyed by the filing date instead of the run date.
- **Form 4** is fetched from the raw XML path (the `xslF345X0N/` prefix is dropped). A trade with an empty or footnoted price gets `dollars: null` and the fact carries `dollarsComplete: false`. `netDollars` sums priced trades only.
- **Form 4 retention** is 91 days (other documents 30). `expires_at` is now set in the upsert, `migrations/007` is unchanged.
- **Lockout**: a stopped run (429, or 403 from sec.gov) always exits 1. The collect CronJob has `backoffLimit: 0`, the next scheduled run is the retry.
- **Allow-list**: only `www.sec.gov`, `data.sec.gov`, `www.globenewswire.com` and `api.stlouisfed.org`, https on port 443, no credentials, checked before every hop including redirects. Filing URLs must stay inside the filing folder. CIK must be a positive integer, accession must match `NNNNNNNNNN-NN-NNNNNN`.
- **Response size**: `getText` reads at most 8 MB per response and truncates beyond that.
- **plainText**: numeric and hex entities outside the Unicode range become a space, `&amp;` is decoded last, `<` followed by a non-letter stays text, NUL is removed, and script/style/tag stripping is linear.
- **Schedule** (Europe/Bratislava): prices 05:00 Tue-Sat (30 min deadline), collect 05:35 Tue-Sat (30 min deadline), detect 06:10 Tue-Sat, reconcile 06:15 Mon-Fri. Retention stays at 03:00 daily. Collect also mounts a `/tmp` emptyDir (1 Gi).

## Open points

- `invest-buddy-scan-claude` and `invest-buddy-scan-codex` run at 05:30 Mon-Fri, before collect and detect. If the scan is meant to follow detect it needs a later slot.
- The phase A2 client (`src/collectors/sources/client.ts`) has its own request loop. It shares only `secSlot` and `RateLimitLockout`, so it does not get the allow-list or the SEC 403 rule from `http.ts`. It already limits redirects to the original host plus `redirectHosts`.
- `SEC_USER_AGENT` in `invest-buddy-reconcile-config` (`cronjobs.yaml`) still holds `REPLACE_WITH_CONTACT_EMAIL`. SEC blocks placeholder agents. Replace it before unsuspending collect.
- No database was available, so the detect SQL and the Postgres upsert were checked with a fake pool and pure functions only.

## SEC companyfacts collector check, 2026-10-18

The 2026-10-17 one-off Job completed for 36 symbols and inserted 4,217 facts. Live rows and SEC companyfacts show quarterly revenue for both GOOGL and META. GOOGL changed from `RevenueFromContractWithCustomerExcludingAssessedTax` to `Revenues`; the horizon report split these into separate series. Both names also lacked a stored share count. SEC has `CommonStockSharesOutstanding` for GOOGL, while its undimensioned companyfacts response has no share-count fact for META.

The collector now stores `CommonStockSharesOutstanding` and `InterestExpenseDebt`. The report combines the allowed revenue tags by quarter and reads the SEC common-share fact when the DEI share count is absent. Existing facts were retained; the two local collection passes only inserted new rows.

| Symbol | Targeted pass inserted | Full pass inserted | Latest annual interest cover inputs after collection |
| --- | ---: | ---: | --- |
| AAPL | 217 | 0 | Operating income 133.05B USD; interest expense unavailable for the same fiscal year. The last `InterestExpense` annual fact ends 2023-09-30. |
| AFRM | 78 | 0 | Operating income 416.977M USD; `InterestExpenseDebt` 454.016M USD, both FY2026. |
| CRSP | 84 | 0 | Operating loss 664.571M USD; no matching annual interest fact. `InterestExpenseDebt` has interim facts only. |
| GOOGL | 88 | 0 | Operating income 129.039B USD; interest expense 736M USD. |
| META | 21 | 0 | Operating income 83.276B USD; interest expense 1.165B USD. |

The full 36-symbol pass inserted 2,597 further facts. Its per-symbol insert counts were:

| Symbol | Rows | Symbol | Rows | Symbol | Rows |
| --- | ---: | --- | ---: | --- | ---: |
| AAPL | 0 | AFRM | 0 | AMD | 124 |
| AMZN | 138 | ASML | 41 | AVGO | 72 |
| CRM | 178 | CRSP | 0 | CRWD | 8 |
| DDOG | 20 | ENPH | 116 | GOOGL | 0 |
| MDB | 30 | MELI | 171 | META | 0 |
| MSFT | 182 | NET | 15 | NOW | 66 |
| NVDA | 83 | OKTA | 0 | ORCL | 157 |
| PANW | 240 | PCVX | 50 | PLTR | 48 |
| PYPL | 87 | REGN | 20 | ROKU | 20 |
| SE | 26 | SHOP | 7 | SMCI | 52 |
| SNOW | 4 | SQ | 6 | TSLA | 218 |
| UBER | 138 | VRTX | 153 | ZS | 127 |

After the full pass, the 2026-10-17 horizon report has 9 no-data names, down from 13. GOOGL, AFRM, PLTR and ROKU moved out of no data. META still lacks a share count in SEC companyfacts. AAPL and CRSP still lack a matching annual interest expense for the latest operating-income fiscal year. The new collector behavior reaches the public interest flag only after deployment; no deployment happened in this task.
