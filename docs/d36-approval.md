# D36 approval sheet

Data as of 2026-10-18, criteria version `d35-2026-10-draft`. Files: `tmp/universe/selected.csv`, `excluded.csv`, `review.md`, `pool.csv`, `pool.json` (local, not committed). Public wording stays informational screening (ADR-001).

The owner approved all 8 lines below with the recommended answers. This sheet now records what was built for lines 5, 6 and 8, the rerun of the selection, and the order of work after deploy. Line 3 stays a proposal.

## What was run

- Pool bars: 297 of 300 pool names have bars (newest 2026-10-16). 3 symbols are rejected by Twelve Data as not found: `PHXE-P`, `HGIT`, `ZARE`; `pool-bars` no longer asks for them (and skips `SUNC`, see below).
- Pool (SEC frames CY2026Q2): 3,181 filers with growth, top 300 by the weaker of the last two quarters' YoY growth, revenue 50M USD or more, current universe excluded. `pool.json` now also holds the SIC code from the SEC submissions, read in the same request as the filing forms (300 of 300 have one).
- Selection (`select-universe --as-of 2026-10-18 --target 150 --pool tmp/universe/pool.json`, read-only database through a port-forward): 150 selected, 36 core and 114 adds. 268 excluded.
- Excluded by reason: 138 `below_cut`, 82 `filer_unknown`, 26 `volume_below_floor`, 17 `price_below_min`, 4 `not_common_stock`, 1 `duplicate_filer`, 0 `sector_cap`. The 82 `filer_unknown` rows are existing discovery names that are not in the pool.
- All 114 adds come from the pool. The cut is at YoY growth 52.4%.

## Sector fix (line 8)

First run: pool names had no sector, all landed in `Unclassified`, and that group hit the cap of 37, so 206 pool names were dropped for a sector that does not exist.

Now:
- `src/universe/sector.ts` maps the SEC SIC code to existing sector names: Biotech (2833-2836, 8731), AI & semiconductors (3559, 3571, 3572, 3576, 3674, 3825), Cloud & SaaS (7370-7374), Fintech (6099, 6141, 6153, 6159, 6199), Energy & EV (1311, 1381, 1382, 1389, 2911, 3620, 3621, 3690, 3711, 4610, 4911, 4922-4924, 4991, 5171, 5172). Any other code, or a missing one, stays `Unclassified`.
- `sector_cap` never applies to `Unclassified`. Named sectors are still capped at 37 (25% of 150); no sector reached it in this run.
- `SUNC` is excluded with reason `duplicate_filer` (same revenue as `SUN`, 14,259M USD). The list is explicit: `DUPLICATE_FILERS` in `src/universe/select.ts`.
- 61 of the 114 adds are `Unclassified` (industries the five sector names do not cover, for example mining, industrials, medical devices, consumer). The mapping is deliberately narrow; widening it means new sector names and is the owner's call.

Other things in the list:
- `URGN` and `LPG` have 20-F and 6-K filings in their history next to 10-K and 10-Q.
- Growth rates above 1,000% (`PGEN`, `LQDA`, `ONDS`) come from very small prior-year revenue.
- `EVC`, `FUBO`, `ABTC` pass the liquidity floor with about 12 to 13M USD a day.

## Collect-only gate (lines 5 and 6)

List `extended` now means collected and priced, not scored, not shown, no AI cost.
- Hidden for `extended`: scoring input (`DatabaseUniverseProvider.instruments`), pages and sitemap (`store.ts` `latestScores`, `instrumentUniverse`), insiders page, extract (`reviewDueSymbols`, detect gate universe, `/api/ingest/universe`, extraction-runs and bundle ingest) and judge input.
- Still collected for `extended`: prices, collect, watch, companyfacts, earnings calendar, 13F (`loadUniverse(..., { collect: true })`). Macro fields are written for scored names only; the next macro run covers a name after promotion.
- The 7 names seeded as `extended` before D36 (AAPL, ASML, MDB, META, NOW, ORCL, UBER) are live scored names. Migration `089_extended_collect_only.sql` moves them to `core` so the gate does not hide them. It runs in the web init container before the new image serves.
- Promotion (10 clean sessions, D16): `universe-promote` job, at most 10 a week, CronJob suspended (see `docs/universe-criteria.md`, Promotion to core).
- `select-universe` treats `extended` names (other than the 7 seeded ones) as candidates again, not as core.

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
| `duplicate_filer` | explicit list (`SUNC`, duplicate of `SUN`) |
| `sector_cap` | no named sector above 25% of the size (37 of 150); `Unclassified` is not capped |
| `below_cut` | past the size |

Ranking: growth above 15% first, then the rest; inside a group by growth, then dollar volume, then ticker. Size 150.

## Proposed list (150: 36 core, 114 adds)

Core, kept (36): AAPL, AFRM, AMD, AMZN, ASML, AVGO, CRM, CRSP, CRWD, DDOG, ENPH, GOOGL, MDB, MELI, META, MSFT, NET, NOW, NVDA, OKTA, ORCL, PANW, PCVX, PLTR, PYPL, REGN, ROKU, SE, SHOP, SMCI, SNOW, SQ, TSLA, UBER, VRTX, ZS. Five fail a rule and stay as core: ASML and SE (`foreign_filer`), ENPH and VRTX (`growth_not_positive`), PCVX (`no_revenue_history`).

Adds (114), all passed every rule:

| # | Ticker | Name | Sector | YoY % | Avg $ vol (M) | Close | In first list |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PGEN | PRECIGEN, INC. | Biotech | 6323 | 36 | 6.39 | yes |
| 2 | LQDA | LIQUIDIA CORPORATION | Biotech | 1843 | 152 | 34.35 | yes |
| 3 | ONDS | Ondas Inc. | Growth | 1235 | 508 | 6.04 | yes |
| 4 | FLY | Firefly Aerospace Inc. | Growth | 657 | 70 | 16.75 | yes |
| 5 | KYMR | KYMERA THERAPEUTICS, INC. | Growth | 466 | 89 | 104.78 | yes |
| 6 | MU | Micron Technology, Inc. | AI & semiconductors | 346 | 26549 | 878.84 | yes |
| 7 | LUNR | INTUITIVE MACHINES, INC. | Growth | 310 | 134 | 10.78 | yes |
| 8 | INSM | INSMED INC | Biotech | 296 | 281 | 96.27 | yes |
| 9 | RHLD | Resolute Holdings Management, Inc. | Fintech | 296 | 18 | 113.67 | yes |
| 10 | FUBO | FuboTV Inc. | Unclassified | 290 | 13 | 8.00 | yes |
| 11 | IONQ | IONQ, INC. | Cloud & SaaS | 287 | 914 | 31.28 | yes |
| 12 | SM | SM ENERGY CO | Growth | 215 | 130 | 39.50 | yes |
| 13 | UNIT | Uniti Group Inc. | Unclassified | 203 | 22 | 5.60 | yes |
| 14 | URGN | UroGen Pharma Ltd. | Biotech | 199 | 39 | 34.56 | yes |
| 15 | BE | BLOOM ENERGY CORPORATION | Energy & EV | 166 | 3659 | 221.31 | yes |
| 16 | SUN | SUNOCO LP | Energy & EV | 165 | 40 | 73.26 | yes |
| 17 | NLST | NETLIST INC | AI & semiconductors | 163 | 16 | 5.74 | yes |
| 18 | XE | X-Energy, Inc. | Unclassified | 154 | 103 | 10.36 | yes |
| 19 | INSW | International Seaways, Inc. | Discovery | 139 | 75 | 109.99 | yes |
| 20 | WBI | WaterBridge Infrastructure LLC | Energy & EV | 128 | 19 | 28.49 | yes |
| 21 | VNOM | Viper Energy, Inc. | Energy & EV | 128 | 79 | 45.02 | yes |
| 22 | SITM | SiTime Corporation | AI & semiconductors | 127 | 273 | 472.14 | yes |
| 23 | EVC | ENTRAVISION COMMUNICATIONS CORPORATION | Unclassified | 126 | 12 | 6.32 | yes |
| 24 | CDE | COEUR MINING, INC. | Unclassified | 126 | 682 | 15.47 | yes |
| 25 | LPG | DORIAN LPG LTD. | Unclassified | 123 | 30 | 53.60 | yes |
| 26 | KLIC | KULICKE AND SOFFA INDUSTRIES, INC. | AI & semiconductors | 123 | 63 | 78.63 | yes |
| 27 | SNDA | Sonida Senior Living, Inc. | Growth | 122 | 18 | 35.29 | yes |
| 28 | ABTC | American Bitcoin Corp. | Fintech | 121 | 13 | 7.56 | yes |
| 29 | HNI | HNI Corporation | Unclassified | 121 | 25 | 46.86 | yes |
| 30 | BBIO | BridgeBio Pharma, Inc. | Biotech | 120 | 183 | 66.39 | yes |
| 31 | RGLD | Royal Gold, Inc | Unclassified | 115 | 163 | 238.05 | yes |
| 32 | CDNL | Cardinal Infrastructure Group Inc | Unclassified | 114 | 28 | 14.62 | yes |
| 33 | WAT | Waters Corporation | Unclassified | 113 | 318 | 436.95 | yes |
| 34 | LIFE | Ethos Technologies Inc. | Unclassified | 113 | 54 | 37.52 | yes |
| 35 | FIGR | FIGURE TECHNOLOGY SOLUTIONS, INC. | Unclassified | 113 | 158 | 27.13 | yes |
| 36 | CRWV | CoreWeave, Inc. | Cloud & SaaS | 112 | 2854 | 61.39 | yes |
| 37 | STAA | STAAR Surgical Co | Unclassified | 111 | 21 | 21.27 | yes |
| 38 | LGN | Legence Corp. | Unclassified | 111 | 58 | 43.53 | yes |
| 39 | COMP | COMPASS, INC. | Unclassified | 109 | 137 | 9.13 | yes |
| 40 | CORZ | Core Scientific, Inc./tx | Fintech | 109 | 211 | 13.48 | yes |
| 41 | DNOW | DNOW INC. | Unclassified | 108 | 38 | 15.68 | yes |
| 42 | ALAB | Astera Labs, Inc. | AI & semiconductors | 104 | 1241 | 285.82 | yes |
| 43 | TER | TERADYNE, INC. | AI & semiconductors | 104 | 963 | 325.00 | yes |
| 44 | AAON | AAON, INC. | Unclassified | 101 | 96 | 73.73 | new |
| 45 | IBRX | IMMUNITYBIO, INC. | Biotech | 94 | 103 | 9.18 | new |
| 46 | RDN | Radian Group Inc | Unclassified | 93 | 51 | 34.04 | new |
| 47 | ALSN | ALLISON TRANSMISSION HOLDINGS, INC. | Unclassified | 92 | 91 | 111.80 | new |
| 48 | SNDX | Syndax Pharmaceuticals, Inc. | Biotech | 92 | 31 | 12.90 | new |
| 49 | STRL | STERLING INFRASTRUCTURE, INC. | Unclassified | 90 | 286 | 424.36 | new |
| 50 | RDW | Redwire Corporation | Unclassified | 90 | 153 | 8.39 | new |
| 51 | MP | MP Materials Corp. / DE | Unclassified | 89 | 299 | 40.17 | new |
| 52 | ATLC | Atlanticus Holdings Corp | Fintech | 89 | 12 | 92.02 | new |
| 53 | BG | BUNGE GLOBAL SA | Unclassified | 88 | 187 | 106.14 | new |
| 54 | PHAT | PHATHOM PHARMACEUTICALS, INC. | Biotech | 88 | 10 | 6.92 | new |
| 55 | AAOI | Applied Optoelectronics, Inc. | AI & semiconductors | 86 | 1131 | 75.57 | new |
| 56 | TIC | TIC Solutions, Inc. | Unclassified | 86 | 16 | 8.65 | new |
| 57 | CHRD | Chord Energy Corporation | Energy & EV | 84 | 98 | 154.56 | new |
| 58 | HUT | Hut 8 Corp. | Fintech | 81 | 466 | 67.75 | new |
| 59 | BTGO | BITGO HOLDINGS, INC. | Fintech | 80 | 13 | 5.88 | new |
| 60 | LMND | Lemonade, Inc. | Unclassified | 79 | 51 | 44.20 | new |
| 61 | ET | ENERGY TRANSFER LP | Energy & EV | 78 | 172 | 20.26 | new |
| 62 | CBRS | Cerebras Systems Inc. | AI & semiconductors | 74 | 1565 | 127.21 | new |
| 63 | RYZ | RYERSON HOLDING CORPORATION | Unclassified | 72 | 12 | 27.46 | new |
| 64 | HCC | Warrior Met Coal, Inc. | Unclassified | 71 | 58 | 89.94 | new |
| 65 | MDGL | MADRIGAL PHARMACEUTICALS, INC. | Biotech | 71 | 133 | 449.74 | new |
| 66 | OSCR | Oscar Health, Inc. | Unclassified | 70 | 169 | 31.89 | new |
| 67 | QXO | QXO, INC. | Unclassified | 70 | 239 | 10.86 | new |
| 68 | FTK | FLOTEK INDUSTRIES INC/CN | Unclassified | 70 | 16 | 24.06 | new |
| 69 | TGTX | TG THERAPEUTICS, INC. | Biotech | 70 | 98 | 53.97 | new |
| 70 | SANM | Sanmina Corporation | Unclassified | 70 | 123 | 175.67 | new |
| 71 | TARS | TARSUS PHARMACEUTICALS, INC. | Biotech | 69 | 65 | 68.07 | new |
| 72 | GPN | GLOBAL PAYMENTS INC. | Unclassified | 69 | 216 | 83.67 | new |
| 73 | GNK | GENCO SHIPPING & TRADING LIMITED | Unclassified | 69 | 16 | 24.51 | new |
| 74 | IOVA | IOVANCE BIOTHERAPEUTICS, INC. | Biotech | 66 | 172 | 13.62 | new |
| 75 | VSEC | VSE CORPORATION | Unclassified | 65 | 79 | 164.08 | new |
| 76 | ROCK | GIBRALTAR INDUSTRIES, INC. | Unclassified | 65 | 14 | 37.89 | new |
| 77 | BLLN | BillionToOne, Inc. | Unclassified | 64 | 63 | 98.12 | new |
| 78 | WHD | Cactus, Inc. | Unclassified | 64 | 47 | 61.71 | new |
| 79 | LTC | LTC PROPERTIES INC | Unclassified | 64 | 24 | 43.68 | new |
| 80 | OMC | OMNICOM GROUP INC. | Unclassified | 63 | 208 | 80.56 | new |
| 81 | ARX | ACCELERANT HOLDINGS | Unclassified | 63 | 75 | 19.75 | new |
| 82 | CLS | CELESTICA INC. | Unclassified | 62 | 750 | 303.81 | new |
| 83 | LSCC | Lattice Semiconductor Corp | AI & semiconductors | 62 | 196 | 103.65 | new |
| 84 | RKLB | ROCKET LAB CORP | Unclassified | 62 | 1395 | 50.84 | new |
| 85 | AGX | ARGAN INC | Unclassified | 62 | 158 | 345.56 | new |
| 86 | RDDT | Reddit, Inc. | Cloud & SaaS | 61 | 876 | 156.14 | new |
| 87 | EE | Excelerate Energy, Inc | Energy & EV | 61 | 15 | 33.20 | new |
| 88 | BAM | BROOKFIELD ASSET MANAGEMENT LTD. | Unclassified | 61 | 136 | 45.32 | new |
| 89 | ARQT | ARCUTIS BIOTHERAPEUTICS, INC. | Biotech | 59 | 65 | 28.82 | new |
| 90 | NESR | NATIONAL ENERGY SERVICES REUNITED CORP. | Energy & EV | 59 | 71 | 18.73 | new |
| 91 | KRMN | KARMAN HOLDINGS INC. | Unclassified | 58 | 133 | 34.68 | new |
| 92 | PL | Planet Labs PBC | Unclassified | 58 | 176 | 13.56 | new |
| 93 | INOD | INNODATA INC. | Cloud & SaaS | 58 | 88 | 52.82 | new |
| 94 | DELL | Dell Technologies Inc. | AI & semiconductors | 58 | 4148 | 451.71 | new |
| 95 | WT | WisdomTree, Inc. | Unclassified | 57 | 60 | 21.39 | new |
| 96 | ESI | Element Solutions Inc | Unclassified | 56 | 150 | 35.05 | new |
| 97 | OUST | Ouster, Inc. | Unclassified | 56 | 98 | 28.43 | new |
| 98 | KNSA | Kiniksa Pharmaceuticals International, plc | Biotech | 55 | 40 | 78.59 | new |
| 99 | CRGY | Crescent Energy Co | Discovery | 55 | 105 | 13.77 | yes |
| 100 | MXL | MaxLinear, Inc. | AI & semiconductors | 55 | 218 | 71.32 | new |
| 101 | MAMA | Mama’s Creations, Inc. | Unclassified | 55 | 10 | 12.87 | new |
| 102 | APH | AMPHENOL CORPORATION | Unclassified | 55 | 943 | 79.35 | new |
| 103 | PLMR | Palomar Holdings, Inc. | Unclassified | 55 | 29 | 139.59 | new |
| 104 | HLIT | HARMONIC INC. | Unclassified | 54 | 19 | 10.69 | new |
| 105 | DKS | DICK’S SPORTING GOODS, INC. | Unclassified | 53 | 527 | 144.35 | new |
| 106 | SKWD | SKYWARD SPECIALTY INSURANCE GROUP, INC. | Unclassified | 53 | 24 | 61.23 | new |
| 107 | HNGE | Hinge Health, Inc. | Cloud & SaaS | 53 | 170 | 99.16 | new |
| 108 | CURB | Curbline Properties Corp. | Unclassified | 53 | 42 | 26.52 | new |
| 109 | APP | AppLovin Corporation | Cloud & SaaS | 53 | 1588 | 266.13 | new |
| 110 | RUN | Sunrun Inc. | Unclassified | 53 | 67 | 7.30 | new |
| 111 | NVT | nVent Electric plc | Unclassified | 53 | 347 | 142.03 | new |
| 112 | KALU | KAISER ALUMINUM CORPORATION | Unclassified | 53 | 34 | 147.25 | new |
| 113 | HL | HECLA MINING COMPANY | Unclassified | 52 | 659 | 15.30 | new |
| 114 | CVNA | CARVANA CO. | Unclassified | 52 | 547 | 58.83 | new |

Changes against the first list (47 adds): 44 stay, 3 drop, 70 are new. Dropped: `SUNC` (`duplicate_filer`), `LLY` and `ESTA` (`below_cut`: with `Unclassified` uncapped the cut moves to 52.4% growth, and they had 48% and 32%). `CRGY` stays. The new names are the ones the cap had blocked.

Sector spread of the 150: Unclassified 61, Biotech 18, AI & semiconductors 17, Cloud & SaaS 12, Energy & EV 10, Fintech 9, Sample extension 7, Growth 6, Cybersecurity 4, Additional growth 4, Discovery 2.

## Request budget (Twelve Data: 800 a day, 7 a minute in code, 100 a day reserved for prices)

| Job | Requests | Time at 7 a minute |
| --- | --- | --- |
| prices today (36 names + SPY) | 37 a night, Tue to Sat | 5.3 min (job deadline 25 min) |
| prices with 47 adds (first step, old list): 83 names | 83 a night | 11.9 min |
| prices at 150 names + SPY (36 core + 114 adds) | 151 a night | 21.6 min |
| discovery | 60 on Saturday | |
| pool-bars refresh | at most 300 on Sunday | 43 min |

Worst day with 150 names: Saturday, 150 + 60 = 210 of 800. Sunday: 300 of the 700 that are not reserved for prices.

## Approvals (owner, all 8 yes)

1. **Criteria thresholds above.** Approved.
2. **First step of adds.** Approved as 47 minus `SUNC`. The rerun after the sector fix gives 114 adds; the command sequence below adds them in the order of the table, in batches the prices job can carry (see line 3).
3. **Prices job deadline.** Changed to 00:10 and 2100 s in the prices-0010-2100 PR (invest-buddy and infra). Now 1500 s (25 min), 37 requests. 151 requests take 21.6 min, 3.4 min under today's deadline. For the 150 step: move prices from 00:30 to 00:10 and set the deadline to 2100 s (35 min). That ends by 00:50 at the latest (00:10 + 5 min start window + 35 min) and collect starts at 01:00. `cronjob-order.test.ts` has to be updated with that change, in the infra repo's manifests (`deploy/gitops/`, not touched here). Until then, add in batches so the nightly count stays under about 100 names.
4. **Backfill on promote.** Approved. The nightly prices job fetches 260 bars per name, so a new name has its history after the first night. Companyfacts needs one run for the new names (SEC only; the 2026-10-17 run did 36 symbols and 4,217 facts).
5. **Display rule for new names.** Built (see Collect-only gate).
6. **Collect-only first.** Built.
7. **Weekly pool-bars CronJob** (`deploy/gitops/gitops/apps/invest-buddy/base/pool-bars-cronjob.yaml`, suspended, not applied). Approved; stays suspended until unsuspended in the infra repo.
8. **Sector source.** Built (see Sector fix), selection rerun.

## After deploy (coordinator, needs the write approval of line 2)

1. Check the image is live and migration 089 ran: the 7 names AAPL, ASML, MDB, META, NOW, ORCL, UBER have `list='core'` in `universe_membership`, and the dashboard still lists them.
2. Print the add commands (nothing is written by this step):
   ```
   python3 - <<'PY'
   import csv, datetime, shlex
   for r in csv.DictReader(open("tmp/universe/selected.csv")):
       if r["list"] == "extended":
           print("npx tsx scripts/universe-change.ts add", r["ticker"], "--date", datetime.date.today(), "--reason", shlex.quote("D36 collect-only, growth pool 2026-10-18"), "--actor owner --name", shlex.quote(" ".join(r["name"].split())), "--sector", shlex.quote(r["sector"]), "--list extended --criteria-version d35-2026-10-draft")
   PY
   ```
   Run the printed lines against the database with `DATABASE_URL` (port-forward to the `postgres` service) in batches.
3. Companyfacts for the added names (SEC only): `npm run companyfacts -- --only T1,T2,...` with `DATABASE_URL` and `SEC_USER_AGENT`, or the one-off Job as on 2026-10-17. Use `--dry-run` first.
4. After the first nightly prices run, check `daily_bars` rows for the new names and that none appears on a page, in `/sitemap.xml`, or in `scheduled_gates` or `extraction_runs`.

## Open, outside this task

- Alpha Vantage rotation (D28) and the SEC collectors scale with the name count; not checked here.
- The 7 names with fewer than 200 bars are recent listings; they are fetched on every pool-bars run like the rest.
