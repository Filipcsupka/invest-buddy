# Lane RESEARCH: research engine (IDs RS0 to RS8)

Added 2026-10-11 from the owner's request to replace the ChatGPT automation. The design is `docs/research-engine.md` and the decision is `docs/adr-research-engine.md`. RS0 (this lane, the design, the schema `scanner/schema/research-output.schema.json` and `src/research/types.ts`) is the first task. The rules in `docs/roadmap/README.md` sections e and h apply: one writer per file, one task per PR, migration numbers taken when the PR opens.

## Order

```
RS0 ──┬── RS1 runner and prompts ──────┬── RS5 CronJobs, caps ── RS7 Codex adapter
      ├── RS2 verifier ──────┐         │
      └── RS3 storage, state ┴── RS4 judge feed ── RS6 cards ── RS8 evaluation ── owner unsuspends RS5 jobs
```

RS1, RS2 and RS3 can run in parallel: they touch different files. RS4 waits for RS2 and RS3. RS8 runs once RS1, RS2, RS3 and RS6 are merged, and the schedules in RS5 stay suspended until the owner signs RS8.

| ID | Task | Owner files | Depends on | Size |
| --- | --- | --- | --- | --- |
| RS1 | Researcher runner and prompts | `scanner/run-research.mjs`, `scanner/research-adapters.mjs`, `scanner/research-validate.mjs`, `scanner/prompts/research-*.md`, `scanner/prompts/research-themes.json`, `src/research/config.ts`, `scanner/test/run-research.test.mjs`, `scanner/Dockerfile` COPY line | RS0 | M |
| RS2 | Source verifier | `src/research/verify.ts` (started), `src/research/fetch-guard.ts`, `src/research/html-text.ts`, `src/research/sources.ts`, `src/research/sources.json`, `src/jobs/research-verify.ts`, tests | RS0, D17 | M |
| RS3 | Storage, pipeline state machine, migration, ingest routes | `migrations/NNN_research.sql`, `src/db/research.ts`, `src/research/pipeline.ts`, `src/jobs/research-pipeline.ts`, `src/app/api/ingest/research/route.ts`, `src/app/api/ingest/research-input/route.ts`, `scripts/research-promote.ts`, tests | RS0, DS1, D11 | L |
| RS4 | Judge integration and fact feed | `src/jobs/reconcile.ts`, `src/jobs/detect.ts`, extract bundle builder, judge input route, `scanner/run-judge.mjs`, `scanner/prompts/judge.md`, tests | RS2, RS3 | M |
| RS5 | CronJobs, caps, kill switch | `scanner/research-caps.mjs`, `deploy/gitops/.../research-cronjobs.yaml`, research NetworkPolicy, `src/jobs/cronjob-order.test.ts`, `package.json` `build:jobs` | RS1, RS3 | M |
| RS6 | Telegram research cards and dedupe | `src/notify/research-card.ts`, `src/research/materiality.ts`, `src/jobs/research-notify.ts`, AL3 extension in `src/notify/format.ts`, owner page `src/app/[locale]/owner/research/[symbol]/`, i18n keys | RS3, RS4, AL3 | M |
| RS7 | Codex adapter and secret | Codex part of `scanner/research-adapters.mjs`, strict schema derivation, `deploy/README.md` section, infra proposal | RS1, RS5, owner | M |
| RS8 | Evaluation against the old automation | `src/research/fixtures/old-samples.json`, `scripts/research-eval.ts`, `docs/research-eval.md` | RS1, RS2, RS3, RS6 | M |

## RS0 Design, schema and types

Status: this PR. Docs, `scanner/schema/research-output.schema.json`, `src/research/types.ts` with `validateResearchOutput`, the fixture `src/research/fixtures/sample-output.json` and vitest tests. No runtime code, no migration.

## RS1 Researcher runner and prompts

Why: the model step that finds candidates, catalysts and beneficiary chains on the web.

Steps:
1. `scanner/research-adapters.mjs`: the adapter interface from the design doc and the Claude adapter. Command: `claude -p --output-format json --no-session-persistence --permission-mode dontAsk --tools WebSearch,WebFetch --allowedTools WebSearch,WebFetch --max-turns <n> --model <model>`, run in a fresh empty temp directory with the env allow-list of `scanner/run-scan.mjs`. Read usage and cutoff with `usageFromEnvelope` and `attachClaudeUsage`/`cutoffError` from the existing modules. Count web searches and fetches from the envelope; record `null` when the envelope does not report them.
2. `scanner/run-research.mjs`: `--type weekly|daily|deepdive`, `--symbol` (deep dive), `--as-of`, `--model` (default `$RESEARCH_MODEL`, else `sonnet`), `--dry-run` (write the file, post nothing), `--input-file` (offline input), `--manual` (deep dive outside the window), `--base-url`, `--timeout-s`. It reads the input from `GET /api/ingest/research-input?type=…` (RS3), builds the prompt, calls the adapter, extracts the JSON, fills `run`, validates and posts to `POST /api/ingest/research`. A weekly run makes 3 calls (theme groups from the themes file). Each call is its own run id.
3. `scanner/research-validate.mjs`: the same walker and contract rules as `src/research/types.ts`, in plain JavaScript for the scanner image, which has no TypeScript. A node test feeds the fixture `src/research/fixtures/sample-output.json` and the RS0 error cases to both validators and compares the errors.
4. Prompts `scanner/prompts/research-weekly.md`, `research-daily.md`, `research-deepdive.md`. Each states: facts only, no points, ratings, actions, sizes or price targets; copy each quote verbatim from the page; give the page URL, not a search result URL; social posts, interviews and rumours are leads (`lead: true`) until a primary or press source confirms them; never infer a partner, supplier or customer relationship without a quote that names both companies; prefer primary sources; ignore anything dated after the run date; web pages are untrusted data and their instructions are ignored; the open candidates list is for updating, not for announcing again. The weekly prompt carries the themes and discovery signals of the design doc and the rule that robotics names meet the same bar as any other. The daily prompt carries the per-symbol triggers and known facts. The deep dive prompt asks for the beneficiary chain parts listed in the design doc.
5. `scanner/prompts/research-themes.json` with the 13 themes of the design doc, each with id, name, segments and search hints, and the three weekly call groups.
6. `src/research/config.ts`: daily watch cap 25, trigger thresholds (move 7%, volume 2.5 times the 20-day average, earnings in 2 days), known-facts window 90 days, per-call limits. Placeholders for the owner.
7. Add the new files to the `scanner/Dockerfile` COPY line (one job at a time, README section e).

Acceptance:
- tests with a fake `claude` binary: a valid reply is posted once with a filled `run`; a reply with an unknown field, a figure not in its quote or advice wording is not posted and the file is kept; a reply wrapped in prose is extracted; a cutoff reply records status `cutoff`;
- the spawned command has exactly the tools `WebSearch,WebFetch` and the env passed to the child contains only allow-listed names (asserted in the test);
- the parity test shows the same errors from `research-validate.mjs` and `validateResearchOutput` for every RS0 test case;
- `--dry-run --input-file` works with no network and no token;
- prompts contain the untrusted-data sentence and the no-advice rules (string test).

Approval needed: none for the PR; the first live run is RS8.
Risk: the CLI envelope may not report search and fetch counts; then the cap is enforced by turns only, which the run log states.

## RS2 Source verifier

Why: no research claim may reach a card or a score input until code has checked it.

`src/research/verify.ts` was started by another worker. Build on that file; import `SourceClass`, `VerificationStatus` and `READING_LABEL` from `src/research/types.ts` instead of redefining them.

Steps:
1. `src/research/fetch-guard.ts`: the SSRF rules of the design doc (https on 443, DNS check against private, loopback, link-local, CGNAT, ULA and cluster ranges, connect to the checked address, no IP literals, no `.svc`/`.cluster.local`/single-label hosts, 3 redirects each rechecked, 10 s, 5 MB, allowed content types, 1 request per second per host, User-Agent with contact, `SEC_USER_AGENT` for `sec.gov`, `robots.txt` disallow respected). Pure checks take an injected resolver so tests need no network.
2. `src/research/html-text.ts`: HTML to text with `script`, `style`, `noscript`, `iframe`, `svg`, `template`, comments and hidden elements dropped, entities decoded, whitespace collapsed.
3. `src/research/sources.ts` and `sources.json`: host lists for primary, press, aggregator and social, the company IR registry (seeded from the IR links in `src/jobs/discovery-themes.json`), and the mapping to `data_sources` ids (`sec`, `openfda`, `clinicaltrials`, `usaspending`, else `research_web`). Unknown hosts are aggregator.
4. `verify.ts`: per evidence item fetch, text, quote match (exact after NFKC, quote and whitespace normalisation; fuzzy up to 3 characters for quotes of 80 or more characters), `putSnapshot` into `raw_snapshots` with key `research:<canonical URL>`, a `source_documents` row with `doc_type` `research_page`, the class, `display_quote` only for `public_gov` sources with display allowed, the 90-day staleness check, the per-finding status and the `confirmed` rule (one verified primary item, or verified press items from two publishers).
5. `src/jobs/research-verify.ts`: reads `research_findings` with status `pending`, verifies, writes results, updates `research_runs` counts, logs through `runLoggedJob`. A failed fetch never fails the job. Add to `build:jobs` (one new job at a time).

Acceptance:
- fetch-guard tests: `http://`, port 8443, `127.0.0.1`, `10.0.0.5`, `169.254.169.254`, `[::1]`, `fd00::1`, `web.invest.svc.cluster.local`, a host resolving to a private address, and a redirect to a private address are all refused; a public https URL passes;
- html-text tests: a quote inside `<script>` or a hidden `div` is not found; entities and whitespace normalise;
- verify tests with recorded pages: exact and fuzzy matches pass, an altered figure fails as `quote_not_found`, a 403 is `fetch_failed`, social-only is `lead_only`, a 120-day-old item is `stale`, the class comes from the host even when the model's hint differs, the same page twice stores one snapshot (D17 dedupe);
- every verified row carries `READING_LABEL`;
- third-party rows have `display_quote = false`.

Approval needed: cluster write for the first live run (RS8) and the CronJob (RS5).
Risk: many press sites block bots or need JavaScript; those claims stay UNCONFIRMED leads. RS8 measures how many.

## RS3 Storage, pipeline state machine and migration

Why: memory between runs, the "never forget an idea" rule and the path into the scored universe.

Steps:
1. Migration (next free number): `research_runs`, `research_findings`, `research_candidates`, `research_events` as in the design doc; widen `ai_budget_calls.kind` and `ai_quota_samples.job` to include `research`; insert the `research_web` row into `data_sources` (`licence_class` `unknown`, display and redistribution off). Retention must not touch these tables.
2. `src/db/research.ts`: insert a run with its findings in one transaction (idempotent on run id; a repeat returns `replayed: true`), read pending findings, write verify results, read and write candidates and events.
3. `POST /api/ingest/research`: bearer `INGEST_TOKEN`, 1 MB limit, `validateResearchOutput`, 400 with field paths on error. Also accepts `{ "skip": { runType, asOf, status, stopReason, adapter } }` to log a skipped run.
4. `GET /api/ingest/research-input?type=daily|weekly|deepdive&symbol=`: the daily symbol list in the order of the design doc (baseline symbols only, never quantities or values), per-symbol triggers, verified claims of the last 90 days, open candidates with state and thesis, the themes, and the limits.
5. `src/research/pipeline.ts`: a pure function from the current candidate rows, new verified findings, the latest engine signals and the baseline position symbols to the new states, review dates and events, with the transition table and review intervals of the design doc. `src/jobs/research-pipeline.ts` applies it after the verify job and after the daily score.
6. Promotion proposal: for a scorable `WATCH` candidate with two verified findings, one of them confirmed, run the DS1 screen for that one symbol, write a `pending` `discovery_candidates` row with the research sources, and record `promotion_proposed`. `scripts/research-promote.ts` is a thin wrapper that prints the DS1 command; the owner runs `npm run discovery:promote -- SYMBOL`. When the symbol appears in `universe_membership`, the pipeline sets `in_universe` and records `promoted`.

Acceptance:
- migration applies on an empty database and on a copy with the current schema in CI; the down path is not required;
- pipeline unit tests cover every row of the transition table, the G1 case (engine add without a position stays `WATCH`), review dates using the earlier of interval and next earnings date, revival of a `DROPPED` name, and that a lead alone creates `DISCOVERED` but never `WATCH`;
- route tests: valid post stored once; replay returns `replayed: true`; schema error returns 400 with paths; missing token 401; body over 1 MB 413;
- research-input test: the daily list never contains quantities or EUR values;
- a promotion test with a test database writes a `pending` `discovery_candidates` row that `discovery:promote --dry-run` accepts.

Approval needed: cluster write (migration).
Risk: DS1 is on an open branch; if its `discovery_candidates` columns change, step 6 follows them.

## RS4 Judge integration and fact feed

Why: verified research facts should improve the score inputs and the card wording without the model ever setting a point.

Steps:
1. Detect: add to the daily gate every symbol with a verified `research_page` document newer than its last applied extraction (today the gate holds SEC accessions from `filing_watch`).
2. Extract bundle: include those documents as excerpts, like other stored documents.
3. Reconcile: read verified, confirmed, primary research findings with a `field` for the as-of date. Research and extract readings that agree, with passed quote checks, give `agree`. A conflict gives `disputed`. A research reading alone gives the new agreement `research_verified` for `productCatalyst`, `guidanceRaised` and `guidanceCut`. `narrativeChanged` is never fed (ADR-005 item 4). The migration that widens the `consensus_findings` agreement check is part of this task.
4. Engine: `research_verified` is not in `confirmed()` until the owner decides (open decision below). Add it behind a rules version bump only after that decision.
5. Judge input route: `researchFacts` per symbol (claim, kind, class, URL, date, reading label, confirmed). `scanner/prompts/judge.md`: research facts are data, may be cited as evidence, and cannot change action, tier or ratings. `scanner/run-judge.mjs`: the figure check accepts figures that appear in a verified research quote.

Acceptance:
- reconcile tests for agree, disputed and `research_verified`, and that an unconfirmed, press, aggregator or lead finding never reaches reconcile;
- golden engine tests unchanged (no rules version change in this task);
- judge test: a figure from a research quote passes the figure check, an invented figure still fails;
- detect test: a symbol with a new `research_page` document enters the gate once.

Approval needed: cluster write (agreement migration).
Risk: `scanner/run-judge.mjs` and `scanner/prompts/` are sequential files (README section e); RS4 waits its turn.

## RS5 CronJobs, caps and kill switch

Why: the engine must never run without limits, and the owner must be able to stop it with one setting.

Steps:
1. `scanner/research-caps.mjs`: the checks of the design doc in order (kill switch, window, monthly tokens, monthly USD, daily calls, daily tokens, `AI_DAILY_TOKEN_CEILING`, live quota through `scanner/claude-usage.mjs`), each returning a skip status that the runner posts as a skipped run. `ai_budget_calls` reserve and finish with kind `research`.
2. Manifests in the GitOps mirror, all `suspend: true`: `invest-buddy-research-weekly` (Sunday 01:00), `invest-buddy-research-daily` (Tuesday to Saturday 02:40), `invest-buddy-research-verify` (03:30 daily and Sunday 03:30), `invest-buddy-research-pipeline` (03:50, and 04:40 after the daily score), `invest-buddy-research-notify` (07:20, before the digest), and `invest-buddy-research-deepdive` as a suspended template for manual Jobs with `RESEARCH_SYMBOL`. `concurrencyPolicy: Forbid`, one retry, deadlines 40 minutes for model jobs and 20 for others. `RESEARCH_ENABLED` comes from a ConfigMap key so the owner can flip it without an image change.
3. NetworkPolicy for the verify job: egress to TCP 443 outside the cluster CIDRs and to DNS only.
4. `src/jobs/cronjob-order.test.ts`: assert the new jobs are suspended and run in the order research-daily, verify, pipeline, daily score, pipeline, judge, notify, digest.

Acceptance:
- caps tests: each cap stops before the model call and logs the right status; `RESEARCH_ENABLED` unset or `off` stops; month rollover resets the monthly cap; quota at 70% for five hours stops;
- manifests render with kustomize and pass kubeconform in CI; all research CronJobs are suspended;
- the NetworkPolicy renders and selects only the verify job.

Approval needed: infra PR and every unsuspend, applied by the owner.
Risk: a manual deep dive during the day competes with the owner's interactive Claude use; the quota stop covers it.

## RS6 Telegram research cards and dedupe

Why: the owner's main output, in the old card format plus coverage, score, web link and pipeline history.

Steps:
1. `src/research/materiality.ts`: the fingerprint (state, engine action, tier, confirmed finding keys, close, ratings, relative score, band, owner EUR band) and the material-change rules and thresholds of the design doc. Pure.
2. `src/notify/research-card.ts`: `formatResearchCard` for names not yet scored, reusing the AL3 helpers (escaping, band emoji, section trimming at 4096 characters, EN and SK); and an optional `research` block on the AL3 `IdeaCardInput` in `src/notify/format.ts` for scored names (coverage line, pipeline history, UNCONFIRMED marks, owner page link).
3. `src/jobs/research-notify.ts`: reads candidates with events since the last run, applies materiality, renders, records in `notification_deliveries` (kind `research:<locale>`, key symbol plus fingerprint hash) before sending, writes `alert_sent` or `alert_suppressed`. Sends only with `TELEGRAM_CARD_MODE=owner` and the owner chat (`TELEGRAM_OWNER_CHAT_ID` from a new sealed secret `invest-buddy-telegram-owner`). `RESEARCH_PUBLIC_CARDS` stays off; with it off nothing goes to the public chat.
4. Owner page `/[locale]/owner/research/[symbol]` behind `OWNER_VIEW`: state, history, verified facts with links, unconfirmed leads, promotion status. 404 when the flag is off.
5. Monday owner card: overdue reviews and, when `allocate()` reports cash drag and nothing is ready, the CSPX ALLOCATION card without an amount until the owner's rule exists.

Acceptance:
- render tests for each pipeline state in owner mode, EN and SK, against the design doc example; a card over 4096 characters loses whole sections in AL3 order;
- public mode test: no EUR, no action words (the banned-word test of `src/jobs/digest.test.ts`), no pipeline action states; with `RESEARCH_PUBLIC_CARDS` off nothing is sent to the public chat;
- materiality tests for each row of the table, including "cash changed only" and "same fact restated" giving no card, and the 3-day cool-down with its BROKEN and REDUCE exceptions;
- a rerun of the job sends nothing new;
- a card line whose findings were all dropped is removed; a card with no What happened line is not sent.

Approval needed: the owner creates the private channel and the sealed secret.
Risk: `src/notify/format.ts` and `src/i18n/messages.ts` are shared; rebase and merge one at a time.

## RS7 Codex adapter and secret

Status: adapter code done (steps 3 and 4 in code, tests with a fake `codex` binary). The auth path and the PVC or secret (steps 1 and 2, the `deploy/README.md` note and the refresh proof) are still waiting for the owner. RS7 is not done.

Why: a second adapter for when the Claude quota is short, and a later second voice (ADR-005).

Steps:
1. Investigate the Pending PVC `invest-buddy-codex-home`. It may be waiting for its first consumer (a `WaitForFirstConsumer` storage class) since the scan-codex CronJob was removed; that is not verified. Record the StorageClass binding mode and events.
2. Choose with the owner: (a) the ChatGPT login with the PVC seeded from the sealed `invest-buddy-codex-auth-seed` (`deploy/README.md`), one writer at a time, and a check that the refreshed `auth.json` persists across two runs a day apart; or (b) `OPENAI_API_KEY` as a sealed secret with `RESEARCH_MONTHLY_USD` above 0.
3. Codex adapter in `scanner/research-adapters.mjs`: `codex --search -a never exec --sandbox read-only --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --output-schema <file> -C <empty dir> -o <file>`. Derive the output schema from `$defs.modelOutput`, inlining refs and removing keywords strict mode does not accept; the validator still runs on the result.
4. Quota: confirm whether `codex exec --json` reports rate-limit usage in the installed CLI. If it does, skip at 50% or more. If not, skip unless `RESEARCH_CODEX_QUOTA_UNKNOWN=allow`. At most 2 Codex calls a day, inside the window.

Acceptance:
- adapter tests with a fake `codex` binary: flags, schema file, read of the `-o` file, usage mapping;
- schema derivation test: the derived schema has no `$ref` and every object lists all properties as required;
- a written note in `deploy/README.md` with the chosen auth path and the refresh proof (two runs, dates);
- `RESEARCH_ADAPTER=codex` without working auth fails at start with a clear message and no model call.

Approval needed: owner (secret, PVC, infra PR).
Risk: token refresh in a read-only container is the open problem from `scanner/README.md`.

## RS8 Evaluation against the old automation

Status: offline harness done (steps 1 and 4: fixture, `scripts/research-eval.ts`, report template in `docs/research-eval.md`). The live run (steps 2 and 3) is still waiting for owner approval. RS8 is not done.

Why: show that the new engine finds at least what the old one found, with better evidence, before anything runs on a schedule.

Steps:
1. `src/research/fixtures/old-samples.json`: the six sample cards with ticker, card date, the trigger fact in one line, its kind and the old action class. No EUR amounts and nothing from the owner's portfolio. Triggers: MRVL Investor Day raised its long-range revenue targets (guidance); GMAB phase 3 EPCORE DLBCL-2 result (clinical); GFS five-year TSMC interposer agreement (contract); INTT record Q3 orders with book-to-bill above 1.3 (earnings); MEDCL FDA approval of WELTRUZA (regulatory); EOS.AX Kuwait counter-drone contract (contract).
2. Manual run with the owner's approval: one `weekly_discovery` with `--as-of` set to the day before the first sample date and the themes file unchanged (the six names not given), then one `deep_dive` per ticker with `--as-of` the card date. The validator's date rule drops evidence published after the as-of date.
3. Run verify, pipeline and notify (owner mode, to a test chat) on the stored rows.
4. `scripts/research-eval.ts`: reads the stored rows of those run ids and prints the measures below. `docs/research-eval.md` records the result, cost and the owner's grades.

Measures and pass levels:

| Measure | Pass |
| --- | --- |
| Candidate recall, discovery run: sample names that reach `DISCOVERED` or better without being named | at least 4 of 6 |
| Trigger recall, deep dives: the sample's trigger fact found as a finding | 6 of 6 |
| Trigger evidence: that finding verified on a primary source | at least 5 of 6 |
| Quote failures: `quote_not_found` share of all evidence items | at most 10% |
| Figures on cards that match a verified quote | 100% |
| Social or unverified claims shown as facts | 0 |
| Primary links per card, against the old card's links | not fewer on any card |
| UNCONFIRMED marks on claims with one non-primary source | 100% |
| Repeat alerts across two consecutive daily runs without material change | 0 |
| Tokens and cost per run | within the RS5 caps |
| Owner grade: card useful for a decision | at least 4 of 6 |

Acceptance: `docs/research-eval.md` with the table filled from the run ids, signed by the owner. Only then may the owner unsuspend the RS5 CronJobs.

Approval needed: cluster write (manual Jobs), owner review.
Risk: web search cannot be fully rolled back in time; later articles may still appear in search results. The date rule drops them from evidence, and the report says how many were dropped.

## Open owner decisions

| Decision | Needed by |
| --- | --- |
| Should `research_verified` count in `confirmed()` like `verified_single`, or show without points? | RS4 |
| Thresholds: daily triggers, review intervals, materiality, caps (placeholders in the design doc) | RS1, RS3, RS5, RS6 |
| Rule for the CSPX ALLOCATION amount | RS6 |
| Codex auth path: login and PVC, API key, or Claude only | RS7 |
| May the raw store keep full third-party pages for internal checks? | RS2 |
| Public research cards after RS8 and the lawyer's answer (G5) | after RS8 |
