# EODHD market universe

The selection dry run reads active listings from `symbols` through the existing `instruments` keys. US instruments may retain a bare ticker such as `AAPL`; European instruments use the full vendor symbol, such as `SAP.XETRA`. The listing suffix is the identity for selection, so the same code on two exchanges remains two candidates. `universe_membership.exchange` (migration 099) records the listing chosen for each dated membership. Existing rows are backfilled as US listings. `universe-change add` takes `--exchange`, and an approved discovery candidate takes the exchange of its `symbols` row.

The supported exchanges are US, XETRA, LSE, PA, AS, SW, PR, WAR, MI, MC, ST, OL, CO, HE, VI, BR and LS. `UNIVERSE_EXCHANGES` in `src/universe/market.ts` is the source; the CHECK in migration 099 repeats it, and `market.test.ts` fails if the two differ. Selection accepts EODHD `Common Stock` or `Equity` symbols and excludes names that indicate funds, warrants, preferred shares or other non-common securities. US codes keep the D35 pattern (one to five letters and an optional A-C class), so `BAC-PL`, `XYZ.WS` and `XYZ.U` stay excluded. European codes may contain digits and longer classes and rely on the name filter and the EODHD type. The SEC domestic-filer check remains for US listings. European listings use their stored EODHD facts without that check.

US selection is unchanged for the inputs the D35 loader produced: `src/universe/fixtures/us-golden-expected.json` records the origin/main result for the earlier test fixtures, and `select.test.ts` compares against it. The loader still reads names and bars from `discovery_price_bars`, with `daily_bars` winning on a shared date.

The thresholds in `src/universe/select.ts` are provisional: at least four revenue quarters (or three half-years), positive year-over-year growth, 50 bars, a last price above USD 5, average 50-bar traded value above USD 10 million, and market cap above USD 300 million. The market-cap floor applies to every non-US listing and to a US listing only when a dated share count gives it a cap; a US name without one is selected as under D35. Half-year revenue (170 to 195 day periods) is read only for non-US EODHD listings, because most LSE and many EU issuers report semi-annually. The EODHD parser stores a six-month period only when a neighbouring gap is six months too, so a single missing quarter stays a three-month period. Rows stored before this change were saved as three-month periods; a half-year reporter needs a fundamentals refetch before its half-year series exists. `src/jobs/discovery-config.ts` retains its separate USD 300 million and USD 2 million weekly discovery floors. The last close and traded value use the bar's quote currency; shares outstanding come from dated fundamentals. The selector converts price, traded value and market cap with the latest ECB reference rates known by the score date. A rate older than five days, or a cross rate built from two different ECB dates, excludes the candidate as `fx_stale`. GBP pence (`GBX`) are converted at one hundred pence per pound. An LSE line quoted in GBP or GBX is used only when the bars carry a GBX marker (or, without bars, the symbols row says GBX; `GBp` counts as pence). A plain GBP quote on LSE is excluded as `currency_unverified_gbx`, because a pence price read as pounds overstates price, traded value and market cap a hundredfold. Missing quote currency, shares or FX excludes a new candidate; an unknown currency never converts 1:1.

`symbols` holds the latest sync, not history. For a score date before an instrument's first symbols sync, a listing whose current symbols row or key suffix names a European exchange is excluded as `listing_not_synced`. It is never read as a US dollar line. Other instruments are read as US listings, as before.

The traded-value floor is measured on EODHD volume. For European listings that is primary-venue volume only, without MTF or consolidated volume, while US volume is consolidated. The same USD floor therefore biases selection against EU names. `minAvgDollarVolumeUsdByExchange` in the selection criteria can set a per-exchange floor; it is empty, so every market uses USD 10 million until the owner sets one. These provisional thresholds need owner review before a live universe change.

The read model uses EODHD rows already stored in `daily_bars` and `fundamentals_pit`, including `source_id=eodhd` and the exact vendor symbol. It also uses `symbols` and the existing ECB `macro_observations`; the collector needs `ECB_FX_ENABLED=on` to store the European rates. Fundamentals and FX rows must have their report or observation date and their first stored date on or before the score date, so no earlier replay receives later vendor backfills or FX collections. Bars must have a market date on or before the score date; their fetch time is not checked, because a refetch resets it and bars stored before migration 023 have none. European listings use only EODHD bars for the exact vendor symbol and quote currency. US listings also keep existing USD bars, and SEC facts remain available for legacy US instruments without an EODHD mapping. The weekly discovery job can rank the stored EODHD pool without a vendor request. Pass `--eodhd-stored-only` to use that pool without SEC and Twelve Data credentials; the older lanes remain available pending their separate migration.

The read-only local proof needs no API key or database:

```sh
npm run typecheck
npm run lint
npm test
npm run migration:lint
npx tsx scripts/select-universe.ts --dry-run --as-of 2026-10-21 --target 36 --input src/universe/fixtures/market-candidates.json --out tmp/eodhd-universe
```

Selection and the stored discovery lane make **zero EODHD API calls**. Costs arise upstream: `symbols:sync` requests one exchange list and one symbol list per available exchange; `prices:eodhd` uses per-symbol EOD and split requests or 100-call exchange bulk requests; `fundamentals:eodhd` uses one calendar request plus 10 calls per fetched symbol. The collector caps and estimates are in [the EODHD integration notes](eodhd.md). No live promote is part of this change.

On 2026-11-06, `/exchanges-list` included every configured suffix except MI. The LSE symbol list and `General.CurrencyCode` both reported GBX for VOD, HSBA and SHEL; their EOD closes were in pence. SAP and HSBC fundamentals supplied dated European share counts and quarterly revenue, but some `filing_date` fields equaled the period end and HSBC's statement currency differed from its GBX quote. The parser now uses matching earnings report dates, honors later filing dates and rejects revenue without a statement currency. ULVR.LSE showed half-year income periods but no statement currency in the sampled rows, so those rows cannot be used. EXSA.XETRA returned 470 EOD bars from 2025-01-02 through 2026-11-05. The current account has no demonstrated public display license, so raw EODHD figures remain internal. Public output remains informational screening under ADR-001.

## Seed European candidates

`npm run universe:seed-eodhd` reads active, common stock listings from `symbols`, excluding the US, unsupported currencies and LSE lines marked GBP rather than GBX. It requests one bulk last-day EOD file per exchange, then ranks each exchange by local traded value after a local price floor of 5. For GBX lines, the floor is 500 pence. It fetches full EOD history, splits and fundamentals for at most 75 names per exchange. It stores them as `discovery` instruments with EODHD provenance in `daily_bars` and dated facts in `fundamentals_pit`; `eodhd_universe_seed` marks completed candidates. The selector can read these names without making vendor calls. A failed symbol does not stop the other symbols, and a rerun skips candidates seeded in the last 30 days. A partial save is safe to retry because bars and facts are upserted. An HTTP 401, 402 or 403 stops the run.

The default first-run ceiling is 16 exchanges × 100 bulk calls plus 16 × 75 × 12 symbol calls, or 16,000 estimated calls. `--max-calls` defaults to 19,000 and cannot exceed 20,000; `--top-per-exchange`, `--min-price` and `--exchanges XETRA,LSE` narrow a run. The client disables retries so the cap covers attempted calls. `--dry-run` still requests bulk files, at 100 calls per exchange, but writes nothing and skips history and fundamentals. Normal runs record counts in `job_runs`. The suspended CronJob is `invest-buddy-eodhd-universe-seed` in this repository's `deploy/gitops/gitops/apps/invest-buddy/base/` proposal. The operator must carry that manifest and the macro env change into the live `~/moje/infra` GitOps repository, deploy the new image and run migration 131. Then the operator can start one bounded run with:

```sh
KUBECONFIG=~/.kube/khtz kubectl -n invest create job --from=cronjob/invest-buddy-eodhd-universe-seed "eu-universe-seed-$(date -u +%Y%m%d%H%M%S)"
```

The macro CronJob proposal sets `ECB_FX_ENABLED=on`. It fetches the ECB 90-day reference-rate file on each run. Before selecting, verify `macro_observations` contains recent `source_id='ecb'` rows for the score date:

```sql
SELECT series_id, max(obs_date) AS latest_date
FROM macro_observations WHERE source_id='ecb'
GROUP BY series_id ORDER BY series_id;
```

The next macro run collects the rates after rollout; an immediate run needs a separate operator action. The operator owns the live rollout and can stop future seeds by leaving the new CronJob suspended. Reverting its manifest removes the seed schedule; removing `ECB_FX_ENABLED` returns the macro collector to its prior setting. Stored candidate data remains private and needs no public route change.
