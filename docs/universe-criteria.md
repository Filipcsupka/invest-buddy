# Universe criteria (D35, draft for owner review)

Version `d35-2026-10-draft`. All thresholds are placeholders until the owner approves them. The public output stays informational screening (ADR-001).

## Sizes

36 names today, 150 in week 7 (D36), 300 only if the D38 storage figures and the Twelve Data request math hold (301 requests a night needs a split job or Grow, D37).

## Criteria

A candidate must pass all of these, in this order. The first failure is its reason code.

| Code | Rule | Placeholder |
| --- | --- | --- |
| `not_common_stock` | Common stock ticker (1 to 5 letters, optional class .A-.C); name is not a warrant, unit, right, preferred, depositary share, note, ETF or trust | |
| `foreign_filer` / `filer_unknown` | SEC domestic filer: 10-K, 10-Q or 8-K seen; 20-F, 6-K and 40-F filers are out | no new 20-F names until D18 shows coverage |
| `no_revenue_history` / `short_revenue_history` | At least 4 reported quarters of revenue (three-month facts in `fundamentals_pit`) | 4 |
| `no_growth_data` / `growth_not_positive` | Latest quarterly revenue is above the same quarter a year earlier | growth above 0% |
| `no_price_data` / `short_bar_history` | 50 trading days of our own bars | 50 |
| `price_below_min` | Last close above | 5 USD |
| `volume_below_floor` | 50-day average dollar volume (close times volume) above | 10 million USD |
| `duplicate_filer` | Second filer of a listed company, explicit list in `src/universe/select.ts` (`SUNC`, same revenue as `SUN`) | |

Ranking: names above 15% YoY growth first (same threshold as `src/jobs/discovery-config.ts`), then the rest. Inside each group by growth, then dollar volume, then ticker.

Sector cap: no named sector above 25% of the target (37 names of 150). Names that would exceed it get `sector_cap`. `Unclassified` is not a sector and is never capped. Pool names get their sector from the SEC SIC code (`src/universe/sector.ts`: Biotech, AI & semiconductors, Cloud & SaaS, Fintech, Energy & EV); other codes stay `Unclassified`. Names past the target get `below_cut`.

The 36 current names are always kept and marked `core` (every member except the collect-only list `extended`), even if they fail a rule; the review file lists which ones.

## Inputs (read only)

- `discovery_price_bars` and `daily_bars` for price and volume.
- `fundamentals_pit` (D18) for quarterly revenue.
- `filing_watch` and `fundamentals_pit.form` for the filer type.
- `universe_membership` (D11) for core names, `instrument_ids` (D10) and an optional SEC `company_tickers.json` for CIK.
- D23 `instrument_size` is not in the repo yet, so market cap is not used. When D23 lands, a floor can be added in `src/universe/select.ts`.

Limits: free data has no analyst or float filter, so the rules are revenue and liquidity only. Only currently listed names are visible (survivorship). A candidate outside the universe has revenue only after companyfacts has been fetched for it; until then it is excluded as `no_revenue_history`. Q4 revenue is not a three-month fact, so quarters are counted from reported three-month periods.

## Run

```
DATABASE_URL=... npx tsx scripts/select-universe.ts --as-of 2026-11-16 --target 150 --out tmp/universe [--sec-tickers company_tickers.json]
npx tsx scripts/select-universe.ts --as-of 2026-11-16 --input candidates.json --out tmp/universe
```

Writes `selected.csv`, `excluded.csv` (with reason codes) and `review.md` (counts, sector spread, proposed adds, file hashes). Same input gives the same hashes. The script opens no write statement; importing is D36 with `scripts/universe-change.ts add ... --list extended --criteria-version d35-2026-10-draft` after the owner approves the list.

## Candidate pool (step 1, market-wide)

`npm run universe:pool -- --out tmp/universe --held TICKER,TICKER` screens every SEC filer from the quarterly revenue frames (about 3,000 with growth data). A name enters when quarterly revenue is at least 50 million USD, YoY growth is at least 15% and the prior quarter's YoY is at least 10%. Names rank by the weaker of the two growth rates, so a one-quarter spike does not lead. Output is `pool.csv` and `pool.json`, top 300, current universe excluded. SEC only, no database write.

The pool has no price data. Step 2 fetches bars for the pool within the Twelve Data limit (800 requests a day), then `select-universe` applies price, volume, filer-type and sector rules.

### Pool bars (step 2) and refresh

`npm run pool-bars -- --limit 250` fetches 260 daily bars per pool name into `discovery_price_bars` (one request each, 7 a minute, ledger job `pool-bars`). A name is skipped when it has at least 200 bars and the newest is at most 5 days old. 2026-10-18 result: 297 of 300 covered, 3 rejected by Twelve Data (`PHXE-P`, `HGIT`, `ZARE`). The pool changes each quarter after the SEC frames and selection needs bars at most 5 days old, so the CronJob `deploy/gitops/gitops/apps/invest-buddy/base/pool-bars-cronjob.yaml` runs daily at 12:30 Bratislava with `--limit 500 --size 3200`: the whole pool (570 names for CY2026Q2), at most 500 requests a run (see `docs/data.md`, Pool bars).

`pool-bars` skips `PHXE-P`, `HGIT` and `ZARE` (Twelve Data: not found) and `SUNC` (`NOT_FOUND_SYMBOLS` in `src/universe/pool.ts`, `DUPLICATE_FILERS`).

## Collect-only list

Names added with `--list extended` are collected and priced but not scored, not shown on any page or in the sitemap, and not sent to extract or judge, until they are promoted (10 clean sessions, D16) to `core`. See `docs/d36-approval.md`. The 2026-10-18 selection rerun (150 names, 114 adds) is documented there.

### Promotion to core

`node dist/jobs/universe-promote.js` (`npm run universe:promote`, `--dry-run` writes nothing, `--cap N` overrides the cap) promotes `extended` names to `core`. A name qualifies after 10 clean sessions in a row (D16): for each of the last 10 completed sessions, all on or after the day the name joined `extended`, its bar is stored in `daily_bars` and the D16 price checks (`src/jobs/dq.ts`, run as of that session) give no `fail`. History fetched before the name joined does not count. The check runs on the bars directly, because the `dq` job has no CronJob and `dq_results` is empty.

At most 10 names are promoted a week (`PROMOTE.weeklyCap` in `src/universe/promote.ts`, Monday to Sunday, counting rows added by `universe-promote`). The cap is there for AI cost: a core name is scored and shown, and its filings go to extract and judge. Eligible names go in the selection order: growth, then 50-day dollar volume, then ticker. The change is the one `universe-change` makes for a remove and an add, in one transaction: `valid_to` on the extended row, a new `core` row from the same date with `added_by` `universe-promote` and the criteria version, and the instrument source set to `guide`. A rerun on the same day changes nothing.

CronJob `invest-buddy-universe-promote` (Sunday 15:00 Bratislava) is a suspended proposal. The 114 names added on 2026-10-18 can first qualify after the session of 2026-10-30, so the first run that could promote is Sunday 2026-11-01.
