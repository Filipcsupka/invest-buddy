# Script-first pipeline

Scripts collect and store source documents and numbers. AI reads stored text only, with no web tools, and writes structured output. A script applies that output through the existing scan ingest and reconcile path. Raw data is kept for 30 days.

## Why

The daily Claude scan ran 36 agent sessions that each searched and fetched pages. The cost was in finding pages, not in reading them. Scripts find and fetch for free. AI only reads.

## Flow

1. Prices and collect run without AI. Collect stores source documents and computed facts for the universe.
2. Macro runs once each morning and posts only the macro finding. It uses Claude Sonnet with a 10-turn limit. If the installed Claude CLI lacks `--max-turns`, the runner limits the call to $0.50 and 300 seconds, then rejects a result above 10 turns. That CLI cannot stop exactly at turn 10.
3. Detect runs inside the extract job as an init container. It writes a JSON symbol list to a shared volume. An empty list ends extraction successfully without a model call.
4. Extract reads stored bundles for changed tickers, checks cited quotes, posts ticker findings with `macro=skip`, and records token use in `extraction_runs`. The normal run is capped at 12 tickers and $0.50 per model call. Tuesday runs a full sweep instead. The Haiku versus Sonnet comparison remains open; Sonnet is the configured default.
5. Reconcile checks evidence and carries forward unscanned tickers. Daily scores the latest scan date. Digest follows daily.
6. Retention removes expired source documents and collected facts that are no longer cited.

All times use `Europe/Bratislava`. The jobs run Tuesday through Saturday unless noted.

| Time | Job | Latest finish |
|---|---|---|
| 05:00 | prices | 05:30 |
| 05:35 | collect | 06:10 |
| 06:05 | macro | 06:15 |
| 06:15 | extract (Wed–Sat, 40 min cap), weekly full sweep (Tue, 60 min cap) | 07:00 (Wed–Sat), 07:20 (Tue) |
| 07:30 | reconcile | 07:40 |
| 07:45 | daily | 08:45 |
| 08:50 | digest | 09:20 |
| 03:00 | retention | 03:10 |

Tuesday's full sweep replaces the bounded extract run, so both jobs never work on the same ticker set at once. At this hour the last completed US trading session is the previous weekday. Macro and extract use that date; reconcile picks the newest `scan_runs.as_of`, daily scores the latest scan date, and digest reads the latest ingest date. The Tuesday sweep is therefore reconciled and scored that morning.

## Sources

Verified on official pages on 2026-10-05 unless marked unverified.

| Source | Use | Limits and notes |
|---|---|---|
| SEC EDGAR submissions API `data.sec.gov/submissions/CIK##########.json` | Filing list per company | 10 requests per second max, descriptive `User-Agent` with contact required, free reuse. The existing code stays under 5 per second. |
| EDGAR filing archives `sec.gov/Archives/edgar/data/<CIK>/<accession>/` | 8-K Exhibit 99.1 (earnings release text), Form 4 XML | Same limits. The `items` field name in submissions JSON is unverified; check against a live response. |
| SEC companyfacts | Quarterly revenue (already used by reconcile) | Already implemented. |
| GlobeNewswire RSS `globenewswire.com/rssfeed` | Press releases | Feed exists. Per-organisation URL patterns and terms are unverified. |
| PR Newswire RSS | Press releases | Terms unverified. Treat as restricted. |
| Business Wire RSS | none | Not verified (403 on fetch). Do not use. |
| FRED API | Macro series | Free key required. Show the "uses the FRED API but not endorsed" notice. Rate limit not stated. |
| Treasury FiscalData | Rates | No auth, no stated limit. Yield-curve endpoint unverified. |
| BLS API v2 | Labour data | Free key, 500 queries per day. |
| Twelve Data free plan | Prices (already fed) | 8 credits per minute, 800 per day, **internal testing and evaluation only, not for display to users**. `earnings` needs Grow plan, `earnings_estimate` needs Ultra. Neither is on the free plan. |
| EPS consensus (estimate) | `epsBeat` | **No free verified source.** Actual EPS can come from the 8-K exhibit or XBRL. Until a source exists, `epsBeat` stays unknown unless an agent cites a page. |

Foreign private issuers (for example ASML, SE, MELI) file 20-F and 6-K, not 10-Q, 8-K or Form 4. The collector must store what exists and leave the unsupported facts unknown. It must not guess.

## Storage

Postgres, migration `007`. Names are a proposal; the implementer may adjust to existing conventions.

- `source_documents`: `id`, `source`, `symbol` (nullable), `doc_type`, `url` (unique), `published_at`, `fetched_at`, `content_hash`, `body` (text, capped), `meta` (jsonb), `expires_at` (default fetched_at + 30 days).
- `collected_facts`: `id`, `symbol`, `fact_key`, `as_of`, `value` (jsonb), `document_ids` (int[]), `computed_at`, `expires_at`. Examples: `insider_net_buy_90d`, `latest_earnings_8k_date`, `price_move_5d`.
- `collector_runs`: one row per run with counts, failures, stop reason (same idea as `price_ingest_runs`).
- Phase B adds `extraction_runs` (input hash, model, token usage, status) so a run can be repeated or skipped when the input did not change.

Indexes on `(symbol, published_at)` and `expires_at`. Bodies are capped (for example 200 KB per document) and stored as extracted text, not raw HTML.

## How the AI reads and writes

- Input: a bundle per ticker, built by script, containing document metadata and bounded excerpts plus the computed facts. No web tools are given to the model.
- Output: the existing ticker scan schema (`scanner/schema/ticker-output.schema.json`). Every positive claim cites a stored document URL, publication date, fiscal period and a copied quote.
- Apply: a script posts the output to the existing ingest route. A separate small script only checks that each quote occurs in the stored document text before posting.
- The judgement step writes its own structured output file, and a script stores it for the web. The AI never writes to the database or the web directly.

## IBKR

IBKR launched an MCP server on 2026-07-28 (`https://api.ibkr.com/v1/api/mcp-public`). Details are from IBKR's official pages (`interactivebrokers.com/en/trading/ai-integrations.php`, press release 7-28-26) unless marked unverified.

| Need | Covered | Notes |
|---|---|---|
| Portfolio baseline (positions, cash, P&L) | Yes | Replaces the manual screenshot baseline. Read-only. |
| Prices | Probably | `get_price_snapshot` and `get_price_history` are listed in third-party summaries only. Depends on market-data entitlements. Unverified. |
| Placing orders | No | The AI can only draft instructions. The user must turn them into orders in the IBKR platform. |
| Fundamentals, news, earnings calendar, scanners | Not verified | AI Screeners, Themes and news summaries exist as in-platform features. No evidence that the MCP exposes them. |
| Headless or cron use | Unknown | Login is an interactive OAuth flow for one account. Token lifetime and refresh are unverified. |

Use: an interactive session fetches the portfolio baseline into a small file or table that the judgement step reads. Do not build a cron job on it until headless auth is confirmed.

## Phases

- **A:** migration, collectors, detect, retention, tests, and job manifests.
- **B:** extractor, quote checks, change-based schedules, macro run, and carry-forward.
- **C:** judgement, trade ideas, and portfolio baseline. The judge CronJob and public-page decision remain open.
