# Script-first pipeline

Scripts collect and store source documents and numbers. AI reads stored text only, with no web tools, and writes structured output. A script applies that output through the existing scan ingest and reconcile path. Raw data is kept for the evidence window of its type, 30 to 100 days.

## Why

The daily Claude scan ran 36 agent sessions that each searched and fetched pages. The cost was in finding pages, not in reading them. Scripts find and fetch for free. AI only reads.

## Flow

1. **Collect** (`collect` job, no AI). Fetch documents and facts from free sources for the universe. Store them in `source_documents` and `collected_facts`.
2. **Detect** (`detect` job, no AI). List tickers that have new documents since their last extraction. Output is a JSON list for `--only`.
3. **Extract** (phase B, AI, no tools). For each detected ticker, build an input bundle from stored documents (excerpts, not whole filings). The model returns the existing ticker scan JSON, with every positive claim carrying a stored-document URL and a quote. Output goes through the existing `POST /api/ingest/scan`, so reconcile and scoring stay unchanged.
4. **Reconcile and score** (existing jobs). Quotes are checked against the stored document text.
5. **Judge** (phase C, AI, no tools). Reads reconciled facts plus the portfolio baseline and writes trade ideas as structured JSON. A script stores it and the web reads it.
6. **Retention** (`retention` job, no AI). Delete expired `source_documents` and `collected_facts`. A document expires after the evidence window of its type (100, 60 or 30 days) counted from its last fetch. Documents still cited by an unexpired finding, idea or extraction run are kept.

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

- **A (this change, no AI):** migration, collectors, detect, retention, tests, image and CronJob manifests (suspended), run on the cluster as a one-off job.
- **B:** extractor script and prompt with no tools, quote check, post to ingest, carry-forward of unscanned tickers in reconcile and daily.
- **C:** judgement step, web page for trade ideas, IBKR baseline.
