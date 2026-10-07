# Update cadence: investing, not trading

Written 2026-10-06 after two research passes (institutional practice, change-driven pipelines). Sources are listed under each point. Items marked unverified came from search summaries only or from memory.

## Why change the schedule

The current design runs collect, detect, extract, reconcile, daily and judge every weekday. For 35 long-term holdings that is far more often than the data changes. Fundamental signals move when a company files, mostly four times a year. Running the model every day spends tokens and produces ideas that differ only by noise.

## What professionals do

- Rules-based index providers rebalance slowly: MSCI Quality and Value Weighted indexes twice a year (May, November) with buffer zones, Russell twice a year (June, December). Value and quality signals do not need frequent updating. Sources: MSCI Quality methodology (msci.com), LSEG Russell semi-annual reconstitution.
- Funds that hold two years or longer beat frequent traders by about 2.3% a year net of costs (Cremers and Pareek). Households with 75% yearly turnover lagged the market by 3.7% a year (Barber and Odean). More activity cost more.
- Selling is where managers lose skill. Across 783 portfolios, buys show skill and sells do worse than random selling (NBER w29076). A written sell checklist beats reacting to price.
- Fundamental signals last months. Analyst revision drift runs 6 to 12 months (NBER w5375). Opportunistic insider purchases earn about 82 bp a month, while routine trades (same month every year) carry no signal (NBER w16454). Post-earnings drift has largely faded in recent data (Martineau 2021), so there is no case for reacting within hours.
- Unverified: a daily, quarterly, annual review rhythm at funds. No primary source gave numbers. The index practice above is the best hard evidence.

## Deadlines that drive the calendar

- 8-K within 4 business days; Item 2.02 is the earnings release (sec.gov/answers/form8k.htm).
- Form 4 within 2 business days (Paul Weiss note on the SEC rule).
- 13F 45 days after quarter end, so about May 15, Aug 14, Nov 14, Feb 14 (sec.gov/files/form13f.pdf). Stale by design: use it for idea sourcing, not as a trigger.
- 10-Q and 10-K deadlines vary with filer size. Not verified this session.

## Cheap change detection

- The submissions API (`data.sec.gov/submissions/CIK##########.json`) needs no key and lists the latest filings. Thirty-five tickers cost 35 requests. The limit is 10 requests a second with a descriptive User-Agent (sec.gov/about/developer-resources).
- Dedupe key: last-seen accession number per CIK. This is our design, not an SEC rule.
- Earnings calendars from free APIs are hints only. Limits are unverified (Finnhub, FMP) except Alpha Vantage free at 25 requests a day. The 8-K Item 2.02 filing is the real trigger.

## Cost of the model step

Prices from platform.claude.com on 2026-10-06 (per million tokens, input / output): Haiku 4.5 $1 / $5, Sonnet 5.5 $2 / $10. The Batch API takes 50% off. Cache reads cost 0.1x, but a daily cron gets little from caching. A live NVDA extraction on haiku cost $0.05 to $0.08 with one turn. At 35 tickers that is about $2 to $3 per full pass, so the saving comes from not running a full pass daily.

## Design

Three levels, each cheaper than the next.

1. **Watch (script, no AI, daily).** Poll the submissions JSON for the 35 CIKs once a day, after the US close (about 22:30 Bratislava), plus a second poll in earnings weeks. Store new accession numbers. Run price and score updates here: they cost no tokens.
2. **Gate (script, no AI).** A ticker is marked changed only when a new accession number appears and the form is one of: 8-K with Item 2.02, 4.02 or 5.02, 10-Q, 10-K, their amendments. Form 4 and 13F are stored, and a cluster rule (3 or more insiders buying within 30 days, excluding routine same-month traders) can mark a ticker. Price rules mark a ticker on a drawdown or valuation band, as a review prompt, never as a sell.
3. **Extract and judge (AI, only on changed tickers).** Extract runs for marked tickers only, on haiku. Escalate to sonnet only if haiku flags a material change (guidance cut, restatement, large margin or revenue change). The judge runs when at least one ticker changed, plus on a fixed schedule below. Skip when the input hash matches a stored run.

Fixed schedule on top:

- Weekly: a digest of events (new filings, insider clusters, band hits). No model call needed beyond what already ran.
- Per earnings (about four times a year per ticker): re-score and write a short "thesis intact, weakened or broken" note.
- Semi-annual (May and November): full re-screen of holdings and watchlist, and the only time new additions are ranked. This matches the index rhythm.
- Annual: rewrite each thesis from scratch. Default minimum hold two years.

Thesis-break checklist, written at purchase: restatement or accounting problem, moat or margin deterioration, capital allocation failure, management integrity. Sell review fires only on a listed item, not on price alone.

Guardrails: a monthly token budget with a hard stop, a log of processed accession numbers and hashes, and manual-only reprocessing.

The thresholds above (drawdown band, 30% turnover target) are placeholders to tune, not sourced numbers.

## Principle: script what is mechanical, spend AI only on judgment and search

The goal is the same card quality as the old scan at a fraction of the tokens.

| Step | Who does it |
|---|---|
| Fetch filings, prices, facts, insider trades, event dates | script |
| Detect what changed, apply the gate rules | script |
| Numbers on the card (price, revenue, backlog, cash, share count) | script, from stored facts |
| Action, size band, setup ratings | code (`signals.ts`) |
| Reading a new filing or release and pulling the claims, with quotes | AI, cheap model, only on changed tickers |
| Why it matters, the plan wording, beneficiary chains | AI, only when the action or ratings changed |
| Finding new names outside the universe | script shortlist first, AI search only on the few that survive |
| Suppressing unchanged ideas | script (signature compare) |

Web search by the model is the most expensive part of the old scan, so it is reserved for discovery of new names and for gaps the scripts cannot fill (news, product catalysts, EPS estimates).

## Output and discovery

The old scan produced one card per ticker and stayed silent when nothing changed. Our judge already stores the same fields (`trade_ideas`: verdict, what happened, why it matters, setup ratings, numbers, plan, evidence links, a `signature` compared with the previous idea). Two gaps remain: the company page does not show the card (task B6), and the pipeline cannot propose names outside the 35 tickers (task F7).

## What this changes in the repo

See `docs/tasks-open.md`, group F. In short: replace the weekday schedule for extract and judge with a gated schedule, add the watch and gate step, add the budget guard, and move the full re-screen to twice a year.

F3 status (2026-10-07): detect now stores one daily gate in `scheduled_gates`. The scheduled extractor reads its symbols and accessions through the protected ingest endpoint, then marks extraction complete. Judge reads that gate after extraction and marks its review complete. Empty gates exit before any model call. A promoted discovery instrument stays in the gate until its first applied extraction. The CronJobs remain suspended in this proposal; the fixed review calendar and separate review schedule belong to F5.
