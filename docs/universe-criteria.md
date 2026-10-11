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

Ranking: names above 15% YoY growth first (same threshold as `src/jobs/discovery-config.ts`), then the rest. Inside each group by growth, then dollar volume, then ticker.

Sector cap: no sector above 25% of the target (37 names of 150). Names that would exceed it get `sector_cap`. Names past the target get `below_cut`.

The 36 current names are always kept and marked `core`, even if they fail a rule; the review file lists which ones.

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
