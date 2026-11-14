# Shortlist, sector groups and portfolio limits

Backlog N1 and N2 (docs/tasks-2026-11-12.md). On 2026-11-10, 47 of 511 names had the stored state Setup met (14 on 2026-11-09, 2 on 2026-11-07). The shortlist is a second, informational view over the names whose displayed state is Setup met. It never changes a score, a state or the score history. Public wording follows ADR-001 and docs/wording-gate.md: no action words and no amounts.

Code: `src/engine/shortlist.ts`, `src/engine/shortlist-config.ts`, `src/data/shortlist.ts`, `src/universe/sector-groups.ts`, `src/components/shortlist-view.tsx`. Top picks and the model portfolio lens (S1): `src/universe/themes.ts`, `src/engine/model-lens.ts`, `src/components/shortlist-top-picks.tsx`, `src/i18n/shortlist-top-messages.ts`. Replay: `scripts/shortlist-replay.ts`.

## Inputs

The shortlist reads the same stored listing rows as the scanner (the newest score date only, 64 bars per name). Candidates are names whose displayed band (`displayScore`) is Setup met. The whole scored list of that date is used to rank relative strength. Other inputs:

- Points with data out of 25: the stored `evidencedMax`, else counted from the rule hits.
- Quote currency from the stored symbol master. A plain ticker with no stored currency is a US listing; a ticker with an exchange suffix and no currency stays unknown.
- Next report date from the stored earnings calendar (`readEarningsSnapshots`, `nextEarnings`). A stale calendar row counts as unknown.
- Sector group from `src/universe/sector-groups.ts` (see below).

## Gates

All thresholds are drafts in `SHORTLIST_CONFIG` (version `2026-11-14.1`). The owner has not signed them off.

| Gate | Check | Default | Fails when | Not assessed when |
| --- | --- | --- | --- | --- |
| F1 full evidence | points with data | at least 23 of 25 | fewer points have data | no rule hits are stored |
| F2 leadership | percentile of the 63-session price return inside the scored list | at least 80 | lower percentile | fewer than 64 bars |
| F2 liquidity | average close times volume over 20 sessions, USD quotes only | at least the scanner floor, 2M USD (`scanner/floor.ts`) | known value below the floor | non-USD or unknown quote, fewer than 20 bars |
| F3 report | NYSE sessions from the score date to the next report | flag at 5 or fewer | never, flag only | no calendar row, stale row, date outside the trading calendar |
| F3 drawdown | close under the highest high of the last 63 sessions | flag above 25% | never, flag only | no bars |

A name stays on the list when no check failed. A check that could not run is shown as "Not assessed" on the row; it neither passes nor fails the name. Dropped rows show the same markers and flags next to the fail reason. Ties in the percentile share the higher rank. Returns, ATR and drawdown are compared unrounded; pages round them only for display, so a 25.02% drawdown is flagged even though it shows as 25.0%. A report date counts only when it and the score date are inside the trading calendar, same-day reports included.

The RS window is 63 sessions (about three months) because the listing read keeps 64 bars. IBD/O'Neil use a 6 to 12 month RS rank; a longer window needs a separate bar read.

## Order

Kept names are ranked by, in order: displayed percent (higher first), points with data (higher), RS percentile (higher), ATR percent over 14 sessions (lower), traded value (higher), ticker. A missing value sorts after any known one. The full view groups the ranked names by sector group, and each row shows the first key that placed it below the row above in the same group. The first row of a group says so.

When a model portfolio snapshot is stored, the model portfolio lens below runs after this order. Names in a theme the model already holds above its cap move below all other names, and each part keeps the order above. A row moved this way says so instead of naming a tie-breaker.

## Sector groups

Eleven groups in the Morningstar style, which are also the sector names in the stored vendor fundamentals: Technology, Healthcare, Financial Services, Consumer Cyclical, Consumer Defensive, Industrials, Communication Services, Energy, Basic Materials, Real Estate, Utilities. Anything else is Unknown.

The group is taken from a named `instruments.sector` that fits one group (AI & semiconductors, Cloud & SaaS and Cybersecurity are Technology, Biotech is Healthcare, Fintech is Financial Services), then the stored vendor sector, then the stored vendor industry. Labels that span groups (Energy & EV, Growth, Additional growth) are skipped. Vendor sector and industry count only when observed on or before the score date. Nothing is written back and no backfill runs.

On 2026-11-10, 31 of the 47 Setup met names had `instruments.sector` Unclassified. The vendor sector should fill most of them; the replay reports how many stay Unknown.

## Concentration lens

The kept list is grouped by sector group with a count and share, for example "9 of 15 in Technology". A named group above 30% of the list (`sectorShareFlagPercent`) is flagged. Unknown is counted but never flagged. Names only, no money.

## Top picks (S1)

On 2026-11-12 the stored Setup met count was 54, and 20 on 2026-11-13 after the macro fix (#370). Nobody looks at 50 names, so the scanner and the dashboard now open with the first `SHORTLIST_TOP_N` names (default 6, accepted 1 to 15) in lens order. The block is titled "Highest ranked by the rules". Each name shows its theme, sector group, displayed percent, F3 flags and why it sits where it does: first by the rules, the tie-breaker against the name above with its value, or "placed after the names above" when the lens moved it. Below the names are two collapsed parts: the full shortlist (on the scanner, the grouped view described above) and every Setup met name of the day. The dashboard links to the scanner for the full view.

The wording follows ADR-001: no action words, no amounts, no position sizes. The page tests check the rendered block in both languages for buy, sell, hold, recommend and their Slovak forms, and for EUR.

## Themes

Sector groups are too coarse to tell AI from robotics, so `src/universe/themes.ts` adds ten themes plus Unknown: AI and semiconductors, cloud and software, cybersecurity, robotics and automation, healthcare and biotech, fintech, energy and EV, industrials, consumer, other.

A theme comes from, in order:

1. a named `instruments.sector` label with one theme: AI & semiconductors, Cloud & SaaS, Cybersecurity, Biotech (healthcare), Fintech, Energy & EV;
2. the stored vendor industry (`symbols.industry`), from a table that covers the industries stored on 2026-11-14;
3. the sector group, where it fits one theme (Healthcare, Energy and Utilities, Industrials, both consumer groups, and Real Estate and Basic Materials as other);
4. Unknown.

Unclassified, Growth, Discovery, Sample extension, Additional growth and Benchmark labels are skipped. Technology, Financial Services and Communication Services hold several themes, so a name there with an unmatched industry is Unknown. "Other" is a known classification outside the named themes: banks, insurance, asset managers, telecom, materials, real estate.

Mapping choices to note:

- The vendor has no cybersecurity or robotics industry. Cybersecurity comes only from the instrument label; other security software lands in cloud and software. Robotics and automation is Specialty Industrial Machinery plus Scientific & Technical Instruments; surgical robots stay in healthcare under Medical Instruments & Supplies.
- AI and semiconductors includes chip makers, chip equipment, computer hardware, electronic components and networking equipment.
- Fintech is Credit Services and Financial Data & Stock Exchanges. Banks and insurers are other.
- All utilities count as energy and EV. Auto makers count as consumer unless the instrument label says Energy & EV.
- Funds such as CSPX have no instrument row and stay Unknown.

## Model portfolio lens

The model portfolio is the owner's IBKR holdings from the stored Flex snapshot (`portfolio_snapshots`, written by the portfolio job). The snapshot stores position weights only; the lens sums them per theme and per sector group, normalized to the held weights (cash is not in the snapshot). Caps are drafts in `SHORTLIST_CONFIG`: a theme above 25% (`themeCapPercent`) and a sector group above 30% (`sectorGroupCapPercent`, the same value as the owner `SECTOR_CAP`). Other and Unknown are mixed buckets and never count as above a cap.

For each shortlist name the lens says one of: the theme is not in the model portfolio, it is at or under the cap, it is above the cap, the name is in Other (a mixed group with no cap, shown with its weight), or the theme is unknown. A sector group above its cap is shown as an extra line and does not move the name; with Technology at 81% it would otherwise push down every technology name, including robotics. Only a theme above its cap moves a name. The summary line reads, for example, "Model portfolio: 38% Cloud and software and 27% AI and semiconductors. The names here widen it with Healthcare and biotech and Consumer."

Customers see this as information about the public model portfolio: the newest published snapshot (the one the portfolio page shows), weights rounded to whole percent, no position sizes. The owner sees the newest stored snapshot with weights to one decimal. With no snapshot the block says so and the shortlist order stays. A stored sample snapshot is skipped, as on the portfolio page. If the snapshot or its classification cannot be read, the lens is off for that request, the order stays, and the failure is logged (`model_lens_read_failed`).

## Who sees it

The scanner shows the top picks with the full view collapsed under them, and the dashboard shows the top picks block. The list is built from vendor-backed data, so it follows `canUseVendorData`: the owner and customers with an active Plus or trial plan see it. Everyone else gets a lock card and the page does not load the shortlist, including anonymous visitors while `PAYWALL` is off. `SHORTLIST_VIEW=off` hides it for everyone; the default is on.

## Owner limits

The owner allocation (`OWNER_VIEW`) adds two draft limits in `src/engine/allocation-config.ts`: one sector group at most 30% of total portfolio value including cash (`SECTOR_CAP`), and at most 15 open positions (`MAX_POSITIONS`). Details are in docs/sizing-guide.md.

## State filter

The scanner state filter used the stored state while the groups and counts used the displayed state, so a stored Setup met shown as Watching disappeared under both filters. The filter now uses the displayed state (`displayedState` in `src/components/view-model.ts`), tested in `scanner/filters.test.ts`. SQL counts of stored states and the displayed tally still differ by design.

## Replay

```sh
DATABASE_URL=<local or disposable database> npx tsx scripts/shortlist-replay.ts --days 5 --names
```

It runs in one read-only transaction that is rolled back, and prints per date: scored names, displayed Setup met, survivors after F1 and after F1+F2, F3 flags, not-assessed counts per check, and the largest sector group. It was first run against production on 2026-11-13 (read-only connection, `EODHD_PRIVATE_USE=on SCORE_EXTENDED=on` to match the web filters).

| Score date | Scored | Setup met | After F1 | After F1+F2 | F3 flagged | Largest kept group |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-11-06 | 511 | 4 | 3 | 2 | 0 | Healthcare 2/2 |
| 2026-11-09 | 515 | 16 | 10 | 7 | 2 | Healthcare 4/7 |
| 2026-11-10 | 516 | 44 | 31 | 23 | 4 | Healthcare 11/23 |
| 2026-11-11 | 519 | 59 | 40 | 22 | 1 | Healthcare 9/22 |
| 2026-11-12 | 519 | 56 | 37 | 20 | 3 | Healthcare 7/20 |

Setup met here is the displayed state, so it differs slightly from stored-state counts. On 2026-11-12, 35 of the 56 had `instruments.sector` Unclassified; the vendor sector or industry placed all 35, so no name was Unknown. Healthcare is above the 30% flag on every date.

Other checks measured on the 56 names of 2026-11-12 (each on its own, not stacked):

| Check | Left of 56 |
| --- | ---: |
| Stored total at least 19 | 23 |
| F2 leadership alone (RS percentile at least 80) | 28 |
| F2 liquidity alone (13 not assessed stay) | 56 |
| Latest active judge idea with a signal action | 6 |
| Revenue acceleration confirmed from SEC 10-Q/10-K facts only | 30 |
| Catalyst rule matched | 17 |
| Accumulation rule matched | 29 |

These numbers predate the macro fix below, which removes the 3 macro points from US names while PPI reads higher.

### Top picks replay, 2026-11-14

The replay now also prints the top names after the lens for each date, using the newest stored snapshot on or before that date. Run read-only against production on 2026-11-14 with the same flags as above (`--days 5 --names`, top 6):

| Score date | Setup met (displayed) | Kept | Snapshot | Themes above cap | Moved down | Top 6 after the lens |
| --- | ---: | ---: | --- | --- | ---: | --- |
| 2026-11-09 | 16 | 7 | 2026-11-09 | cloud and software 38%, AI and semiconductors 28% | 0 | LPP.WAR, DB1.XETRA, CRON, HTFL, LFST, REGN |
| 2026-11-10 | 44 | 23 | 2026-11-10 | cloud and software 38%, AI and semiconductors 27% | 0 | LFST, TGTX, PLMR, AII, LTC, LPP.WAR |
| 2026-11-11 | 59 | 22 | 2026-11-10 | cloud and software 38%, AI and semiconductors 27% | 1 (TXN) | LFST, TGTX, PLMR, AII, LTC, LPP.WAR |
| 2026-11-12 | 56 | 20 | 2026-11-12 | cloud and software 38%, AI and semiconductors 28% | 1 (TXN) | TGTX, LFST, XNCR, PLMR, KDP, LPP.WAR |
| 2026-11-13 | 15 | 6 | 2026-11-13 | cloud and software 38%, AI and semiconductors 27% | 0 | LPP.WAR, DB1.XETRA, TGTX, MUV2.XETRA, ELE.MC, TLX.XETRA |

The 2026-11-13 snapshot by theme: cloud and software 38%, AI and semiconductors 27%, cybersecurity 13%, energy and EV 3%, consumer 3%, industrials 3%, robotics 2%, Unknown 10% (CSPX). By sector group: Technology 81%. The shortlist itself is mostly healthcare and financial names these days, so the lens moved one name (TXN, AI and semiconductors) on two dates; the top names mostly widen the model with healthcare, consumer, fintech and energy.

## Sources

- O'Neil holds 4 to 7 names ([fool.com interview](https://www.fool.com/specials/2002/06/20/foolcom-tmf-interview-bill-oneil-special.aspx)); the owner's Guide section 10 holds 5 to 15.
- IBD/O'Neil restrict buys to RS rank 80 or more ([AAII CAN SLIM](https://www.aaii.com/stockideas/article/299645-can-slim-seven-traits-shared-by-top-performing-stocks)).
- SEC staff treat more than 25% of fund assets in one industry as concentration ([Oppenheimer proxy, sec.gov](https://www.sec.gov/Archives/edgar/data/0000074658/000072888913000623/nyboardproxy.htm)). MSCI capped indexes limit sector and issuer weight ([MSCI Capped Indexes Methodology](https://www.msci.com/indexes/documents/methodology/3_MSCI_Capped_Indexes_Methodology_20240521.pdf)). No published sector cap exists for a personal portfolio, so 30% is a design choice.
- Morningstar groups holdings into 11 sectors ([Morningstar help](https://www.morningstar.com/help-center/portfolio/xray)).
- No source was found for a pre-earnings blackout; the 5-session flag and the 25% drawdown flag are design choices.

Open owner decisions: the thresholds above, the theme and sector group caps, the theme table (especially robotics and automation), whether F3 should hide instead of flag, and whether Plus should see a ranked list at all (legal-pack.md lists ordering as a lawyer question).
