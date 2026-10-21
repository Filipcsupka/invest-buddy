# ETF research track

Owner decision 2026-10-21: a weekly AI web-research run for ETFs, kept apart from the stock pipeline and measured on its own. The model runs through the Codex adapter with the existing codex token secret. There are no token, call, USD or quota gates. Only `RESEARCH_ENABLED=off` stops a run.

Files:

- Prompt: `scanner/prompts/etf-research.md`
- Model output contract: `scanner/schema/etf-output.schema.json`
- Tables: `migrations/092_etf_research.sql` (`etf_research_runs`, `etf_picks`, `etf_pick_history`, `etf_outcomes`)
- Prompt test: `scanner/test/etf-prompt.test.mjs`

## Placeholders

The runner replaces `{{name}}` tokens in the prompt, the same way `scanner/run-scan.mjs` fills its templates (`/\{\{(\w+)\}\}/`). The prompt uses exactly these:

| Placeholder | Value | Example of the form |
| --- | --- | --- |
| `{{asOf}}` | Run date, `YYYY-MM-DD`, in Europe/Bratislava. The model must return the same value in `asOf`. | `2026-10-26` |
| `{{maxCandidates}}` | Most candidates the model may return. Default `12`. The schema allows up to 20. | `12` |
| `{{openPicks}}` | JSON array of current `etf_picks` rows the model should recheck: `symbol`, `exchange`, `name`, `call`, `conviction`, `trackedIndex`, `terPct` and `lastSeen` (the `last_seen_at` date). Use `[]` when there are none. | `[]` |

`scanner/test/etf-prompt.test.mjs` reads the table above and fails if a listed placeholder is missing from the prompt, or if the prompt uses one that is not listed.

The runner may also append the JSON Schema after the prompt, as `run-research.mjs` does for stocks. The prompt already names the schema file and every field rule, so it works with or without that.

## How often to run

### What changes and how often

Checked on 2026-10-21. "Opened" means the page was fetched and the quoted text was read in this session. "Search result" means only a search summary was seen.

| Fact | How often it changes | Source | Status |
| --- | --- | --- | --- |
| iShares fund size, NAV, holdings count | Daily. On 2026-10-21 the SWDA page dated net assets 20/Oct/2026 and the number of holdings 19/Oct/2026. The same page gives the rebalance frequency as quarterly. | https://www.ishares.com/uk/individual/en/products/251882/ishares-msci-world-ucits-etf-acc-fund | Opened |
| Vanguard full holdings (passive UCITS funds) | Monthly. "As of the end of the most recent month-end, 15 calendar days after the end of the month-end." Top ten holdings follow the same timing. The PDF metadata dates it 2016 with a 2024 edit, so it may have been revised since. | https://www.de.vanguard/content/dam/intl/europe/documents/legal-documents/uk/portfolio-holdings-disclosure-policy.pdf | Opened |
| Xtrackers NAV and fee | Daily. The XDWD page shows "NAV (19/10/2026): 159.84 USD" and "All-in-fee (TER): 0.12%". A plain fetch of that page returned no text; a browser render did. The quote checker may not see it. | https://etf.dws.com/en-gb/IE00BJ0KDQ92-msci-world-ucits-etf-1c/ | Opened (browser render only) |
| Amundi factsheets | Monthly, per a search result for Amundi's Irish site ("Monthly Factsheets"). | https://www.amundi.ie/retail/Funds2/Funds-Pricing-and-Performance | Unverified (search result) |
| SPDR holdings and factsheets | Not established. The fund page redirected to a fund finder; aggregator pages showed months-old holdings snapshots. | https://www.ssga.com/ie/en_gb/intermediary/fund-finder | Unverified |
| Irish ETF holdings disclosure rule | Since 17 April 2025 the Central Bank of Ireland allows periodic disclosure instead of daily, with "portfolio holdings as at the end of each calendar quarter ... disclosed publicly within 30 business days of the end of the quarter." Most UCITS ETFs are Irish, so daily holdings files may thin out. | https://www.klgates.com/Central-Bank-of-Ireland-Updates-its-UCITS-QA-on-Portfolio-Transparency-for-ETFs-4-29-2025 | Opened |
| TER changes | A few batches per issuer per year, announced ahead. Examples: DWS cut fees on seven Xtrackers ETFs (March 2026); UBS cut five ETFs, MSCI USA from 0.06% to 0.03% (May 2026); State Street cut the S&P Europe Defense Vision UCITS ETF from 0.30% to 0.20% effective 4 June 2026. | https://etfexpress.com/2026/03/04/dws-lowers-fees-for-seven-xtrackers-etfs/ ; https://www.ubs.com/ch/en/assetmanagement/about/news/2026-news-articles/etfs-and-core-range.html ; https://www.ssga.com/library-content/announcement/etfs/emea/2026/en/spdr-ii-shareholder-notice-state-street-spdr-europe-defense-ter-change.pdf | Unverified (search results) |
| MSCI index reviews | Quarterly, February, May, August and November. Since February 2023 all four are full reviews; before that only May and November were. | https://www.msci.com/documents/1296102/38467301/Index+Rebalancing+Brochure+Jan+2024.pdf/b51f2487-07ea-ddbe-ad2e-4c3d81bddcb7 | Unverified (search result) |
| S&P 500 rebalance | "S&P 500 rebalances take place after the close of the third Friday of the quarter-ending month." Also: "Around 90% of the nearly 800 S&P 500 constituent changes since 1995 did not take place on the third Friday of the quarter-ending month." | https://www.indexologyblog.com/2025/06/23/quarterly-changes-may-not-be-constant/ | Opened |
| Bloomberg bond indices | Monthly, on the last business day of the month. Rating and amount changes are applied daily to the projected universe. Seen in a methodology for a Bloomberg MSCI sustainability variant, not the flagship Global Aggregate rulebook. | https://www.msci.com/documents/1296102/26180598/Bloomberg+Barclays+MSCI+Global+Aggregate+Sustainability+Index.pdf | Unverified (search result) |
| PRIIPs KID | Reviewed at least every 12 months and after any significant change, revised without undue delay when the review finds a change is needed. | https://handbook.fca.org.uk/techstandards/PRIIPs/2017/reg_del_2017_653_oj/chapter-iii/018.html | Unverified (search result) |

### Conclusion

The facts a pick rests on (TER, index, domicile, replication) change a few times a year at most, and fee changes are announced before they take effect. Fund size and price change daily, but a long-term pick does not need a daily view of them. Index reviews are quarterly for MSCI and S&P, monthly for Bloomberg bond indices. Factsheets are monthly at the issuers checked.

Run weekly: Mondays 07:40 Europe/Bratislava, before European exchanges open. A week is short enough to catch fee cuts, launches, closures and index review announcements in time to act, and long enough that most weeks bring something new. A daily run would mostly repeat the same cards.

A manual run after a market shock is allowed. What counts as a shock is the owner's call. One suggestion, not yet agreed: a weekly fall of 7% or more in the MSCI World or S&P 500, or a sudden central bank move.

What would justify a change:

- Less often (every two weeks or monthly): over 8 consecutive runs, most picks come back with the same call and no new dated fact in `whatHappened`. `etf_pick_history` shows this directly.
- More often: picks regularly miss events that matter for the call (a fee cut or closure notice already acted on by the market before the next Monday run). Look for this in the review of outcomes, not in a single week.

## Token cost

No usage has been measured yet, so this section has no token figures. `etf_research_runs.usage` stores what the adapter reports from the first run on.

What drives the cost:

- Pages read. Factsheets and KIDs are long PDFs, and fund pages carry large tables. Reading fewer, better sources (issuer page first) costs less than browsing aggregators.
- Candidates. Each candidate needs its own lookups for TER, index, price and alternatives. `{{maxCandidates}}` caps this.
- Output. The schema caps it. Per candidate, string fields with a `maxLength` add up to 10,160 characters at most (thesis, five `whatHappened` lines, `whyItMatters`, plan, five risks, six evidence URLs and quotes, and the short fields).
- Model and reasoning effort set by the Codex adapter.

The run uses the Codex subscription, not a paid API key, so there is no per-token bill. What it does share is the Codex rate-limit window used by the stock research CronJobs. One weekly run on Monday morning sits apart from the daily stock research. A run cut short by the window can be recorded with the `cutoff` status that `etf_research_runs` already allows; no gate is added for that.

## Measuring picks

The goal is to know whether following the calls would have beaten simply holding the baseline.

- Entry. `entry_date` is the first trading session that closes after the run that first saw the fund finished, and `entry_price` is that session's close for the listing in `symbol`. The model's `price.last` is for display only and never used as entry. Entry is set once per fund; later runs do not reset it.
- What is measured. The call at entry, from the fund's first `etf_pick_history` row. Later call changes stay visible in history but are not measured separately, because `etf_outcomes` has one row per fund and horizon. Measuring each call change would need an additive contract change.
- Horizons. 30, 60, 90 and 180 calendar days after `entry_date`. The exit is the close of the first trading session on or after that day.
- Return. `return_pct` is the price change from entry to exit. For distributing funds this misses the payouts; use a total-return or adjusted close when the price source has one, and say which.
- Benchmark. The default is SPY (the contract default in `etf_picks.benchmark_symbol`). Use another benchmark when SPY is not what the pick would replace: a bond fund against a broad bond ETF (such as AGG, or a global aggregate UCITS fund), gold against a gold fund, a world or regional equity fund against a world ETF. Set the benchmark when the pick is created and do not change it later. `excess_pct` is `return_pct` minus `benchmark_return_pct`.
- Currency. A EUR or GBP listing measured against USD SPY mixes in currency moves. Until there is a same-currency benchmark series (a UCITS S&P 500 or world ETF on the same exchange), report those picks with a currency note and keep them apart in the summary.
- Success. `BUY_ZONE`: excess return above zero at the horizon. `AVOID`: excess return below zero, meaning the investor was right to skip it. `WATCH` has no hit rate; report its average excess return so it can be compared with the other two.
- Sample. Show a hit rate for a call and horizon only once at least 20 picks have a measured outcome there. Below that, show the count so far ("7 of 20"). Many equity ETFs move together, so 20 picks are fewer independent results than the count suggests; read early numbers with that in mind.
- Report per call and horizon: count, hit rate, median and mean excess return. The 180-day horizon matters most for a long-term holder; the shorter ones arrive sooner and catch bad calls early.

Outcomes are filled only where a price series exists for the listing and its benchmark. No new paid data API is used. Which listings the current price collector covers has not been checked here.

## Open items

- The verifier does not parse PDFs today (`src/research/verify.ts` returns `pdf_not_parsed`), and some issuer pages render their tables with scripts. KID and factsheet quotes will often show as unverified until the ETF verifier handles both.
- The SPDR and Amundi rows above, and the rows marked from search results, need a direct check before anyone relies on them.
