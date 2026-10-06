# Data and reconciliation

Set `DATABASE_URL` and run `npm run migrate`. Numbered SQL migrations run once under an advisory lock. Migration 003 seeds the instrument list; migration 004 adds consensus and reconciliation status. Set `DATA_MODE=db` for the scan pipeline. The runner posts to `/api/ingest/scan` with `INGEST_TOKEN` and never receives database credentials. Repeated run IDs are idempotent. A newer run supersedes only the same agent, symbol and date while retaining history.

A scan is a proposed finding. Claude and Codex runs are stored separately for each symbol and date. The reconcile job writes one consensus row per field. A disputed field or a field supplied by one agent has no score value. The score audit contains each field's agreement, both available run IDs and cited URLs.

A positive claim needs a cited HTTPS page with a publication date, fiscal period and copied sentence. The live verifier fetches that page and checks the sentence after case and whitespace normalization. It applies windows of 100 days for earnings and guidance, 30 days for catalysts, and 60 days for insider or institutional activity. `RECONCILE_VERIFY=off` skips fetching pages for local demonstrations; it still checks the evidence metadata and date. `fixture` checks the known sample quote without a network request. It does not establish that a claim is true.

SEC companyfacts can confirm or override only quarterly revenue acceleration and revenue decline. The parser chooses a reported quarterly duration of 70 to 105 days, groups by fiscal year and quarter, and compares each quarter with the same fiscal quarter one year earlier. It excludes year-to-date facts and ignores calendar frame labels. SEC frame labels group by calendar periods, which can differ from a company's fiscal quarters. Fiscal-year and fiscal-period labels describe the filing; comparative facts inside it may share those labels, so the parser first selects the latest quarter-end fact in each filing. It needs four comparable reported quarters: the latest quarter, the preceding fiscal quarter and each one's year-ago counterpart. A fourth-quarter standalone fact is often absent from Form 10-K. The conservative parser uses 10-Q quarterly facts, so a first-quarter result that needs fourth-quarter growth stays unknown. Restatements can change an earlier period; the latest filing available on the reconciliation date wins. Facts older than 100 days from their filing date are not used for a new reconciliation. EPS against analyst consensus is unavailable from companyfacts and stays an agent claim. SEC requests use `SEC_USER_AGENT`, run below five per second and cache responses for a day. The fiscal-period handling follows the [SEC XBRL API description](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) and [SEC fiscal-period definitions](https://www.sec.gov/files/fsds.pdf).

For a local demonstration, run `docker compose up -d --build db migrate web`, then `npm run scan:sample`. The sample posts one Claude and one Codex finding for NVDA with an EPS disagreement. Seed synthetic price bars with `DATABASE_URL=postgresql://investbuddy:local-only@localhost:55432/investbuddy npm run seed:local-bars`. Then run `RECONCILE_VERIFY=fixture docker compose run --rm --build reconcile` and `docker compose run --rm --build daily`. Open `/en/company/NVDA`, `/en/dashboard` or `/api/health`. The fixture quote is illustrative and is not a verified current research report. Finish with `docker compose down` to stop the containers and keep the volume. The health route returns database status, the latest scan date, the latest reconciliation time and the latest score date. An empty reachable database returns null dates, so monitor freshness separately.

`DATA_MODE=fixture` serves the sample universe for local development. `npm run daily -- --memory` scores that universe in memory. Database mode needs at least 200 bars per symbol; it has no fixture price fallback.

This is informational screening under ADR-001. Scores are rule outputs for all visitors; they do not include position size or personal advice.

Daily scoring requires a price bar dated exactly to the scoring session. Missing or older bars produce `Insufficient/invalid data` with `stale_prices`; no points are awarded. Same-day scores are refreshed when consensus inputs or price bars change.

## Collectors

`npm run collect` stores SEC EDGAR filings and GlobeNewswire RSS items for the universe. EDGAR documents carry `display_allowed: true` (public SEC data). RSS documents carry `display_allowed: false`, because the news text is not licensed for display; they are internal signals and never reach the judge input or the ideas page. Set `SEC_USER_AGENT` and `DATABASE_URL`. Use `--only NVDA,AMD`, `--since YYYY-MM-DD`, or `--source edgar|rss|fred` to narrow a run. FRED stores the latest federal funds observation when `FRED_API_KEY` is set and reports a skip when it is absent. This product uses the FRED API but is not endorsed by the Federal Reserve Bank of St. Louis. `--dry-run` fetches and parses without writing; `--memory` runs without Postgres. `COLLECTOR_FIXTURE_DIR=src/collectors/fixtures npm run collect -- --dry-run --memory` uses local fixture responses without network access.

`npm run detect` prints a JSON symbol list with reasons for new documents or facts. It accepts `--since`, `--max N`, and `--force-all`. `npm run retention` removes expired facts and documents. A document expires after the longest evidence window it can support, taken from `freshnessDays` in `src/data/evidence.ts`: 100 days for 8-K, 10-Q, 10-K, 20-F, 6-K and EX-99.1, 60 for Form 4 and 13F, 30 for everything else. Each fetch restarts that window, also when the content did not change. Facts expire after 30 days and restart only when their value changes. Expired documents stay while an unexpired consensus finding, trade idea or extraction run still cites them. Use `--dry-run` to count rows without deleting them.

## Free sources without a key (phase A2)

`collect --source` accepts a comma list of: `frames`, `getcurrent`, `13f`, `openfda`, `clinicaltrials`, `usaspending`, `fed`, `treasury`, `bls`, `vix`, `gnews`, `gdelt`. They are not in the default run (`edgar`, `rss`). The SEC ones (`frames`, `getcurrent`, `13f`) need `SEC_USER_AGENT`. `13f` downloads a large zip to a temp file, streams it, deletes it afterwards, and is behind its own flag for that reason. It reads the zip link from the SEC data sets page and maps CUSIPs to tickers through OpenFIGI for universe names only (cache table `cusip_map`, migration 008).

What each stores:

| Source | Output |
|---|---|
| `frames` | Quarterly revenue from XBRL frames for all filers: YoY, QoQ and acceleration. A fact `revenue_growth_quarterly` per universe symbol, plus one document with the top 25 accelerating names outside the universe (symbol null, because `collected_facts.symbol` is required). |
| `getcurrent` | Schedule 13D, 13G and 8-K from the EDGAR current-filings feed, universe issuers only, plus fact `holder_5pct_events`. |
| `13f` | Fact `institutional_13f` (filer count, shares, value) per universe symbol for the latest data set period. |
| `openfda`, `clinicaltrials` | Approvals, recalls and trial updates for VRTX, CRSP and REGN, plus discovery documents. |
| `usaspending` | Contract awards for configured universe recipients. |
| `fed`, `treasury`, `bls`, `vix` | FOMC dates, H.15 yields, Treasury average rates, three BLS series (one query of the 25 per day), VIX history. |
| `gnews`, `gdelt` | Headline, link, outlet and time only. Stored with symbol null and the tickers in `meta.symbols`, so `detect` does not rescan a ticker for each headline. |

Every document carries `meta.license_note` and `meta.display_allowed`. It is true only for SEC, FDA (CC0), USAspending, Treasury, Fed and BLS data. Everything else is false until terms are checked. The Google News feed text allows personal, non-commercial use only.

`npm run collect:ping` (or `node dist/jobs/collect.js --ping [--source name]`) sends one live request per source, checks that the response parses, prints a table and exits 1 if any ping fails. It writes nothing and needs no database. SEC pings and FRED print SKIP when `SEC_USER_AGENT` or `FRED_API_KEY` is unset. GDELT answers slowly (11 to 19 seconds on 2026-10-05) and returns 429 for requests about 8 seconds apart, so its ping can fail the 10 second limit. BLS pings use one of the 25 daily queries.

## Extraction (phase B)

Extraction turns stored documents into the existing ticker scan JSON with one AI call per ticker. The model reads only what the collectors stored. It cannot search or fetch. With `claude` the call runs with `--tools ""`, one turn and a dollar cap. `codex` runs in a read-only sandbox in an empty temp directory, so it has no web but is not a tool-free call.

Bundle. `GET /api/ingest/bundle/<SYMBOL>?asOf=YYYY-MM-DD` (bearer `INGEST_TOKEN`) returns the stored documents and facts for one universe symbol. Only documents published on or before `asOf` are included, each inside the freshness window of its type: 100 days for 8-K, 10-Q, 10-K, 20-F, 6-K, EX-99.1 and `XBRL revenue growth` (earnings, guidance and revenue fields), 60 for Form 4, 30 for everything else. The windows come from `freshnessDays` in `src/data/evidence.ts`, the same ones reconcile uses. `?days=1..365` (default 100) only narrows or widens the database scan. Order is EX-99.1 first, then 10-Q, 10-K, 20-F and 6-K, then 8-K, then Form 4, then the rest newest first, with the document id as tiebreaker so the order is the same on every request. Each excerpt is cut to 6000 characters by keeping keyword windows (8-K item headings keep the 1200 characters after them; the "emerging growth company" cover text is skipped), and a bundle holds at most 24 documents and 60000 characters. Each document carries `displayAllowed`: `meta.display_allowed` when present, otherwise true for `edgar` and false for everything else.

Run. `scanner/run-extract.mjs` fills `scanner/prompts/ticker-extract.md` with the bundle, calls `claude -p` (or `codex exec`), parses one JSON object and validates it with `scanner/validate.mjs`. It tries twice. The prompt tells the model that the bundle is untrusted data. The default model is `haiku` for claude. `--budget-usd` (default 0.5) caps one call because the CLI has no `--max-turns`. A response with more than one turn or a permission denial is rejected as tool use.

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
| `dataTailwind` | 10-year yield (FRED `DGS10`) change over the last 20 observations is at or below 0 pp (`MACRO_YIELD_MAX_CHANGE_PP`) and the VIX close is below 25 (`MACRO_VIX_MAX`) | either test fails | yield or VIX missing, older than 5 calendar days before the date (`MACRO_MAX_AGE_DAYS`), or fewer than 21 yield observations |
| `sectorRotationIntoGrowth` | average 20-session return of the 35 universe tickers (stored `daily_bars`) minus the SPY return over the same sessions is above 2 pp (`MACRO_ROTATION_MARGIN_PP`) | not above | SPY bars missing, too short or stale, or fewer than 80% of tickers (`MACRO_MIN_COVERAGE`) have a bar on SPY's last session |

The window is 20 sessions (`MACRO_WINDOW_SESSIONS`, 5 to 60). A bad setting stops the job. If one input is missing the flag is unknown, even when the other input alone would make it false.

Job. `node dist/jobs/macro.js [--date YYYY-MM-DD] [--no-fetch]` (`npm run macro`). The default date is the last completed weekday session in New York, like extract. It first refreshes its two inputs: `collectFredSeries` stores the last 40 `DGS10` observations as one document, and the existing VIX collector stores the Cboe close. Both documents are third-party data with `display_allowed: false`, so the page gets a flag and never the numbers. A missing `FRED_API_KEY` or a failed fetch is printed and skipped, and the rules then read what is stored and call old data stale. Then it writes, in one transaction:

- one `macro_findings` row with `runnerName: data_rule`, the thresholds used and the reason text. Its run id is derived from the date, so a rerun replaces the row.
- for each of the 35 tickers and both fields, a `consensus_findings` row with agreement `data_rule` (migration 012 adds the value), verified true for a known value, value null and unverified for unknown. The reason names the inputs and their dates. The evidence refs are the stored document urls (FRED series page and the Cboe page) for `dataTailwind`. `sectorRotationIntoGrowth` rests on our own price bars and cites no document.

`DatabaseUniverseProvider.macro()` accepts `agree` and `data_rule` for these two fields. Reconcile skips any field that already has a `data_rule` row for the date, so agents cannot overwrite it, and carry-forward does not replace it. The CronJob `invest-buddy-macro` (suspended, 06:50 Tuesday to Saturday, 240 s deadline) runs before reconcile at 07:00. The judge's `confirmed()` in `src/engine/signals.ts` still counts only `agree` and `xbrl_override`; the macro fields are not among the key fields it reads.

## Carry-forward

`CARRY_FORWARD=on` lets a partial scan score the whole universe. It is off by default; with the flag off, reconcile and daily run the same SQL and write the same rows as before migration 009. With it on:

- Reconcile copies the latest consensus row of each field for a symbol that has no findings on the date. The copy gets `carried_from`, the date of the scan the value came from, and a reason that starts with "Carried from". A symbol with findings on the date is reconciled as usual and its rows clear any carried tag.
- A field is carried while it is inside the same window the evidence check uses: 100 days for revenue, EPS and guidance fields, 60 for insider or institutional activity, 30 for catalyst, narrative and the two macro fields. A true claim counts from its newest cited publication date, never later than the scan date. Other values count from the scan date. Copying a carried row again does not extend the window.
- After the window the field becomes null, agreement `single`, not verified, with no evidence urls, and the reason says it expired.
- Daily applies the same rule when it reads consensus, so it does not depend on reconcile having run with the flag. It adds `carriedFrom` and `expiredFields` to the score audit. The company page shows "carried from <date>" or "expired, unknown" next to the field. Both tags are part of the score fingerprint, so a field that expires re-scores the date.

## Price ingest

`node dist/jobs/prices.js` (or `npm run prices`) loads 260 daily bars for the 35 universe symbols and the SPY benchmark from Twelve Data and upserts them into `daily_bars`. SPY is stored as an instrument with source `benchmark`; it has no scan findings, so it never appears in the universe. Set `TWELVE_DATA_API_KEY` and `DATABASE_URL`. The key is sent in an `Authorization: apikey` header, never in the URL, and the job exits with a clear message when it is missing. Flags: `--only NVDA,SPY`, `--memory` (no database) and `--dry-run` (fetch and validate, store nothing).

The adapter drops a bar dated today until the US session has closed (16:00 New York plus a five minute margin), rejects non-finite or non-positive prices, `high < low` and duplicate dates, and sends at most 7 requests per minute to stay under the Basic plan limit of 8 per minute and 800 per day. It retries 429 and 5xx with backoff, and stops at the first daily-limit error and marks the untouched tickers as failed. Block's current ticker is `XYZ`, so `SQ` is requested as `XYZ` and stored as `SQ`; this mapping is not yet checked against the live API. Symbols the vendor rejects are printed as unmapped.

A ticker is skipped when the fetch has fewer bars than the database already holds for the same date range, so a partial response never shrinks history. Re-running is idempotent: unchanged bars are not rewritten. Each run adds a row to `price_ingest_runs` (migration 006) with requested, succeeded and failed counts, bars written, the failures and any stop reason. The existing `ingest_runs` table keeps one row per scoring date and feeds the digest date, so price runs use their own table. The job exits 1 when more than 10% of tickers fail.

The free tier is for the private beta only. A data licence is required before a paid launch (ADR-002).

## Judge (phase C)

The judge turns reconciled facts into a short list of trade ideas. Code decides the action, the size tier and the three ratings from data alone. One AI call writes the wording. A script validates and stores the result, and the web shows it. The AI never writes to the database or the web.

Deterministic part. `src/engine/signals.ts` computes, for each symbol, the action (WATCH, START_POSITION, ADD, HIGH_CONVICTION_ADD, HOLD, REDUCE, THESIS_BROKEN), a size tier and the ratings Company, Entry and Catalyst (Very strong, Strong, Good, Neutral, Weak). The action comes from the rule score, the three ratings and confirmed evidence only. The owner's portfolio never decides a buy action or a tier, so the same symbol gives the same buy signal with or without a baseline (decision of 2026-10-06, tasks G1 and G2). All thresholds sit in one object, `SIGNAL_RULES`, with a version string (`ruleConfigVersion`, stored with every run and idea; `2026-10-06.1` since this change). The rules, in order:

- A rejection (confirmed revenue decline, confirmed guidance cut, or the score engine's "Criteria broken") gives THESIS_BROKEN for a held name and WATCH for any other.
- A held name with a Weak company rating in a downtrend gives REDUCE. A name that is not held ends as WATCH.
- Fewer than two confirmed key fields gives WATCH, marked unconfirmed. A field counts only when two agents agreed or SEC data confirmed it, the quote was verified and it has not expired.
- A buy needs a rule score of 15 or more, company and entry at least Good and no downtrend. Without it: HOLD for a held name, WATCH otherwise.
- HIGH_CONVICTION_ADD needs score 18 or more, company, entry and catalyst at least Strong, a fresh confirmed EPS beat or guidance raise, and no carried field. ADD needs entry at least Strong or a pullback. Any other buy is START_POSITION.

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

Input. `GET /api/ingest/judge-input?asOf=YYYY-MM-DD&maxSymbols=12` (bearer `INGEST_TOKEN`) returns the portfolio baseline, the candidate symbols (held names, names with an earlier idea, names in the Setup or Watch state, capped by `maxSymbols`), their reconciled fields with `carriedFrom` and expired flags, evidence urls, chart numbers, the computed signals with a signature, and the last stored idea per symbol. The signature is `action|company|entry|catalyst|tier`, so a change in the owner's baseline alone never makes an idea new. Ideas stored before migration 011 have a `min-max` signature and count as changed once.

Run. `scanner/run-judge.mjs` (`npm run judge`) keeps only the signals whose signature differs from the last stored idea, and a new symbol with any action other than HOLD. With nothing changed it makes no model call. A missing baseline no longer stops the run: the signals are the same, and the owner bands stay 0. The model sees only those symbols, with the action, the tier in words, the ratings, the reasons and the facts. It does not see the baseline, the EUR band or whether a name is held, because the public wording must fit every reader. It gets one `claude -p` call with `--tools ""`, a dollar cap and the model from `--model` or `JUDGE_MODEL` (default `sonnet`). The call runs on the subscription CLI login or `CLAUDE_CODE_OAUTH_TOKEN`, the same as the extractor. No API key is used. It shares the 5-hour pool with interactive work, and it is expected to be small: one call a day, about 10 to 20 thousand characters of input.

```
node scanner/run-judge.mjs --as-of 2026-10-05                  # one call, stores new ideas
node scanner/run-judge.mjs --dry-run --input-file input.json   # offline: writes scanner/out/judge-payload-*.json, posts nothing
node scanner/run-judge.mjs --force --budget-usd 0.3 --max-symbols 8
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

`POST /api/ingest/portfolio-baseline` (bearer token) stores it for its date and `GET` returns the newest one on or before a date. `source` is `manual` or `ibkr-mcp`. The IBKR MCP server is read-only and uses an interactive OAuth login for one account. The tool names `get_account_positions` and `get_account_balances` are unverified, and nothing here calls them. Do not run a cron job on it until headless auth is confirmed. The sample baseline in `src/ideas/fixtures.ts` is synthetic and exists only for tests and the fixture-mode page. It is not production data. The baseline is personal data: it stays behind the ingest token, only derived euro bands reach the private view, the model never sees it, and nothing reads `costEur`.

Web. `/en/ideas` and `/sk/ideas` list ideas newest first in the alert layout (headline `TICKER - ACTION - EUR min-max` in the private view, `TICKER - ACTION - tier` in the public card, verdict, What happened, Why it matters, Setup, Numbers, Plan, Evidence), with an UNCONFIRMED badge, a "carried data" badge, a conflict note and a downgrade note. Every card shows the size tier in words. Ideas also carry the owner's euro band, which ADR-001 keeps out of the public product: the public card on the company page strips the band and every sentence naming EUR. The ideas page renders the private view, so it and its nav link are hidden (404) unless `IDEAS_PAGE=on`, or `DATA_MODE=fixture`. Nav links on statically generated pages (methodology, legal) are fixed at build time, so set `IDEAS_PAGE` at build time too if the link should appear there. The idea text is English in both locales; only the labels are translated.

CronJob. The scanner image ships `run-judge.mjs`. Use `command: ["node", "/app/scanner/run-judge.mjs"]` with `INGEST_BASE_URL`, `INGEST_TOKEN` and the same agent auth as the scan job. The `invest-buddy-judge` CronJob (suspended, 07:45 Tuesday to Saturday) does this, after reconcile (07:00) and daily (07:15).
