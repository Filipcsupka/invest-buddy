# Data and reconciliation

Set `DATABASE_URL` and run `npm run migrate`. Numbered SQL migrations run once under an advisory lock. Migration 003 seeds the instrument list; migration 004 adds consensus and reconciliation status. Set `DATA_MODE=db` for the scan pipeline. The runner posts to `/api/ingest/scan` with `INGEST_TOKEN` and never receives database credentials. Repeated run IDs are idempotent. A newer run supersedes only the same agent, symbol and date while retaining history.

A scan is a proposed finding. Claude and Codex runs are stored separately for each symbol and date. The reconcile job writes one consensus row per field. A disputed field has no score value, and a field supplied by one agent has none unless it passes the single-extractor rule below. The score audit contains each field's agreement, both available run IDs and cited URLs.

Sources on the company page. Daily stores `sources` in the audit: per field, the evidence refs of verified findings as `{kind, publishedAt, href}`. It looks the cited urls up in `source_documents` with one query per symbol. `href` is set only for a stored document with `meta.display_allowed` true or the public `data.sec.gov/api/xbrl/` url, and only for https. Alpha Vantage, FRED and Cboe VIX data, and pages with no stored copy, keep a kind and no href, so the page shows a text label. The page shows the source under each rule and input; technical rules name "Own price bars" and the macro rules name their data. A field without a source shows "No source yet". `sources` is part of the score fingerprint, so the first daily run after this change re-scores the date and fills it in; older audits show labels without links until then.

Agreement values (migration 012 widens the check constraint):

| Value | Meaning | Counts for scoring |
|---|---|---|
| `agree` | Two agents, same value, evidence passed | yes |
| `xbrl_override` | SEC data decided (revenue fields, Form 4 insider flag) | yes |
| `verified_single` | One extractor, quote found in stored source text | yes |
| `data_rule` | A rule on a collected fact decided (only `epsBeat` from Alpha Vantage today) | yes |
| `single`, `disputed` | Not confirmed | no, the field is unknown |

Single-extractor rule (policy change of 2026-10-06, owner review under C5). The script-first pipeline runs one extractor, so every AI field used to stay `single`. A finding from exactly one agent now counts as `verified_single`, verified, when all of these hold: the value is true, false or a catalyst object with `present` (null stays unknown); confidence is not `low`; the field is a fundamentals field and not `narrativeChanged` (macro fields are not covered); and at least one evidence item for that claim passes the stored-only check. That check needs the cited url to be a stored `source_documents` row with `display_allowed` true, `publishedAt` equal to the stored date, inside the field's freshness window, and the quote found in the stored text after the usual normalisation. There is no live fetch. A false value needs a verified quote too, unlike the two-agent rule. The check runs only with `RECONCILE_VERIFY=live`; `off` and `fixture` keep single findings unknown. With two agents the old rules apply unchanged, so a disagreement stays `disputed`. SEC revenue facts, the Form 4 insider flag and the EPS rule still override, and the agent values stay in `agent_values`. Note: the judge signals in `src/engine/signals.ts` still count only `agree` and `xbrl_override`.

A positive claim needs a cited HTTPS page with a publication date, fiscal period and copied sentence. The live verifier fetches that page and checks the sentence after case and whitespace normalization. It applies windows of 100 days for earnings and guidance, 90 days for catalysts, and 60 days for insider or institutional activity. `RECONCILE_VERIFY=off` skips fetching pages for local demonstrations; it still checks the evidence metadata and date. `fixture` checks the known sample quote without a network request. It does not establish that a claim is true.

SEC companyfacts can confirm or override only quarterly revenue acceleration and revenue decline. The parser chooses a reported quarterly duration of 70 to 105 days, groups by fiscal year and quarter, and compares each quarter with the same fiscal quarter one year earlier. It excludes year-to-date facts and ignores calendar frame labels. SEC frame labels group by calendar periods, which can differ from a company's fiscal quarters. Fiscal-year and fiscal-period labels describe the filing; comparative facts inside it may share those labels, so the parser first selects the latest quarter-end fact in each filing. It needs four comparable reported quarters: the latest quarter, the preceding fiscal quarter and each one's year-ago counterpart. A fourth-quarter standalone fact is often absent from Form 10-K. The conservative parser uses 10-Q quarterly facts, so a first-quarter result that needs fourth-quarter growth stays unknown. Restatements can change an earlier period; the latest filing available on the reconciliation date wins. Facts older than 100 days from their filing date are not used for a new reconciliation. EPS against analyst consensus is unavailable from companyfacts; see the Alpha Vantage source below. SEC requests use `SEC_USER_AGENT`, run below five per second and cache responses for a day. The fiscal-period handling follows the [SEC XBRL API description](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) and [SEC fiscal-period definitions](https://www.sec.gov/files/fsds.pdf).

For a local demonstration, run `docker compose up -d --build db migrate web`, then `npm run scan:sample`. The sample posts one Claude and one Codex finding for NVDA with an EPS disagreement. Seed synthetic price bars with `DATABASE_URL=postgresql://investbuddy:local-only@localhost:55432/investbuddy npm run seed:local-bars`. Then run `RECONCILE_VERIFY=fixture docker compose run --rm --build reconcile` and `docker compose run --rm --build daily`. Open `/en/company/NVDA`, `/en/dashboard` or `/api/health`. The fixture quote is illustrative and is not a verified current research report. Finish with `docker compose down` to stop the containers and keep the volume. The health route returns database status, the latest scan date, the latest reconciliation time and the latest score date. An empty reachable database returns null dates, so monitor freshness separately.

`DATA_MODE=fixture` serves the sample universe for local development. `npm run daily -- --memory` scores that universe in memory. Database mode needs at least 200 bars per symbol; it has no fixture price fallback.

This is informational screening under ADR-001. Scores are rule outputs for all visitors; they do not include position size or personal advice.

Daily scoring requires a price bar dated exactly to the scoring session. Missing or older bars produce `Insufficient/invalid data` with `stale_prices`; no points are awarded. Same-day scores are refreshed when consensus inputs or price bars change. Each distinct input set also writes one append-only row to `score_input_snapshots` (fundamentals, macro, consensus rows, rules version, hash of the last 260 closes). `npx tsx scripts/replay-score.ts TICKER YYYY-MM-DD` rebuilds the score from it and compares with `score_results`.

## Collectors

`npm run collect` stores SEC EDGAR filings and GlobeNewswire RSS items for the universe. EDGAR documents carry `display_allowed: true` (public SEC data). RSS documents carry `display_allowed: false`, because the news text is not licensed for display; they are internal signals and never reach the judge input or the ideas page. Set `SEC_USER_AGENT` and `DATABASE_URL`. Use `--only NVDA,AMD`, `--since YYYY-MM-DD`, or `--source edgar|rss|fred` to narrow a run. FRED stores the latest federal funds observation when `FRED_API_KEY` is set and reports a skip when it is absent. This product uses the FRED API but is not endorsed by the Federal Reserve Bank of St. Louis. `--dry-run` fetches and parses without writing; `--memory` runs without Postgres. `COLLECTOR_FIXTURE_DIR=src/collectors/fixtures npm run collect -- --dry-run --memory` uses local fixture responses without network access.

`npm run detect` prints a JSON symbol list with reasons for new documents or facts. It accepts `--since`, `--max N`, and `--force-all`. `npm run retention` handles expired facts and documents. Public SEC rows (`source = 'edgar'` or `licence_class = 'public_gov'`) are moved to `source_documents_archive` and `collected_facts_archive` (migration 024, same columns plus `archived_at`, original ids) in the same transaction instead of being deleted; all other expired rows, including internal-only news text, are deleted. A document expires after the longest evidence window it can support, taken from `freshnessDays` in `src/data/evidence.ts`: 100 days for 8-K, 10-Q, 10-K, 20-F, 6-K and EX-99.1, 60 for Form 4 and 13F, 30 for everything else. Each fetch restarts that window, also when the content did not change. Facts expire after 30 days and restart only when their value changes; `eps_surprise_latest` expires 100 days after its report date. Expired documents stay while an unexpired consensus finding, trade idea or extraction run still cites them. Use `--dry-run` to count rows without changing them; it prints `archivedDocuments`, `deletedDocuments`, `archivedFacts` and `deletedFacts`. The CronJob stays suspended in infra until this is merged and tested.

Foreign issuers. Checked against live SEC submissions on 2026-10-09. ASML files 20-F and 6-K only. SE files 20-F and 6-K and also Form 4. MELI, SHOP and CRSP are domestic filers (10-K, 10-Q, 8-K), so they use the normal path. The collector stores the 20-F and 6-K text as documents. Collection decides foreign status from the filings it fetched, not from a symbol list: a 20-F or 6-K with no 10-K, 10-Q or 8-K gives the fact `sec_filer_status` (dated by the newest foreign filing, kept 100 days). Its value lists the fields left unknown, each with a reason: `revenueAccelerating` and `revenueDeclining` (SEC quarterly revenue needs 10-Q), `earnings_8k` (no 8-K exhibit), and `insider_net_buy_90d` only when no Form 4 was collected. The bundle returns the fact, so the extractor sees the reason. Nothing is estimated from annual figures. Tests: `src/jobs/collect.test.ts` (ASML fixture, SE-like and domestic cases) and `src/db/bundle.test.ts`.

## Free sources without a key (phase A2)

`collect --source` accepts a comma list of: `frames`, `getcurrent`, `13f`, `openfda`, `clinicaltrials`, `usaspending`, `fed`, `treasury`, `bls`, `vix`, `gnews`, `gdelt`. They are not in the default run (`edgar`, `rss`). The SEC ones (`frames`, `getcurrent`, `13f`) need `SEC_USER_AGENT`. `13f` downloads a large zip to a temp file, streams it, deletes it afterwards, and is behind its own flag for that reason. It reads the zip link from the SEC data sets page and maps CUSIPs to tickers through OpenFIGI for universe names only (cache table `cusip_map`, migration 008).

What each stores:

| Source | Output |
|---|---|
| `frames` | Quarterly revenue from XBRL frames for all filers: YoY, QoQ and acceleration. A fact `revenue_growth_quarterly` per universe symbol, plus one document with the top 25 accelerating names outside the universe (symbol null, because `collected_facts.symbol` is required). |
| `getcurrent` | Schedule 13D, 13G and 8-K from the EDGAR current-filings feed, universe issuers only, plus fact `holder_5pct_events`. 13D/13G rows also go to `holder_events` (migration 047, unique on accession, kept without expiry); percent and shares come only from named fields in the filing and stay null otherwise. CronJob `invest-buddy-holder-events` (07:45 weekdays) is suspended. |
| `13f` | Fact `institutional_13f` (filer count, shares, value) per universe symbol for the latest data set period. |
| `openfda`, `clinicaltrials` | Approvals, recalls and trial updates for VRTX, CRSP and REGN, plus discovery documents. |
| `usaspending` | Contract awards for configured universe recipients. |
| `fed`, `treasury`, `bls`, `vix` | FOMC dates, H.15 yields, Treasury average rates, three BLS series (one query of the 25 per day), VIX history. |
| `gnews`, `gdelt` | Headline, link, outlet and time only. Stored with symbol null and the tickers in `meta.symbols`, so `detect` does not rescan a ticker for each headline. |

The list of sources and their licence class lives in `src/data/sources-registry.ts` and, after migration 022, in the `data_sources` table; `LICENSES` in `src/collectors/sources/common.ts` reads from it. Every document carries `meta.license_note` and `meta.display_allowed`. It is true only for SEC, FDA (CC0), USAspending, Treasury, Fed and BLS data. Everything else is false until terms are checked. The Google News feed text allows personal, non-commercial use only.

### Alpha Vantage EPS surprise

`collect --source alphavantage` calls the Alpha Vantage `EARNINGS` endpoint once per symbol (SQ is requested as XYZ). It needs `ALPHA_VANTAGE_API_KEY` and sends nothing without it. It is not in the default run; the suspended weekly CronJob `invest-buddy-collect-alphavantage` (Saturday 08:00 Europe/Bratislava) runs it.

The free key allows 25 requests a day. The source sends at most 20 per run and at most 20 per UTC day, counted from `collector_runs.api_requests` (migration 012). Each request is a single attempt with no retry, 12 seconds apart. Symbols without a stored fact go first, then the oldest report date. A limit answer (`Information` or `Note`) or HTTP 429 stops the run and lists the rest as not fetched. A `--dry-run` still records its request count, so it counts against the daily cap. The key appears only in the request url. Stored urls are the request without the key, and error messages are redacted. The ping uses the documented `demo` key for IBM, so it does not spend the real key's quota.

For the newest reported quarter it stores a document (doc type `EPS surprise`) and the fact `eps_surprise_latest` with `{reportedDate, fiscalDateEnding, reportedEps, estimatedEps, surprisePercent}`, keyed by the report date. Alpha Vantage display rights are unverified, so both carry `display_allowed: false`. The judge input drops the url, and the page shows only the derived "EPS beat yes/no" with the label "source: Alpha Vantage", never the estimate.

Reconcile reads the newest fact on or before the scoring date. `surprisePercent` above `EPS_BEAT_MIN_SURPRISE_PCT` (placeholder, default 0) gives `epsBeat` true, otherwise false, agreement `data_rule`, verified, with a reason that names the source and report date but no figures. It overrides a conflicting agent claim. A fact older than 100 days, a missing surprise or no fact leaves the decision to the agent rules above.

`npm run collect:ping` (or `node dist/jobs/collect.js --ping [--source name]`) sends one live request per source, checks that the response parses, prints a table and exits 1 if any ping fails. It writes nothing and needs no database. SEC pings and FRED print SKIP when `SEC_USER_AGENT` or `FRED_API_KEY` is unset. GDELT answers slowly (11 to 19 seconds on 2026-10-05) and returns 429 for requests about 8 seconds apart, so its ping can fail the 10 second limit. BLS pings use one of the 25 daily queries.

### Alpha Vantage earnings calendar (D27)

`node dist/jobs/earnings-calendar.js` (`npm run earnings-calendar`) makes one `EARNINGS_CALENDAR` request with `horizon=12month`. It is reserved in the usage ledger first, so it counts against the 25 a day of the free key. The whole CSV goes to the raw store (key `earnings_calendar:12month`). Rows for universe tickers (SQ is XYZ at Alpha Vantage) go to `earnings_calendar_snapshots` (migration 046): one row per day, ticker and report date, never updated or deleted. A rerun on the same UTC day sends no request unless `--force`; a moved report date shows up as a new row on the next day. `--dry-run` fetches and counts without writing. No key or a reached cap prints `skip` and exits 0. The estimate column may be empty for some names; that is not checked yet. Licence class `internal_only` (the `alphavantage` source row). The CronJob `invest-buddy-earnings-calendar` (06:45 Europe/Bratislava) is suspended.

## Extraction (phase B)

Extraction turns stored documents into the existing ticker scan JSON with one AI call per ticker. The model reads only what the collectors stored. It cannot search or fetch. With `claude` the call runs with `--tools ""` and one turn. `codex` runs in a read-only sandbox in an empty temp directory, so it has no web but is not a tool-free call.

Bundle. `GET /api/ingest/bundle/<SYMBOL>?asOf=YYYY-MM-DD` (bearer `INGEST_TOKEN`) returns the stored documents and facts for one universe symbol. Only documents published on or before `asOf` are included, each inside the freshness window of its type: 100 days for 8-K, 10-Q, 10-K, 20-F, 6-K, EX-99.1 and `XBRL revenue growth` (earnings, guidance and revenue fields), 60 for Form 4, 30 for everything else. The windows come from `freshnessDays` in `src/data/evidence.ts`, the same ones reconcile uses. `?days=1..365` (default 100) only narrows or widens the database scan. Order is EX-99.1 first, then 10-Q, 10-K, 20-F and 6-K, then 8-K, then Form 4, then the rest newest first, with the document id as tiebreaker so the order is the same on every request. Each excerpt is cut to 6000 characters by keeping keyword windows (8-K item headings keep the 1200 characters after them; the "emerging growth company" cover text is skipped), and a bundle holds at most 24 documents and 60000 characters. Each document carries `displayAllowed`: `meta.display_allowed` when present, otherwise true for `edgar` and false for everything else.

Run. `scanner/run-extract.mjs` fills `scanner/prompts/ticker-extract.md` with the bundle, calls `claude -p` (or `codex exec`), parses one JSON object and validates it with `scanner/validate.mjs`. It tries twice. The prompt tells the model that the bundle is untrusted data. The default model is `haiku` for claude. A response with more than one turn or a permission denial is rejected as tool use.

Quote check. `scanner/quotes.mjs` checks every evidence item against the bundle. The url must be a bundle document with `displayAllowed` true, `fiscalPeriod` must not be empty, `publishedAt` must equal the document's own date, the quote must occur in that document's excerpt after case and whitespace normalisation, and the document must be inside the claim's freshness window. A positive claim without a verified item is set to null and listed under `_droppedClaims` in the payload file.

Apply. The runner posts the payload to `POST /api/ingest/scan?macro=skip` with the agent name as `runner.name`. Reconcile and scoring are unchanged. `macro=skip` leaves `macro_findings` alone: an extraction run has no macro result and would otherwise replace the macro finding that the daily scan stored for the same date and agent. There is no `extract-macro` prompt yet, so the macro block of the payload is all null and is not stored. The runner has no database credentials.

```
node scanner/run-extract.mjs --only NVDA,AMD --agent claude --model haiku
node scanner/run-extract.mjs --symbols-file detect.json --dry-run     # writes the payload file, posts nothing, records nothing
node scanner/run-extract.mjs --only NVDA --bundle-dir DIR --dry-run   # offline: DIR/NVDA.json, no web, no token
node scanner/run-extract.mjs --only NVDA --force                      # ignore the skip for an unchanged input
```

`INGEST_BASE_URL` sets the web address. `INGEST_TOKEN` is read from the environment, or from the macOS keychain item that `run-scan.mjs` uses. Payload files go to `scanner/out/`.

CronJob. The scanner image ships `run-extract.mjs`, `quotes.mjs` and `extraction-log.mjs` next to `run-scan.mjs`. Its entrypoint is still `run-scan.mjs`, so an extraction CronJob sets `command: ["node", "/app/scanner/run-extract.mjs"]` and passes the flags in `args`, for example `["--symbols-file", "/work/detect.json"]`. The `invest-buddy-extract` CronJob (suspended, 06:25 Tuesday to Saturday) passes only `--agent claude`: detect runs in another pod and cannot hand over a file, so it extracts every universe symbol and the input-hash check skips the ones that did not change. It needs `INGEST_BASE_URL`, `INGEST_TOKEN` and the same agent auth as the scan job.

Run records. Migration 009 adds `extraction_runs`: symbol, as_of, agent, model, input_hash, status (`pending`, `ok`, `failed`, `skipped`), cache read and cache creation tokens, input and output tokens, turns, the model output, an error, `applied_at`, and `expires_at` (30 days). One row per symbol, date, agent and input hash. `scanner/extraction-log.mjs` builds the hash from the document ids, urls, `displayAllowed` flags, excerpts and facts (not `generatedAt`), plus the prompt, agent and requested model, and maps the `usage` and `num_turns` fields of the Claude JSON envelope to the token columns. `GET /api/ingest/extraction-runs?symbol=&agent=&inputHash=` answers `{skip: true}` when an unexpired `ok` row with `applied_at` set exists for that symbol, agent and input hash. The date is not part of the skip key. `POST` on the same path stores one attempt and never overwrites an `ok` row with a failed one.

`run-extract.mjs` checks the skip before the model call, records `failed` rows with the tokens spent, and records `ok` only after the scan POST succeeded, so a result that was never stored is not skipped on the next run. A dry run records nothing. At the end it logs the totals: model calls, input characters, input, output, cache read and cache creation tokens, turns, and cost when the CLI reports it. The retention job deletes expired `extraction_runs` rows.

Insider flag. Reconcile sets `insiderOrInstitutionalBuying` from the stored `insider_net_buy_90d` fact when its `as_of` is within 30 days: true when net dollars exceed `INSIDER_MIN_NET_BUY_USD` (placeholder, default 100000) and a stored display-allowed Form 4 purchase filing from the last 60 days can be cited; false for net selling, no buying or buying below the threshold; no fact or unpriced trades leave the agent consensus. The Form 4 data overrides a conflicting agent claim (agreement `xbrl_override`, reason says so) and the cited urls are the stored Form 4 documents. Open: the routine-trader exclusion needs insider identity and more than 91 days of history.

Evidence check. With `RECONCILE_VERIFY=live` (the default), reconcile checks a citation against the stored `source_documents` text when the url is stored: same normalisation as `src/data/evidence.ts`, `publishedAt` equal to the stored date, same freshness window. Only a url that is not stored is fetched live. `off` and `fixture` behave as before.

## Macro rules (placeholder, no AI)

Two score fields, `dataTailwind` and `sectorRotationIntoGrowth` (macro score 0 to 5), had no source in the script-first pipeline: the agent macro scan is gone, so every ticker showed them as one source, unverified. `src/jobs/macro.ts` now computes both from stored data with the rules in `src/data/macro-rules.ts`. The thresholds are placeholders for owner review, not a tested strategy. Each can be changed by environment variable without a code change.

| Field | True | False | Unknown (null) |
| --- | --- | --- | --- |
| `dataTailwind` | 10-year yield (FRED `DGS10`) change over the last 20 observations is at or below +0.25 pp (`MACRO_YIELD_MAX_CHANGE_PP`); CPI (`CPIAUCSL`) and PPI (`PPIACO`) YoY rates are each no higher than three months earlier; VIX close is below 25 (`MACRO_VIX_MAX`) | any available test fails | yield or VIX missing, older than 5 calendar days (`MACRO_MAX_AGE_DAYS`), or fewer than 21 yield observations; missing or stale inflation alone falls back to yield and VIX |
| `sectorRotationIntoGrowth` | average 20-session return of the universe tickers (stored `daily_bars`) minus the SPY return over the same sessions is above 2 pp (`MACRO_ROTATION_MARGIN_PP`) | not above | SPY bars missing, too short or stale, or fewer than 80% of tickers (`MACRO_MIN_COVERAGE`) have a bar on SPY's last session |

The window is 20 sessions (`MACRO_WINDOW_SESSIONS`, 5 to 60). A bad setting stops the job. Missing yield or VIX makes the flag unknown, even when the other input alone would make it false.

The inflation comparison uses each series' latest monthly observation, its value 12 months earlier, and the same pair three months earlier. Both series must be present for the inflation test; if either lacks the four required months or its latest observation is older than 75 calendar days (`MACRO_INFLATION_MAX_AGE_DAYS`; FRED dates a monthly value to the first day of the month and the release comes about six weeks later), the reason names the fallback to rates and VIX. `PPIACO` is the broad commodity PPI series; this rule does not use final-demand `PPIFIS`. FOMC is not implemented. These are `macro-rules-v2` defaults for owner review, not backtested thresholds.

Job. `node dist/jobs/macro.js [--date YYYY-MM-DD] [--no-fetch]` (`npm run macro`). The default date is the last completed weekday session in New York, like extract. It refreshes 80 `DGS10` observations, 24 each for `CPIAUCSL` and `PPIACO`, and the Cboe VIX close. These FRED and Cboe documents have `display_allowed: false`, so the page gets a derived flag without redistributing the series. A missing `FRED_API_KEY` or a failed fetch is reported; stored series may still be used if fresh. Then it writes, in one transaction:

- one `macro_findings` row with `runnerName: data_rule`, the thresholds used and the reason text. Its run id is derived from the date, so a rerun replaces the row.
- for each ticker and both fields, a `consensus_findings` row with agreement `data_rule` (migration 012 adds the value), verified true for a known value, value null and unverified for unknown. The reason names the inputs and their dates. The evidence refs cite the stored DGS10 and Cboe documents, plus CPI and PPI when both monthly series are usable. `sectorRotationIntoGrowth` rests on our own price bars and cites no document.

`DatabaseUniverseProvider.macro()` accepts `agree` and `data_rule` for these two fields. Reconcile skips any field that already has a `data_rule` row for the date, so agents cannot overwrite it, and carry-forward does not replace it. The CronJob `invest-buddy-macro` (suspended, 06:50 Tuesday to Saturday, 240 s deadline) runs before reconcile at 07:00. The judge's `confirmed()` in `src/engine/signals.ts` still counts only `agree` and `xbrl_override`; the macro fields are not among the key fields it reads.

### Macro observations (D24, migration 049)

Table `macro_observations` (series_id, obs_date, value, realtime_start, source_id, source_url, observed_at; primary key series, date, realtime_start; `source_id` references `data_sources`). `realtime_start` is the vintage: FRED's own value when the response has one, else the fetch date; Treasury rows use the observation date. A row is written only when the value differs from the newest stored vintage of that observation, so a daily rerun adds nothing and a revision adds a second row. Rows are kept without expiry. FRED rows are `fred` (display false, internal signal only); Treasury rows are `treasury`.

Series (`src/data/macro-series.ts`): FRED `DGS2`, `DGS10`, `DGS3MO`, `T10Y2Y`, `FEDFUNDS` (monthly), `CPIAUCSL` and `PPIACO` (monthly; the two inflation inputs of the macro rule), and from the Treasury daily par yield curve (CSV from home.treasury.gov, a cross-check, not FiscalData) `TSY_3M`, `TSY_2Y`, `TSY_10Y`. A FRED series is added only after `FRED_API_KEY=... npx tsx scripts/fred-check-notes.ts` shows no "Copyright" in its notes; a rejected id goes into `FRED_REJECTED_SERIES` and is never fetched. The script has not been run against the live notes yet: run it before the first backfill. VIX is not stored here: the Cboe source is `internal_only` and its use needs a licence (D42). D25 adds the `RV20_SPY` series later.

The daily macro job also stores the last 80 (daily) or 24 (monthly) FRED observations per series and this year's Treasury curve. `loadInputs` reads `DGS10`, `CPIAUCSL` and `PPIACO` from the table (newest vintage per date, dates up to the scoring date) when it holds at least as many points as the stored FRED document, and falls back to the document otherwise. The document is still written, it is the evidence link. Rule logic and thresholds are unchanged.

Backfill (D34 runner, history from 2023-10-01, one request per series and calendar year, cursor = next year):

- `node dist/jobs/backfill.js --job macro-fred --dry-run` lists the series and their cursors, stores nothing. Needs `FRED_API_KEY` in the environment.
- `node dist/jobs/backfill.js --job macro-fred [--only DGS10] [--max-requests N]`
- `node dist/jobs/backfill.js --job macro-treasury` (4 requests to 2026)

Usage is reserved in the D8 ledger against `fred` and `treasury`. Running the backfill and applying migration 049 need the owner's approval.

## Carry-forward

`CARRY_FORWARD=on` lets a partial scan score the whole universe. It is off by default; with the flag off, reconcile and daily run the same SQL and write the same rows as before migration 009. With it on:

- Reconcile copies the latest consensus row of each field for a symbol that has no findings on the date. The copy gets `carried_from`, the date of the scan the value came from, and a reason that starts with "Carried from". A symbol with findings on the date is reconciled as usual and its rows clear any carried tag.
- A field is carried while it is inside the same window the evidence check uses: 100 days for revenue, EPS and guidance fields, 60 for insider or institutional activity, 90 for catalyst, 30 for narrative and the two macro fields. A true claim counts from its newest cited publication date, never later than the scan date. Other values count from the scan date. Copying a carried row again does not extend the window.
- After the window the field becomes null, agreement `single`, not verified, with no evidence urls, and the reason says it expired.
- Daily applies the same rule when it reads consensus, so it does not depend on reconcile having run with the flag. It adds `carriedFrom` and `expiredFields` to the score audit. The company page shows "carried from <date>" or "expired, unknown" next to the field. Both tags are part of the score fingerprint, so a field that expires re-scores the date.

## Price ingest

`node dist/jobs/prices.js` (or `npm run prices`) loads 260 daily bars for the 35 universe symbols and the SPY benchmark from Twelve Data and upserts them into `daily_bars`. SPY is stored as an instrument with source `benchmark`; it has no scan findings, so it never appears in the universe. Set `TWELVE_DATA_API_KEY` and `DATABASE_URL`. The key is sent in an `Authorization: apikey` header, never in the URL, and the job exits with a clear message when it is missing. Flags: `--only NVDA,SPY`, `--memory` (no database) and `--dry-run` (fetch and validate, store nothing).

Usage ledger (migration 025, `src/data/usage.ts`). Every Twelve Data request and every Alpha Vantage request is reserved in `api_usage` before it is sent. The daily cap and `monthly_cost_cap_eur` come from `data_sources`; the cost cap defaults to 0, so a call with an estimated cost above 0 is refused. Past a cap, `reserve` throws `CapReached` and writes nothing. Of the 800 Twelve Data requests a day, 100 are kept for the prices job; other jobs (discovery) stop at 700 and log `quota_skip`. `credits` is stored per request and marked `unverified` until the per-endpoint multiplier is read from the vendor docs.

The adapter drops a bar dated today until the US session has closed (16:00 New York plus a five minute margin), rejects non-finite or non-positive prices, `high < low` and duplicate dates, and sends at most 7 requests per minute to stay under the Basic plan limit of 8 per minute and 800 per day. It retries 429 and 5xx with backoff, and stops at the first daily-limit error and marks the untouched tickers as failed. Block's current ticker is `XYZ`, so `SQ` is requested as `XYZ` and stored as `SQ`; this mapping is not yet checked against the live API. Symbols the vendor rejects are printed as unmapped.

A ticker is skipped when the fetch has fewer bars than the database already holds for the same date range, so a partial response never shrinks history. Re-running is idempotent: unchanged bars are not rewritten. Each run adds a row to `price_ingest_runs` (migration 006) with requested, succeeded and failed counts, bars written, the failures and any stop reason. The existing `ingest_runs` table keeps one row per scoring date and feeds the digest date, so price runs use their own table. The job exits 1 when more than 10% of tickers fail.

The free tier is for the private beta only. A data licence is required before a paid launch (ADR-002).

## Accumulation score

The +1 fundamentals rule is met when insider buying is confirmed or up-day volume divided by down-day volume over the last 50 sessions is at least 1.25. An up or down day compares its close with the previous session's close; unchanged closes are excluded. The 1.25 ratio is a default for owner review. Price and volume accumulation is unknown with fewer than 51 bars.

## Judge (phase C)

The judge turns reconciled facts into a short list of trade ideas. Code decides the action, the size tier and the three ratings from data alone. One AI call writes the wording. A script validates and stores the result, and the web shows it. The AI never writes to the database or the web.

Deterministic part. `src/engine/signals.ts` computes, for each symbol, the action (WATCH, START_POSITION, ADD, HIGH_CONVICTION_ADD, HOLD, REDUCE, THESIS_BROKEN), a size tier and the ratings Company, Entry and Catalyst (Very strong, Strong, Good, Neutral, Weak). The action comes from the rule score, the three ratings and confirmed evidence only. The owner's portfolio never decides a buy action or a tier, so the same symbol gives the same buy signal with or without a baseline (decision of 2026-10-06, tasks G1 and G2). All thresholds sit in one object, `SIGNAL_RULES`, with a version string (`ruleConfigVersion`, stored with every run and idea; `2026-10-10.1` since the EN3 wording correction). The rules, in order:

- A rejection (confirmed revenue decline, confirmed guidance cut, or the score engine's "Criteria broken") gives THESIS_BROKEN for a held name and WATCH for any other.
- A held name with a Weak company rating in a downtrend gives REDUCE. A name that is not held ends as WATCH.
- Fewer than two confirmed key fields gives WATCH, marked unconfirmed. A field counts only when two agents agreed or SEC data confirmed it, the quote was verified and it has not expired.
- ADD needs a rule score of 15 or more, company and entry at least Good, and no downtrend. A lower score gives HOLD for a held name or WATCH otherwise.
- HIGH_CONVICTION_ADD needs score 18 or more, company, entry and catalyst at least Strong, a fresh confirmed EPS beat or guidance raise, and no carried field. ADD needs entry at least Strong or a pullback. START_POSITION needs score 18 or more when neither add rule applies. A score of 15 to 17 without an add setup gives HOLD for a held name or WATCH otherwise.

"Held" is optional context from the private baseline. It only relabels an outcome that puts no new money in (HOLD, REDUCE or THESIS_BROKEN instead of WATCH); a held name and a name that is not held get the same buy action and tier.

Size tiers (`size_tier`), a share of a full position in the reader's own portfolio and never a money amount (`docs/sizing-guide.md`):

| Action | Tier | Meaning |
|---|---|---|
| START_POSITION | STARTER, STANDARD or FULL | about 1/3, about 2/3, or a full position. FULL: score 18+, company Very strong, catalyst Strong and fresh execution. STANDARD: score 18+ and company Strong. Else STARTER. Unconfirmed or carried data keeps it at STARTER. |
| ADD | ADD_THIRD | add about 1/3 of a full position |
| HIGH_CONVICTION_ADD | ADD_HALF | add about 1/2 of a full position |
| WATCH, HOLD, REDUCE, THESIS_BROKEN | NONE | no new money |

The tier thresholds are placeholders for the owner to review (C5, F6). The web guide that turns a tier into a percent of a reader's account is task G3.

Owner amounts. `amountMinEur`/`amountMaxEur` (`amount_min_eur`/`amount_max_eur`) stay for the owner's private view only. With a baseline, each buy tier maps to a share of available cash (STARTER 5 to 10 percent, STANDARD 10 to 20, FULL 15 to 30, ADD_THIRD 8 to 15, ADD_HALF 15 to 30), capped so one name stays under 25 percent of invested capital and all buys together under 60 percent of cash; a band under EUR 20 becomes EUR 0. REDUCE gets 25 to 50 percent of the held value. Without a baseline every band is 0. The caps and the minimum never change the action or the tier. Their notes go to `ownerNotes`, which the model does not see.

CSPX_ALLOCATION is no longer produced. It depended on the owner's idle cash, so it belongs to the private owner view (G4), not to a signal that must fit every reader. The value stays in the action enum and the database check so older ideas still load.

Profit and loss on a position is never an input, so a price below cost cannot cause an add, and equal weighting is not a goal. Company comes from confirmed fundamentals, Entry from the chart numbers, Catalyst from confirmed catalyst and earnings facts. Carried data caps Company at Good and counts less for Catalyst. `src/engine/signals.test.ts` runs every case twice, shuffles the symbol order and checks the output is identical.

Chart numbers. `src/data/technicals.ts` computes them from the stored daily bars (and SPY when stored): last close, 1, 5, 20 and 60 day returns, distance from the 20, 50 and 200 day averages, 20-day high, 52-week high, low and range position, RSI(14), average volume and volume ratio, ATR percent, relative strength against SPY over 20 and 60 days, and a regime label (uptrend, pullback, deep pullback, range, downtrend). Everything is rounded to two decimals. Only these derived numbers go to the judge and the page. The Twelve Data free plan is for internal use, so the raw price series is never published and not sent to the model.

Input. `GET /api/ingest/judge-input?asOf=YYYY-MM-DD&maxSymbols=12` (bearer `INGEST_TOKEN`) returns the portfolio baseline, the candidate symbols (held names, names with an earlier idea, names in the Setup or Watch state, capped by `maxSymbols`), their reconciled fields with `carriedFrom` and expired flags, evidence links (up to 8 per symbol, newest first, deduplicated: refs of every verified finding that are display-allowed stored documents or public SEC XBRL facts, plus the latest earnings exhibit and 10-Q, labelled Earnings release, 10-Q, Form 4 or SEC XBRL; Alpha Vantage, FRED and VIX urls never appear), chart numbers, the computed signals with a signature, and the last stored idea per symbol. The signature is `action|company|entry|catalyst|tier`, so a change in the owner's baseline alone never makes an idea new. Ideas stored before migration 011 have a `min-max` signature and count as changed once.

Run. `scanner/run-judge.mjs` (`npm run judge`) keeps only the signals whose signature differs from the last stored idea, and a new symbol with any action other than HOLD. With nothing changed it makes no model call. A missing baseline no longer stops the run: the signals are the same, and the owner bands stay 0. The model sees only those symbols, with the action, the tier in words, the ratings, the reasons and the facts. It does not see the baseline, the EUR band or whether a name is held, because the public wording must fit every reader. It gets one `claude -p` call with `--tools ""` and the model from `--model` or `JUDGE_MODEL` (default `sonnet`). The call runs on the subscription CLI login or `CLAUDE_CODE_OAUTH_TOKEN`, the same as the extractor. No API key is used. It shares the 5-hour pool with interactive work, and it is expected to be small: one call a day, about 10 to 20 thousand characters of input.

```
node scanner/run-judge.mjs --as-of 2026-10-05                  # one call, stores new ideas
node scanner/run-judge.mjs --dry-run --input-file input.json   # offline: writes scanner/out/judge-payload-*.json, posts nothing
node scanner/run-judge.mjs --force --max-symbols 8
node scanner/run-judge.mjs --agent-mode --max-turns 8          # optional: the model may read the input files
```

What the model writes: verdict, What happened (2 to 3 bullets), Why it matters (1 to 2), Numbers (3 to 5), plan wording (trigger, invalidation, opportunity cost against CSPX and cash), 0 to 4 evidence links and the UNCONFIRMED mark. The action, tier, band and ratings are fixed inputs, and the JSON schema (`scanner/schema/judge-output.schema.json`) has no field for them. The only powers the model has: downgrade a buy to WATCH (tier NONE, EUR 0), or add a conflict note. Each needs a reason and an evidence url from the input. The script applies a downgrade and never an upgrade. It never lets the model clear the unconfirmed mark that the rules set. The script also rejects the output, and retries once, when:

- the JSON does not match the schema, an idea names a symbol that was not sent, or a symbol has no idea,
- an evidence or downgrade url is not in the input, or a buy has fewer than two links,
- the wording contains a figure that is not in the input. Small counts and fixed rule windows (0 to 10, 14, 20, 25, 30, 50, 52, 60, 90, 100, 200, 252) are allowed. Anything else, such as a computed cash balance, is an invented figure.

`--agent-mode` writes `facts.json`, `technicals.json`, `ideas-history.json` and `signals.json` to a temp directory and lets the model use `Read`, `Grep` and `Glob` on it. There is no web, shell or edit tool, and `Bash`, `Edit`, `Write`, `WebFetch` and `WebSearch` are denied. The CLI has no turn flag, so the script rejects a run above `--max-turns`. The dollar cap applies in both modes.

Cost control. One run per day: the script asks `GET /api/ingest/ideas?asOf=&agent=` and skips when an applied ok run exists for the date, unless `--force`. It also skips when the same input hash was already stored. The hash covers the input without `generatedAt` and without the previous ideas, the rule version, the prompt, the schema, the model and the mode. The retry gets only the budget that is left, and no retry starts below $0.01. A rate limit stops the run without retry. Token use, turns and cost go into the `judge_runs` row (`input_tokens`, `output_tokens`, cache columns, `turns`, `cost_usd`) and the end-of-run log line.

Reproducibility. The subscription CLI has no temperature setting, so the wording of a rerun can differ. The decisions cannot: the same input gives the same action, tier and ratings, and the same input hash reuses the stored result without a model call. Notifications, when they exist, should key on the signature, not on the wording.

Storage. Migration 010 adds `judge_runs` (one row per run: date, agent, model, input hash, status, tokens, turns, cost, rule version, model output, `applied_at`, expires after 30 days), `trade_ideas` (one row per stored idea, unique on date, symbol and input hash, expires after 90 days) and `portfolio_baseline`. Migration 011 adds `trade_ideas.size_tier` (nullable for older rows, checked against the tier list) and defaults the EUR columns to 0. `POST /api/ingest/ideas` rejects a tier that does not fit the action. `judge_runs` is separate from `extraction_runs` because that table is keyed by symbol with a foreign key to `instruments`, and one judge call covers the whole universe. `POST /api/ingest/ideas` records the run and inserts the ideas in one transaction and never overwrites an ok run with a failed one. The retention job purges expired judge runs and trade ideas.

Portfolio baseline. A small JSON shape that a person fills by hand today and an IBKR session can fill later:

```
{ "asOf": "2026-10-05", "source": "manual", "currency": "EUR", "cashEur": 600, "monthlyContributionEur": 200,
  "positions": [ { "symbol": "NVDA", "quantity": 4, "valueEur": 540, "costEur": 480 } ] }
```

`POST /api/ingest/portfolio-baseline` (bearer token) stores it for its date and `GET` returns the newest one on or before a date. `source` is `manual`, `ibkr-mcp` or `flex` (migration 012). The suspended portfolio CronJob writes `flex` rows from the Flex report: positions are `position`, `positionValue` and `costBasisPrice` times quantity, converted to EUR with the latest `ConversionRate` per currency (a position with no rate or a symbol outside `A-Z0-9.` is skipped and only counted in the log), and cash is the sum of the converted `CashReportCurrency` rows, or the `BASE_SUMMARY` row when a currency has no rate. `monthlyContributionEur` is carried over from the stored row for that date or null. The public snapshot from the same report keeps weights only (empty `series` in the live shape) and never amounts or the account id. The chart comes from the NAV history below. The IBKR MCP server is read-only and uses an interactive OAuth login for one account. The tool names `get_account_positions` and `get_account_balances` are unverified, and nothing here calls them. Do not run a cron job on it until headless auth is confirmed. The sample baseline in `src/ideas/fixtures.ts` is synthetic and exists only for tests and the fixture-mode page. It is not production data. The baseline is personal data: it stays behind the ingest token, only derived euro bands reach the private view, the model never sees it, and nothing reads `costEur`.

Web. `/en/ideas` and `/sk/ideas` list ideas newest first in the alert layout (headline `TICKER - ACTION - EUR min-max` in the private view, `TICKER - ACTION - tier` in the public card, verdict, What happened, Why it matters, Setup, Numbers, Plan, Evidence), with an UNCONFIRMED badge, a "carried data" badge, a conflict note and a downgrade note. Every card shows the size tier in words. Ideas also carry the owner's euro band, which ADR-001 keeps out of the public product: the public card on the company page strips the band and every sentence naming EUR. The ideas page renders the private view, so it and its nav link are hidden (404) unless `IDEAS_PAGE=on`, or `DATA_MODE=fixture`. Nav links on statically generated pages (methodology, legal) are fixed at build time, so set `IDEAS_PAGE` at build time too if the link should appear there. The idea text is English in both locales; only the labels are translated.

CronJob. The scanner image ships `run-judge.mjs`. Use `command: ["node", "/app/scanner/run-judge.mjs"]` with `INGEST_BASE_URL`, `INGEST_TOKEN` and the same agent auth as the scan job. The `invest-buddy-judge` CronJob (suspended, 07:45 Tuesday to Saturday) does this, after reconcile (07:00) and daily (07:15).

### Portfolio NAV history and chart

Storage. Migration 015 adds `portfolio_nav_history` (`date` primary key, `nav_eur`, `deposits_eur` default 0, `source` `flex-daily` or `flex-summary`). It is private: nothing exposes raw rows, and the page only receives indexed series computed in `src/data/store.ts` (`portfolioIndexedSeries`).

Import. Every portfolio job run reads all `ChangeInNAV` rows of the statement and upserts them by date (`src/portfolio/history.ts`, `src/db/portfolio-history.ts`). A report with "Breakout by Day" on has one row per day (`reportDate`, or `fromDate` equal to `toDate`, with `startingValue`, `endingValue` and `depositsWithdrawals` or `deposits`); a 365-day report therefore backfills the whole history and later runs only add new days. A report with only a start and end value (the current query, "Breakout by Day" is No) stores just those two dates as `flex-summary`: the starting value at `fromDate` and the ending value with the period deposits at `toDate`. A `flex-summary` row never overwrites a `flex-daily` row. Rows in a currency other than EUR and rows without a usable date or value are skipped (EUR base only).

Formula. Between consecutive stored dates, `r_t = (nav_t - nav_{t-1} - deposits_t) / nav_{t-1}`, which is `(end_t - start_t - deposits_t) / start_t` when `start_t` equals the previous end. The index is the chained product of `1 + r_t`, set to 100 at the first stored date. The time-weighted return since start is the last index minus 100. Over a gap (for example a start and end report) the same formula spans the gap as one period, so a deposit inside it is assumed to arrive at the end of the period.

Benchmark. In `DATA_MODE=db` the SPY line comes from `daily_bars` (ticker `SPY`): the last close on or before each history date, indexed to 100 at the first date. If no bar exists on or before the first date the benchmark line is left out. The fixture series is used only in `DATA_MODE=fixture`, where the page keeps the SAMPLE DATA badge.

Page. Title "Since <first date>". With fewer than 5 history points the page shows "History builds from <date>; the broker report currently provides only <n> points" instead of a line. The page shows indexed values and percentages only, never EUR amounts or the account id.

The `AI_DAILY_TOKEN_CEILING` setting is currently enforced by extract only. Judge receives the setting in its CronJob but does not check it yet. Calls with missing token usage count against the daily ledger using `AI_UNKNOWN_USAGE_TOKENS` (default 20000).

Golden fixtures: `npx tsx scripts/export-golden.ts YYYY-MM-DD [--from-json judge-input.json]` (read-only) writes `src/engine/fixtures/golden-<date>.json`; `src/engine/golden.test.ts` fails with a per ticker diff when a rule changes.

Security master (migration 026). Table `instrument_ids` holds one current row per ticker (`valid_to` null) and keeps older rows as history. It has CIK, SIC, fiscal year end, state of incorporation, exchange, `instrument_type` (`etf` for SPY) and `vendor_symbols` (for SQ: Twelve Data XYZ, SEC XYZ). The migration seeds the 36 names and SPY with no ids except SQ's vendor symbols. `npm run master:refresh [-- --dry-run]` fills CIK and the SEC fields from `company_tickers.json` and submissions (needs `SEC_USER_AGENT`), logs each change, and a second run changes nothing. `loadVendorSymbols` and `loadStoredCiks` in `src/data/security-master.ts` feed the prices, collect and watch jobs; they fall back to `DEFAULT_SYMBOL_MAP` when the table is missing or a row has no symbol. CronJob `invest-buddy-master-refresh` (Sunday 05:00, runs `dist/jobs/master-refresh.js`) is suspended until the owner enables it; until the first refresh runs, CIKs are empty and `/insiders` lists rows without the SEC link.

SEC companyfacts (migration 034). `npm run companyfacts -- --dry-run` fetches the 36-name universe, prints bytes and parsed fact counts per ticker, and writes nothing. `npm run companyfacts` stores the raw JSON and the allowed concepts in `fundamentals_pit`; `--only NVDA,AMD` narrows a run and `--watch-since YYYY-MM-DD` selects names with a 10-Q or 10-K since that date. The scheduled watch job also refreshes a name when its latest 10-Q or 10-K appears in companyfacts. A failed refresh or a filing not yet reflected in companyfacts is retried on the next watch run. The initial resumable pass uses `node dist/jobs/backfill.js --job companyfacts --max-requests 36`. All live modes need `DATABASE_URL` and `SEC_USER_AGENT`. The weekly CronJob is planned in D40; no new schedule is installed by this change.

## News headline sources (D31, decided 2026-10-10)

Probe from the owner Mac on 2026-10-10 (HTTP status, time):

| Source | Result | Decision |
|---|---|---|
| GlobeNewswire `/rssfeed` | 403 with a browser and with a declared User-Agent; 15 s timeouts from the cluster (`docs/tasks-open.md` A4) | Keep as the second feed, never required. |
| PR Newswire `/rss/news-releases-list.rss` | 200, 0.3 s, global feed with about 20 recent items | Now the first feed. Low yield for a 35-name universe; count matches in the next collect logs before relying on it. |
| GDELT DOC 2.0 | 429 after 12 s from this network; the about page grants free commercial use, redistribution with citation and link (read 2026-10-10) | Keep internal, metadata only. Display stays off: the grant covers GDELT's data, not the outlets' headline text. Attribution text is stored in `data_sources`. |
| Google News RSS | feed limited to personal non-commercial use | Dropped from every scheduled run; a test fails if a CronJob names `gnews`. |
| Nasdaq per-symbol RSS, MarketWatch top stories | 200 (3.4 s and 0.2 s) | Candidates only. Terms not read, so not added. |
| Yahoo Finance RSS | 200 | Excluded: terms bar commercial reuse (registry row `yahoo`). |
| Business Wire, AccessWire, company IR RSS | connection failure or 403 | Not usable. |
| SEC 8-K Item 7.01 and 8.01 exhibits | already collected as `EX-99.x` documents | Company press releases for display, public domain. |

Collector behaviour: `rss` reads each wire on its own, so one dead feed is logged as `rss` failure with the feed name and the run goes on (`collectRssFeeds`); it throws only when every feed fails. A release in both feeds is stored once by URL. The rss ping passes when at least one wire answers. GDELT keeps headlines already fetched when a later ticker times out or gets a 429, stops starting tickers after 20 minutes (Job deadline 30), and stores headline, link, outlet, time and tickers only.

The GitOps mirror includes a suspended GDELT CronJob at 01:05 Tuesday to Saturday. It runs before detect and has a 25 minute deadline. The owner must copy the change to the live GitOps repository and decide when to unsuspend it; no live schedule changes with this repository PR.

## Product catalyst coverage

The catalyst window is 90 days; narrative changes remain at 30 days. Extract bundles include recent SEC filings and EX-99 exhibits, plus stored PR Newswire RSS releases and GDELT headlines matched to the symbol. The bundle remains bounded by document count and text length. RSS and GDELT text has display disabled under the source registry, so a headline can direct the extractor to a filing but cannot by itself verify a public catalyst claim. A decided claim still needs an exact quote from stored, display-allowed text.

Detect adds up to six symbols per night when their latest product catalyst consensus is missing, unknown or older than seven days, even if no new filing arrived. It reviews the oldest answers first. Extract runs these reviews even when the source bundle has not changed; a bundle with no documents produces an unknown answer.

Rule from filing text (ST5). Collect reads the stored 8-K documents and exhibits (source edgar, display allowed) of the last 90 days and writes the fact `catalyst_8k`. A filing qualifies through item 1.01 (commercial agreement words: supply, license, distribution, development, collaboration or partnership agreement), 2.02, 7.01 or 8.01 when a sentence outside forward-looking and risk language names a launch, unveiling, new product or platform, partnership, FDA approval or contract award. The newest qualifying filing supplies the quote; the fact is dated by the filing and expires after 90 days. When 8-K text was read and nothing qualifies, the fact says `present: false`. With no 8-K text there is no fact and the rule stays unknown. Reconcile turns the fact into `productCatalyst` with agreement `data_rule`: true with the filing as evidence (label "SEC 8-K item X"), or false with no evidence. A verified extractor result (`agree` or `verified_single`) still wins. A disputed or unverified extractor result does not. Item 1.01 loans and credit agreements do not qualify. A wrong "none found" is possible when the wording is unusual; the extractor can still settle it.

### Why the catalyst rule can show "unknown" and "No source yet"

Unknown is the correct output when no stored, display-allowed text from the last 90 days backs a yes or no. Reconcile keeps a catalyst answer only when the quote is found in a stored document with `display_allowed` true; GDELT and RSS headlines have display off, so they only point the extractor to a filing. The code path (bundle, extractor, reconcile, page) was checked on 2026-10-10 and has no defect that hides a verified answer. The company page now says what is missing and when it is checked (nightly review, at most 6 stocks, oldest answer first).

Order of the data path: collect (SEC filings, 8-K and EX-99 text) → detect (adds 8-K Items 2.02, 4.02, 5.02, 7.01, 8.01 and up to 6 stale catalyst symbols) → extract → reconcile → daily. In the GitOps mirror the GDELT CronJob `invest-buddy-collect-gdelt` is `suspend: true`, so no headlines are stored until the owner unsuspends it. Nothing below runs from a repository PR; each step is a cluster write and needs owner approval.

Owner steps to fill the catalyst field now (one-off Jobs from the existing CronJobs, namespace as in the mirror):
1. Collect filings (100-day window): `kubectl create job --from=cronjob/invest-buddy-collect collect-manual-$(date +%s)`.
2. Optional headlines: copy the mirror change to the live GitOps repository, unsuspend `invest-buddy-collect-gdelt`, or run it once with `kubectl create job --from=cronjob/invest-buddy-collect-gdelt gdelt-manual-$(date +%s)`.
3. Build the gate: `kubectl create job --from=cronjob/invest-buddy-detect detect-manual-$(date +%s)`.
4. Extract: `kubectl create job --from=cronjob/invest-buddy-extract extract-manual-$(date +%s)`. It reads the gate; catalyst reviews skip the same-input check.
5. Reconcile and score: `kubectl create job --from=cronjob/invest-buddy-reconcile reconcile-manual-$(date +%s)`, then `--from=cronjob/invest-buddy-daily`.
6. Check in the database: `consensus_findings` for `field='productCatalyst'` (value, agreement) and `source_documents` for the symbol with `doc_type` like `8-K%` in the last 90 days.

Extract calls the model and spends tokens; the normal nightly run does the same steps on its own.

## 13F quarterly holdings (D22)

Job `thirteenf` (`dist/jobs/thirteenf.js`, `npm run thirteenf`) reads the newest 13F data set zip, keeps 13F-HR filings of the filers in `src/data/tracked-institutions.ts` (CIKs checked against SEC submissions; 13F-HR/A is ignored) and stores their positions in universe names. CUSIPs go through the existing issuer-name prefilter and OpenFIGI into `cusip_map`. Migration 050: `institutional_filings` (period, filer) and `institutional_holdings` (period, filer, ticker, shares, value, `change_shares`, `prior_period`), kept without expiry. `change_shares` compares a filer with its own previous stored quarter; a filer with no earlier stored filing gets NULL (no baseline), and a closed position is stored with 0 shares. Per ticker the job writes fact `institutional_net_change` (net shares of filers with a baseline, counts up, down, new, closed, holders) and a "13F holdings change" document with the filing links, display allowed as for `sec`. The first quarter only stores the baseline, so facts start with the second quarter. A second run for the same quarter adds nothing. 13F lists positions at quarter end, not trades. The temp zip is deleted. `--dry-run` writes nothing, `--zip FILE` reads a local file, `--period YYYY-MM-DD` picks a quarter. Two suspended CronJobs (`invest-buddy-thirteenf-q3` 20 November, `-q4` 16 February) exist in the mirror; the first real run is planned for 2026-11-20, after a dry run. The accumulation rule weights and reconcile are not changed; reading the fact in the rule is a separate step.

## Weekly discovery (DS1)

The `discovery` job (CronJob `invest-buddy-discovery`, Saturday 09:30, Europe/Bratislava) finds names outside the tracked universe, scores them with the same rules and stores up to `maxCandidatesPerWeek` (10) rows per week in `discovery_candidates` with status `pending`. All values are in `src/jobs/discovery-config.ts`.

Quality filters, applied before and during screening (`src/jobs/discovery-quality.ts`):

- Name and symbol, before the ranking cut: limited partnerships and MLPs, cooperatives and soybean or similar processor entities, LLC membership units, SPACs, ADR or depositary shares, and warrants, units, rights, preferreds, notes, ETFs and trusts (the D35 common-stock check). Skips are listed in the run log with a reason.
- SEC submissions, for the ranked names: SIC 6770 (blank check) and 6726, and foreign filers (20-F, 40-F or 6-K without 10-K or 10-Q).
- Market cap, from the last close times SEC shares outstanding (`dei/EntityCommonStockSharesOutstanding`, then `us-gaap/CommonStockSharesOutstanding`): at least 300 million USD (`minMarketCapUsd`). A name with no share count has no market cap and does not pass.
- Average dollar volume, the mean of close times volume over the last 20 bars: at least 2 million USD (`minAvgDollarVolumeUsd`).
- The two floors run in the MA200 pre-screen, on bars the job already fetches, so a failing name costs no extra Twelve Data request. A name that fails shows in the log as `pre-screen: market cap ...` or `quality: ...`.

Twelve Data use stays inside the D8 ledger: at most `preScreenTopK` (60) bars requests a week, one per name and none for names with fresh stored bars, against the 700 a day that jobs other than prices may use. SEC reads add one submissions and up to two company-concept requests per ranked name, paced at four a second.

Telegram: when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, the job posts one "New candidates" message for the week (`docs/alerts-telegram.md`).

Promote a candidate after review:

```
npm run discovery:promote -- SYMBOL --dry-run   # read only: shows the candidate it would promote
npm run discovery:promote -- SYMBOL
```

It needs `DATABASE_URL` and, for the real run, `SEC_USER_AGENT`. It refuses a symbol with no pending or approved row. Otherwise it adds the ticker to `universe_membership` (list `discovery`, no tier, criteria version `discovery-v1`) through the D11 change in `scripts/universe-change.ts`, inserts the `instrument_ids` row and fills CIK, SIC, fiscal year end, state and exchange from SEC (`src/data/master-refresh.ts`), then sets the candidate to `approved`. A rerun repeats no step. It prints the next steps. The script runs from a checkout with `tsx`; the jobs do not call it, so it is not built into `dist`.

