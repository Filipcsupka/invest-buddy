# EODHD market universe

The selection dry run reads active listings from `symbols` through the existing `instruments` keys. US instruments may retain a bare ticker such as `AAPL`; European instruments use the full vendor symbol, such as `SAP.XETRA`. The listing suffix is the identity for selection, so the same code on two exchanges remains two candidates. `universe_membership.exchange` (migration 099) records the listing chosen for each dated membership. Existing rows are backfilled as US listings. `universe-change add` takes `--exchange`, and an approved discovery candidate takes the exchange of its `symbols` row.

The supported exchanges are US, XETRA, LSE, PA, AS, SW, PR, WAR, MI, MC, ST, OL, CO, HE, VI, BR and LS. Selection accepts EODHD `Common Stock` or `Equity` symbols and excludes names that indicate funds, warrants, preferred shares or other non-common securities. The SEC domestic-filer check remains for US listings. European listings use their stored EODHD facts without that check.

The thresholds in `src/universe/select.ts` are provisional: at least four revenue quarters, positive year-over-year growth, 50 bars, a last price above USD 5, average 50-bar traded value above USD 10 million, and market cap above USD 300 million. `src/jobs/discovery-config.ts` retains its separate USD 300 million and USD 2 million weekly discovery floors. The last close and traded value use the bar's quote currency; shares outstanding come from dated fundamentals. The selector converts price, traded value and market cap with the latest ECB reference rates known by the score date. GBP pence (`GBX`) are converted at one hundred pence per pound. Missing quote currency, shares or FX excludes a new candidate. These provisional thresholds need owner review before a live universe change.

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

**UNVERIFIED:** EODHD exchange suffix availability outside US, XETRA, LSE and WAR, LSE quote currency (`GBP` versus `GBX`), and the availability of dated European share counts and quarterly revenue require a paid ALL-IN-ONE response. Listing discovery only covers instruments whose bars and fundamentals have already been stored; a separate collection path must seed new European instruments before they can qualify. Raw EODHD figures remain internal until display rights are verified. Public output remains informational screening under ADR-001.
