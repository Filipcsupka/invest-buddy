# D36 approval sheet

Data as of 2026-10-18, criteria version `d35-2026-10-draft`. Files: `tmp/universe/selected.csv`, `excluded.csv`, `review.md`, `pool.csv`, `pool.json` (local, not committed). Public wording stays informational screening (ADR-001). Answer yes or no per line; each has a recommended answer.

## What was run

- Pool bars: 297 of 300 pool names have bars (newest 2026-10-16). 3 symbols are rejected by Twelve Data as not found: `PHXE-P`, `HGIT`, `ZARE`. 49 requests were used today (46 fetched, 3 not found). Another 250 were used on 2026-10-17.
- Pool (SEC frames CY2026Q2): 3,181 filers with growth, top 300 by the weaker of the last two quarters' YoY growth, revenue 50M USD or more, current universe excluded.
- Selection (`select-universe --pool`, size 150): 83 selected, 36 core and 47 adds. 335 excluded.
- Of the 300 pool names: 47 selected, 206 `sector_cap`, 26 `volume_below_floor`, 17 `price_below_min`, 4 `not_common_stock`. The other 82 excluded rows are existing discovery names with `filer_unknown`; they are not in the pool.

## Problem to know first: `sector_cap` is not a real cap here

Pool names have no sector, so they all land in `Unclassified`. That group hit the cap of 37 names (25% of 150). So 206 pool names were dropped for a sector that does not exist, and lower-growth names with a sector (LLY 48%, ESTA 32%) got in ahead of higher-growth names. Without the cap the cut at 114 adds is YoY growth 52%; the 47 below would become 114 and LLY and ESTA would drop out (computed from `pool.json` and `excluded.csv`). The sector spread below is therefore not meaningful for the 37 `Unclassified` names. Fix needed before the full 150: a sector source (for example SEC SIC code) or no cap on `Unclassified`.

Other things in the list:
- `SUN` and `SUNC` report the same revenue (14,259M USD); `SUNC` is a duplicate filer.
- `URGN` and `LPG` have 20-F and 6-K filings in their history next to 10-K and 10-Q.
- Growth rates above 1,000% (`PGEN`, `LQDA`, `ONDS`) come from very small prior-year revenue.
- `EVC`, `FUBO`, `ABTC` pass the liquidity floor with about 12 to 13M USD a day.

## Criteria thresholds (`src/universe/select.ts`, `src/universe/pool.ts`)

Pool: revenue at least 50M USD, YoY growth at least 15%, prior quarter YoY at least 10%, top 300.

Selection, first failure is the reason code:

| Code | Threshold |
| --- | --- |
| `not_common_stock` | ticker 1 to 5 letters (optional `.A`-`.C`); name is not a warrant, unit, right, preferred, depositary share, note, ETF or trust |
| `foreign_filer` / `filer_unknown` | needs 10-K, 10-Q or 8-K seen; 20-F, 6-K and 40-F filers out |
| `no_revenue_history` / `short_revenue_history` | at least 4 reported quarters |
| `no_growth_data` / `growth_not_positive` | latest quarter above the same quarter a year earlier |
| `no_price_data` / `short_bar_history` | at least 50 trading days of own bars |
| `price_below_min` | last close above 5 USD |
| `volume_below_floor` | 50-day average dollar volume above 10M USD |
| `sector_cap` | no sector above 25% of the size (37 of 150) |
| `below_cut` | past the size |

Ranking: growth above 15% first, then the rest; inside a group by growth, then dollar volume, then ticker. Size 150.

## Proposed list

Core, kept (36): AAPL, AFRM, AMD, AMZN, ASML, AVGO, CRM, CRSP, CRWD, DDOG, ENPH, GOOGL, MDB, MELI, META, MSFT, NET, NOW, NVDA, OKTA, ORCL, PANW, PCVX, PLTR, PYPL, REGN, ROKU, SE, SHOP, SMCI, SNOW, SQ, TSLA, UBER, VRTX, ZS. Five fail a rule and stay as core: ASML and SE (`foreign_filer`), ENPH and VRTX (`growth_not_positive`), PCVX (`no_revenue_history`).

Adds (47), all passed every rule, no reason code:

| # | Ticker | Name | Sector | YoY % | Avg $ vol (M) | Close |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PGEN | Precigen, Inc. | Unclassified | 6323 | 36 | 6.39 |
| 2 | LQDA | Liquidia Corporation | Unclassified | 1843 | 152 | 34.35 |
| 3 | ONDS | Ondas Inc. | Growth | 1235 | 508 | 6.04 |
| 4 | FLY | Firefly Aerospace Inc. | Growth | 657 | 70 | 16.75 |
| 5 | KYMR | Kymera Therapeutics, Inc. | Growth | 466 | 89 | 104.78 |
| 6 | MU | Micron Technology, Inc. | Unclassified | 346 | 26549 | 878.84 |
| 7 | LUNR | Intuitive Machines, Inc. | Growth | 310 | 134 | 10.78 |
| 8 | INSM | Insmed Inc | Unclassified | 296 | 281 | 96.27 |
| 9 | RHLD | Resolute Holdings Management,  | Unclassified | 296 | 18 | 113.67 |
| 10 | FUBO | FuboTV Inc. | Unclassified | 290 | 13 | 8.00 |
| 11 | IONQ | Ionq, Inc. | Unclassified | 287 | 914 | 31.28 |
| 12 | SM | Sm Energy Co | Growth | 215 | 130 | 39.50 |
| 13 | UNIT | Uniti Group Inc. | Unclassified | 203 | 22 | 5.60 |
| 14 | URGN | UroGen Pharma Ltd. | Unclassified | 199 | 39 | 34.56 |
| 15 | BE | Bloom Energy Corporation | Unclassified | 166 | 3659 | 221.31 |
| 16 | SUN | Sunoco Lp | Unclassified | 165 | 40 | 73.26 |
| 17 | SUNC | Sunococorp Llc | Unclassified | 165 | 39 | 72.35 |
| 18 | NLST | Netlist Inc | Unclassified | 163 | 16 | 5.74 |
| 19 | XE | X-Energy, Inc. | Unclassified | 154 | 103 | 10.36 |
| 20 | INSW | International Seaways, Inc. | Discovery | 139 | 75 | 109.99 |
| 21 | WBI | WaterBridge Infrastructure LLC | Unclassified | 128 | 19 | 28.49 |
| 22 | VNOM | Viper Energy, Inc. | Unclassified | 128 | 79 | 45.02 |
| 23 | SITM | SiTime Corporation | Unclassified | 127 | 273 | 472.14 |
| 24 | EVC | Entravision Communications Cor | Unclassified | 126 | 12 | 6.32 |
| 25 | CDE | Coeur Mining, Inc. | Unclassified | 126 | 682 | 15.47 |
| 26 | LPG | Dorian Lpg Ltd. | Unclassified | 123 | 30 | 53.60 |
| 27 | KLIC | Kulicke And Soffa Industries,  | Unclassified | 123 | 63 | 78.63 |
| 28 | SNDA | Sonida Senior Living, Inc. | Growth | 122 | 18 | 35.29 |
| 29 | ABTC | American Bitcoin Corp. | Unclassified | 121 | 13 | 7.56 |
| 30 | HNI | HNI Corporation | Unclassified | 121 | 25 | 46.86 |
| 31 | BBIO | BridgeBio Pharma, Inc. | Unclassified | 120 | 183 | 66.39 |
| 32 | RGLD | Royal Gold, Inc | Unclassified | 115 | 163 | 238.05 |
| 33 | CDNL | Cardinal Infrastructure Group  | Unclassified | 114 | 28 | 14.62 |
| 34 | WAT | Waters Corporation | Unclassified | 113 | 318 | 436.95 |
| 35 | LIFE | Ethos Technologies Inc. | Unclassified | 113 | 54 | 37.52 |
| 36 | FIGR | Figure Technology Solutions, I | Unclassified | 113 | 158 | 27.13 |
| 37 | CRWV | CoreWeave, Inc. | Unclassified | 112 | 2854 | 61.39 |
| 38 | STAA | STAAR Surgical Co | Unclassified | 111 | 21 | 21.27 |
| 39 | LGN | Legence Corp. | Unclassified | 111 | 58 | 43.53 |
| 40 | COMP | Compass, Inc. | Unclassified | 109 | 137 | 9.13 |
| 41 | CORZ | Core Scientific, Inc./tx | Unclassified | 109 | 211 | 13.48 |
| 42 | DNOW | Dnow Inc. | Unclassified | 108 | 38 | 15.68 |
| 43 | ALAB | Astera Labs, Inc. | Unclassified | 104 | 1241 | 285.82 |
| 44 | TER | Teradyne, Inc. | Unclassified | 104 | 963 | 325.00 |
| 45 | CRGY | Crescent Energy Co | Discovery | 55 | 105 | 13.77 |
| 46 | LLY | Eli Lilly and Company | Biotech | 48 | 2820 | 1257.03 |
| 47 | ESTA | Establishment Labs Holdings In | Discovery | 32 | 27 | 59.18 |

Sector spread of the 83: Unclassified 37 (all adds, see above), Biotech 5, Sample extension 7, AI & semiconductors 6, Cloud & SaaS 6, Growth 6, Additional growth 4, Cybersecurity 4, Discovery 3, Fintech 3, Energy & EV 2.

## Request budget (Twelve Data: 800 a day, 7 a minute in code, 100 a day reserved for prices)

| Job | Requests | Time at 7 a minute |
| --- | --- | --- |
| prices today (36 names + SPY) | 37 a night, Tue to Sat | 5.3 min (job deadline 25 min) |
| prices with 46 adds (SUNC dropped): 83 names | 83 a night | 11.9 min |
| prices at 150 names + SPY | 151 a night | 21.6 min |
| discovery | 60 on Saturday | |
| pool-bars refresh | at most 300 on Sunday | 43 min |

Worst day after the first step: Saturday, 83 + 60 = 143 of 800. Sunday: 300 of the 700 that are not reserved for prices.

## Approvals

1. **Criteria thresholds above.** Recommend yes.
2. **The 47 adds as the first step, minus `SUNC` (46 names).** Recommend yes. Re-run the selection for the remaining names once the sector fix (line 8) is in.
3. **Prices job deadline.** Now 1500 s (25 min), 37 requests. For 83 names the run takes about 12 min, so no change is needed for this step. Recommend: no change now; with the 150 step, move prices from 00:30 to 00:10 and set the deadline to 2100 s (35 min). That ends by 00:50 at the latest (00:10 + 5 min start window + 35 min) and collect starts at 01:00. 151 requests take 21.6 min, only 3.4 min under today's deadline. `cronjob-order.test.ts` has to be updated with that change.
4. **Backfill on promote.** The nightly prices job fetches 260 bars per name, so a new name has its history after the first night, with no extra request. Companyfacts needs one run for the new names (SEC only, no Twelve Data; the 2026-10-17 run did 36 symbols and 4,217 facts). Filings and Form 4 backfill (D34) run over several days within the caps. Recommend yes to a companyfacts run for the 46 names after the add.
5. **Display rule for new names.** The code has no collect-only switch: `src/data/db-provider.ts` and `src/data/store.ts` select every list except `benchmark`, so an `extended` name would be scored and shown, and W20 adds it to the sitemap. Recommend: new names are not scored or shown on any page until 10 clean sessions in D16; ship that gate (filter `list = 'extended'` out of scoring and web) before running `universe-change.ts add`.
6. **Collect-only first.** Recommend yes: collectors and prices run for the new names, no scoring, no display, no AI cost (extract and judge) until line 5 is met.
7. **Weekly pool-bars CronJob** (`deploy/gitops/gitops/apps/invest-buddy/base/pool-bars-cronjob.yaml`, suspended, not applied). Needed because the pool changes each quarter after the SEC frames and the selection needs bars at most 5 days old. Sunday 10:00 Bratislava, `--limit 350`, deadline 3600 s, no retry. Recommend yes; it stays suspended until you unsuspend it in the infra repo.
8. **Sector source for pool names** (not built). Recommend yes: take the SIC code from the SEC submissions the pool already reads, map it to the existing sector names, then re-run.

## Open, outside this task

- Alpha Vantage rotation (D28) and the SEC collectors scale with the name count; not checked here.
- `pool-bars` asks for the 3 not-found symbols again on every run (3 requests, no result). The 7 names with fewer than 200 bars are recent listings; they are fetched on every run like the rest.
