# Shortlist, sector groups and portfolio limits

Backlog N1 and N2 (docs/tasks-2026-11-12.md). On 2026-11-10, 47 of 511 names had the stored state Setup met (14 on 2026-11-09, 2 on 2026-11-07). The shortlist is a second, informational view over the names whose displayed state is Setup met. It never changes a score, a state or the score history. Public wording follows ADR-001 and docs/wording-gate.md: no action words and no amounts.

Code: `src/engine/shortlist.ts`, `src/engine/shortlist-config.ts`, `src/data/shortlist.ts`, `src/universe/sector-groups.ts`, `src/components/shortlist-view.tsx`. Replay: `scripts/shortlist-replay.ts`.

## Inputs

The shortlist reads the same stored listing rows as the scanner (the newest score date only, 64 bars per name). Candidates are names whose displayed band (`displayScore`) is Setup met. The whole scored list of that date is used to rank relative strength. Other inputs:

- Points with data out of 25: the stored `evidencedMax`, else counted from the rule hits.
- Quote currency from the stored symbol master. A plain ticker with no stored currency is a US listing; a ticker with an exchange suffix and no currency stays unknown.
- Next report date from the stored earnings calendar (`readEarningsSnapshots`, `nextEarnings`). A stale calendar row counts as unknown.
- Sector group from `src/universe/sector-groups.ts` (see below).

## Gates

All thresholds are drafts in `SHORTLIST_CONFIG` (version `2026-11-12.1`). The owner has not signed them off.

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

## Sector groups

Eleven groups in the Morningstar style, which are also the sector names in the stored vendor fundamentals: Technology, Healthcare, Financial Services, Consumer Cyclical, Consumer Defensive, Industrials, Communication Services, Energy, Basic Materials, Real Estate, Utilities. Anything else is Unknown.

The group is taken from a named `instruments.sector` that fits one group (AI & semiconductors, Cloud & SaaS and Cybersecurity are Technology, Biotech is Healthcare, Fintech is Financial Services), then the stored vendor sector, then the stored vendor industry. Labels that span groups (Energy & EV, Growth, Additional growth) are skipped. Vendor sector and industry count only when observed on or before the score date. Nothing is written back and no backfill runs.

On 2026-11-10, 31 of the 47 Setup met names had `instruments.sector` Unclassified. The vendor sector should fill most of them; the replay reports how many stay Unknown.

## Concentration lens

The kept list is grouped by sector group with a count and share, for example "9 of 15 in Technology". A named group above 30% of the list (`sectorShareFlagPercent`) is flagged. Unknown is counted but never flagged. Names only, no money.

## Who sees it

The scanner shows the full view and the dashboard a compact block. The list is built from vendor-backed data, so it follows `canUseVendorData`: the owner and customers with an active Plus or trial plan see it. Everyone else gets a lock card and the page does not load the shortlist, including anonymous visitors while `PAYWALL` is off. `SHORTLIST_VIEW=off` hides it for everyone; the default is on.

## Owner limits

The owner allocation (`OWNER_VIEW`) adds two draft limits in `src/engine/allocation-config.ts`: one sector group at most 30% of total portfolio value including cash (`SECTOR_CAP`), and at most 15 open positions (`MAX_POSITIONS`). Details are in docs/sizing-guide.md.

## State filter

The scanner state filter used the stored state while the groups and counts used the displayed state, so a stored Setup met shown as Watching disappeared under both filters. The filter now uses the displayed state (`displayedState` in `src/components/view-model.ts`), tested in `scanner/filters.test.ts`. SQL counts of stored states and the displayed tally still differ by design.

## Replay

```sh
DATABASE_URL=<local or disposable database> npx tsx scripts/shortlist-replay.ts --days 5 --names
```

It runs in one read-only transaction that is rolled back, and prints per date: scored names, displayed Setup met, survivors after F1 and after F1+F2, F3 flags, not-assessed counts per check, and the largest sector group. It has not been run against production data yet, so there are no measured survivor counts here.

## Sources

- O'Neil holds 4 to 7 names ([fool.com interview](https://www.fool.com/specials/2002/06/20/foolcom-tmf-interview-bill-oneil-special.aspx)); the owner's Guide section 10 holds 5 to 15.
- IBD/O'Neil restrict buys to RS rank 80 or more ([AAII CAN SLIM](https://www.aaii.com/stockideas/article/299645-can-slim-seven-traits-shared-by-top-performing-stocks)).
- SEC staff treat more than 25% of fund assets in one industry as concentration ([Oppenheimer proxy, sec.gov](https://www.sec.gov/Archives/edgar/data/0000074658/000072888913000623/nyboardproxy.htm)). MSCI capped indexes limit sector and issuer weight ([MSCI Capped Indexes Methodology](https://www.msci.com/indexes/documents/methodology/3_MSCI_Capped_Indexes_Methodology_20240521.pdf)). No published sector cap exists for a personal portfolio, so 30% is a design choice.
- Morningstar groups holdings into 11 sectors ([Morningstar help](https://www.morningstar.com/help-center/portfolio/xray)).
- No source was found for a pre-earnings blackout; the 5-session flag and the 25% drawdown flag are design choices.

Open owner decisions: the thresholds above, whether F3 should hide instead of flag, and whether Plus should see a ranked list at all (legal-pack.md lists ordering as a lawyer question).
