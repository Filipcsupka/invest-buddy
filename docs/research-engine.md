# Research engine

The research engine replaces the owner's scheduled ChatGPT task ("Growth Investing V2 / Market Alpha Scan"). That task searched the whole market every day, kept no memory, could not prove its quotes and mixed facts with sizing in one model answer. Here the same job is split so that a model only finds and reads pages, code checks every quote, the existing rules give the points, and the owner sizing code gives the amounts.

The decision and its alternatives are in `docs/adr-research-engine.md`. Tasks RS1 to RS8 are in `docs/roadmap/lane-research.md`. The output contract is `scanner/schema/research-output.schema.json`, with types and a validator in `src/research/types.ts`.

ADR-001 still applies. Public output is informational screening. EUR amounts, action words and pipeline actions appear only in owner mode on the owner's private Telegram channel and behind `OWNER_VIEW`.

The owner's old prompt and sample cards are kept in the vault (`projects/investing-platform/research/old-automation/`). They contain the private portfolio and stay there. The engine reads the portfolio at run time from `portfolio_baseline` (Flex import).

## Three layers

1. Scripts (free, deterministic). The existing collectors give facts and points: prices and technicals, SEC filings and companyfacts, Form 4, 13F, macro, the earnings calendar, the detect gate and DS1 discovery. Nothing in this layer changes.
2. Research (AI with web search). A model with only `WebSearch` and `WebFetch` looks for what the scripts cannot find: names outside the universe, catalysts, contracts, FDA and clinical events, guidance, beneficiary chains, the robotics and physical AI track and the other themes from the old prompt. It returns findings with cited URLs and verbatim quotes. It never returns points, ratings, actions or amounts, and the schema has no field for them.
3. Judge (existing). The deterministic engine (`src/engine/score.ts`, `src/engine/signals.ts`) and the judge step (`scanner/run-judge.mjs`) merge verified script facts and verified research findings into the score, the signal and the idea card. The judge model still writes wording only.

Between layers 2 and 3 sits the verifier (RS2), which is plain code. A research claim reaches a card or a score input only after the verifier fetched the cited page, found the quote on it, stored a snapshot and classified the source.

## Data flow

```
                     ┌────────────── scripts (unchanged) ───────────────┐
                     │ collect, prices, form4, thirteenf, macro,        │
                     │ earnings-calendar, detect, discovery (DS1)       │
                     └───────────────┬──────────────────────────────────┘
                                     │ facts, triggers, universe, scores
                                     ▼
 GET /api/ingest/research-input ──► run-research.mjs (scanner image, RS1)
   (RS3: symbols, triggers,          adapter: claude -p with WebSearch, WebFetch only
    known facts, open candidates)    (codex: RS7 code done); caps and kill switch (RS5)
                                     │ research-output JSON (schema v1), validated
                                     ▼
                         POST /api/ingest/research (RS3)
                         research_runs, research_findings (status pending)
                                     │
                                     ▼
                         research-verify job (RS2, no AI)
                         fetch with SSRF guard → quote check → raw_snapshots (D17)
                         → source class and display rights → source_documents row
                                     │ verified / lead_only / dropped
                                     ▼
                         research-pipeline job (RS3, no AI)
                         research_candidates state machine, research_events,
                         review dates, promotion proposal → discovery:promote (DS1)
                                     │
             ┌───────────────────────┼─────────────────────────────┐
             ▼                       ▼                             ▼
   nightly chain (unchanged)   reconcile reads verified      research-notify job (RS6)
   detect → extract reads the  primary facts (RS4)           materiality check, owner card,
   stored snapshot → reconcile → daily score → signals →     notification_deliveries
   judge (research facts as data, RS4) → digest (AL1/AL3)
```

The scanner image never gets database credentials. It reads its input from a protected route and posts its output to another, both with `INGEST_TOKEN`, like `scan`, `extract` and `judge` today (`docs/scan-contract.md`).

## Run types

| Run | When (Europe/Bratislava) | Scope | Model calls | Output |
| --- | --- | --- | --- | --- |
| `weekly_discovery` | Sunday 01:00, inside the 00:00 to 07:00 subscription window | All themes in `scanner/prompts/research-themes.json`, beyond the universe | 3 calls: AI and infrastructure themes; the robotics track alone; the other themes | New candidates, chains, findings on known names |
| `daily_watch` | Tuesday to Saturday 02:40, after extract starts and before the 04:10 daily score | Up to 25 symbols chosen by script (below) | 1 call | Findings on watched names |
| `deep_dive` | On demand, one manual Job per ticker | One ticker and its beneficiary chain | 1 call | Findings, chains and one candidate |

Daily watch symbols, chosen by script in this order until the cap of 25: open positions from the latest `portfolio_baseline` row (symbols only, never quantities or values); pipeline candidates in `START_READY`, `ADD_READY`, `HOLD` and `REDUCE`; candidates whose `review_at` is today or earlier; universe names with a trigger since the last run (a new filing in the detect gate, an earnings date in the last two days from the calendar, a one-day move of 7% or more, or volume at 2.5 times the 20-day average); then `WATCH` candidates by oldest `last_checked_at`. The model gets, for each symbol, the trigger reasons and the claims already verified in the last 90 days, so it searches for what is new. Thresholds live in `src/research/config.ts` (RS1) and are placeholders for the owner.

Deep dive asks for the full beneficiary chain: the development, the new spending or profit pool, named public partners, suppliers and customers, infrastructure dependencies, indirect beneficiaries and the likely winners and losers. Every relationship in a chain needs its own finding with a quote. A relationship the model infers without a source is not allowed (the validator rejects a chain link backed only by leads, and the verifier drops a link whose finding fails).

### Themes config

`scanner/prompts/research-themes.json` (RS1) lists themes with an id, a name, the value chain segments and search hints. The first version carries the themes of the old prompt:

- `ai_compute`: AI compute, semiconductors, networking, optics
- `datacenter_power`: datacenter power, cooling, electrical infrastructure
- `cloud_data`: cloud, software, data
- `cyber`: cybersecurity and AI agent security
- `robotics`: the dedicated robotics, physical AI and industrial automation track, with the segments robot OEMs, industrial automation, machine vision and sensors, actuators and motion control, simulation and software, edge compute and chips, enabling suppliers
- `autonomy`: drones, autonomous vehicles and systems
- `biotech_medtech`: biotech, genomics, medical technology, FDA and clinical milestones
- `fintech`: fintech and payments
- `energy_grid`: energy, grid, storage, nuclear
- `space`: satellites and launch
- `defense_tech`: defense technology
- `advanced_manufacturing`: advanced manufacturing and materials
- `new_themes`: secular themes not listed above

Each weekly call also gets the discovery signals of the old prompt: earnings surprises and guidance changes; accelerating revenue, ARR, orders, backlog or free cash flow; estimate revisions from a reliable source; new major contracts; product and platform launches; regulatory, FDA and clinical milestones; capex cycles; M&A; insider and company capital allocation; new technology shifts; unusual price and volume moves with a fundamental cause; reporting on changing industry economics. The robotics track has its own call because the portfolio has little robotics exposure. A robotics name meets the same bar as any other: the prompt says so, and the pipeline applies the same rules.

## Output contract

The runner writes one JSON file per call and validates it before posting. The schema has two parts:

- `run`, written by the runner: run id, type, date, prompt version, adapter and model, scope (themes, symbols, deep dive symbol), limits, usage (tokens, searches, fetches, cost, duration), status and stop reason.
- `output`, written by the model: `findings`, `candidates`, `chains` and `notes`. Every property is required and optional values are `null`, so the same part can serve as a strict output schema for the Codex adapter (RS7).

A finding is one fact about one company: kind, an optional score field it informs (`productCatalyst`, `guidanceRaised`, `guidanceCut`, `narrativeChanged`), polarity, our short claim (at most 240 characters, in our words), event date, themes, 1 to 4 evidence items (https URL, verbatim quote of 20 to 500 characters, publication date, source name and a source class hint), up to 5 figures, a confidence and a `lead` flag.

`validateResearchOutput` in `src/research/types.ts` checks the shape against the schema file with the same dependency-free walker used for `scan.schema.json` and `judge-output.schema.json`, then these rules:

- every number in a figure appears in the quote of the evidence item it cites;
- a finding whose sources are all social is a lead, and a lead never carries a score field;
- a score field fits the kind and polarity (`guidanceRaised` is a positive guidance finding, `productCatalyst` comes from a product, contract, regulatory, clinical or partnership finding);
- no evidence is dated after the run date (this also keeps replays honest, see RS8);
- ids are unique, and every candidate, card line and chain link points to existing findings; a candidate needs a finding about itself that is not a lead, and so does every chain link;
- a deep dive names its symbol and other runs do not; a weekly run names at least one theme; the finding count stays within the run limit;
- model text contains no advice, rating or score wording (`start a position`, `price target`, `19 of 25 points`, action codes and similar; see `ADVICE_PATTERN`).

The ingest route (RS3) runs the same validator and rejects the whole post on any error. The runner keeps the rejected file in its output folder for review.

## Verifier

RS2 builds the verifier in `src/research/verify.ts`. Another worker has started that file; it should import its shared types (`SourceClass`, `VerificationStatus`, `READING_LABEL`) from `src/research/types.ts`. The verify job is code only. No model sees a fetched page at this step, which keeps the reader of the page (the researcher) apart from the checker.

For each evidence item of each pending finding:

1. Check the URL against the fetch guard (see Security). A blocked URL makes the item `blocked`.
2. Fetch the page with the guard and limits. A timeout, an HTTP error, a paywall page or a body over the limit makes the item `fetch_failed`.
3. Convert the body to text: drop `script`, `style`, `noscript`, `iframe`, `svg`, `template`, comments and elements hidden with `hidden` or `aria-hidden`; decode entities; collapse whitespace. PDF is stored but not parsed in the first version, so a PDF item ends as `fetch_failed` with reason `pdf_not_parsed`.
4. Look for the quote after normalising both sides (Unicode NFKC, straight quotes, collapsed whitespace, case kept). An exact match passes. A match with up to 3 differing characters in a quote of 80 characters or more also passes and is recorded as `fuzzy`. Anything else makes the item `quote_not_found`.
5. Store the raw response with `putSnapshot` from `src/data/raw-store.ts` (D17) under `source_id` from the source table below and key `research:<canonical URL>`. The snapshot id goes on the finding.
6. Store the extracted text as a `source_documents` row (`doc_type` `research_page`, symbol, URL, publication date, `display_allowed` from the source class) so the nightly extract can read the page without web tools.
7. Classify the source from the host, never from the model's hint. A disagreement with the hint is logged.
8. Check the date: an item published more than 90 days before the run date is `stale`. This matches the window of the catalyst rule (#119) and is a placeholder for every kind.

SEC exhibit fallback (`src/research/sec-fallback.ts`): when step 2 fails with `fetch_failed` (company IR sites often answer 403 to bots) and the finding has a symbol, the verifier looks for the quote in the symbol's 8-K exhibits filed from 5 days before to 10 days after the claimed date (last 90 days when no date is claimed), at most 6 filings. A hit makes the item `verified` as a primary SEC source: canonical URL is the exhibit, the reason names the original failure and the filing date, the stale check uses the filing date. No hit keeps the original `fetch_failed`. It does not run after a readable page that lacks the quote, after `blocked`, or for a PDF.

A finding takes the best status of its items. It is `verified` when at least one item passed; it is `lead_only` when its only passing items are social; otherwise it carries the failure.

### Source classes and display rights

| Class | Hosts (config `src/research/sources.json`, RS2) | `data_sources` id | Can feed a score input | Card shows |
| --- | --- | --- | --- | --- |
| primary | `sec.gov`, `fda.gov`, `accessdata.fda.gov`, `clinicaltrials.gov`, `ema.europa.eu`, `federalregister.gov`, `usaspending.gov`, `defense.gov` contract notices, exchange announcement platforms (for example ASX), the company's own IR domain from the registry, and issuer press releases on PR Newswire and GlobeNewswire | `sec`, `openfda`, `clinicaltrials`, `usaspending`, or `research_web` | Yes, through reconcile (RS4) | Our claim and the link. A quote only when the source is `public_gov` with `display_allowed` |
| press | Reuters, AP, Bloomberg, Financial Times, WSJ, CNBC, Barron's, Nikkei and others on the list | `research_web` | No | Our claim and the link |
| aggregator | Seeking Alpha, Yahoo Finance, MarketScreener, Investing.com, Benzinga, Motley Fool, Zacks, TipRanks, StockTitan, and any host not on a list | `research_web` | No | Our claim marked UNCONFIRMED and the link |
| social | X, Reddit, StockTwits, YouTube, Substack, LinkedIn, Telegram, Discord | `research_web` | No | Only as an UNCONFIRMED lead in owner mode |

`research_web` is a new `data_sources` row (RS3 migration) with `licence_class` `unknown`, `display_allowed` false and `redistribution_allowed` false. Third-party news text is never displayed: a card shows our short claim and the link, nothing copied. Company IR text is treated the same way. The company IR registry starts from the IR links already in `src/jobs/discovery-themes.json` and grows when the owner confirms a domain; a domain that only looks like the company's does not count.

### What the labels mean

Every verified finding stores `reading_label` = "one model reading checked against the quote". It means one model read the page and code confirmed the quoted sentence is on it. It does not mean a second model agreed.

A claim is confirmed when it has a verified primary item, or verified press items from two different publishers. Everything else that survives is shown with UNCONFIRMED, as the old cards did when a claim lacked a second source.

| Outcome | Stored | On cards |
| --- | --- | --- |
| verified, confirmed | yes | as a fact with its link |
| verified, not confirmed (one press source, or aggregator) | yes | as a fact marked UNCONFIRMED |
| lead_only (social) | yes | owner mode only, as UNCONFIRMED lead |
| fetch_failed (paywall, timeout, PDF) | yes | owner mode only, as UNCONFIRMED lead |
| quote_not_found, blocked, stale | yes, for evaluation | never |

## How research facts reach scores and cards (RS4)

Research never sets a point. Facts reach the engine on two paths.

The main path is storage. The verifier's `source_documents` row puts the page into the next nightly extract for that symbol. Today detect builds its gate from SEC accessions in `filing_watch`, so RS4 adds symbols with a new verified `research_page` document since their last applied extraction to the gate, and adds those documents to the extract bundle. The extract model reads the stored text with no tools and gives its own reading. Reconcile then has two independent readings of the same page: the research finding and the extract finding. When they agree and the quote check passed, the field is `agree`, which `signals.ts` already counts.

The fallback path is a verified primary research fact with no extract reading on the same day. RS4 adds the agreement value `research_verified` to reconcile for `productCatalyst`, `guidanceRaised` and `guidanceCut` only. Whether the engine counts it like `verified_single` is an owner decision (lane file, RS4). Until the owner decides, it is stored and shown but adds no points. A research reading that conflicts with the extract reading makes the field `disputed`, as with two agents today.

`narrativeChanged` facts are shown on cards but never feed reconcile. ADR-005 item 4 keeps narrative judgements unknown unless a written rule decides them.

The judge input route adds `researchFacts` per symbol: claim, kind, source class, URL, publication date, the reading label and whether it is confirmed. The judge prompt treats them as data. The judge figure check accepts a figure that appears in a verified research quote. The judge still cannot change the action, the tier or the ratings.

Names outside the universe have no score. They get a research card (RS6) with their facts and pipeline state, and they get points only after promotion.

## Candidate pipeline

### Tables (RS3 migration, next free number)

```
research_runs (
  id uuid PRIMARY KEY, run_type text CHECK IN ('weekly_discovery','daily_watch','deep_dive'),
  as_of date, started_at timestamptz, finished_at timestamptz,
  adapter text CHECK IN ('claude','codex'), model text, auth_source text, prompt_version text,
  status text CHECK IN ('ok','partial','cutoff','failed','killed','skipped_cap','skipped_quota','skipped_window'),
  stop_reason text, input_tokens int, output_tokens int, cache_read_tokens int, cache_creation_tokens int,
  web_searches int, web_fetches int, cost_usd numeric(10,4), duration_s numeric,
  findings_count int, verified_count int, dropped_count int,
  ai_budget_call_id uuid REFERENCES ai_budget_calls(id), output_hash text, created_at timestamptz DEFAULT now())

research_findings (
  id bigint identity PRIMARY KEY, run_id uuid REFERENCES research_runs, finding_key text,  -- "f1"
  symbol text, company_name text, exchange text, kind text, field text, polarity text,
  claim text, event_date date, themes text[], confidence text, lead boolean,
  evidence jsonb,                      -- as the model wrote it, plus per-item verify result
  verification_status text CHECK IN ('pending','verified','quote_not_found','fetch_failed','blocked','stale','lead_only'),
  source_class text, source_id text REFERENCES data_sources, snapshot_id bigint REFERENCES raw_snapshots,
  document_id bigint, confirmed boolean DEFAULT false,
  reading_label text,                  -- 'one model reading checked against the quote'
  display_quote boolean DEFAULT false, verified_at timestamptz,
  dedupe_key text,                     -- symbol|kind|event_date|hash(normalised claim)
  UNIQUE (run_id, finding_key))

research_candidates (
  symbol text PRIMARY KEY, company_name text, exchange text, themes text[],
  state text CHECK IN ('DISCOVERED','WATCH','START_READY','ADD_READY','HOLD','REDUCE','BROKEN','DROPPED'),
  state_since date, previous_state text, first_seen_at timestamptz, first_run_id uuid,
  last_verified_at timestamptz, last_checked_at timestamptz, review_at date,
  in_universe boolean, scorable boolean, promotion_status text CHECK IN ('none','proposed','approved','rejected'),
  thesis text, upgrade_triggers jsonb, invalidation jsonb,
  last_alert jsonb,                    -- fingerprint of the last sent card, see Alerts
  last_alert_at timestamptz, owner_note text)

research_events (
  id bigint identity PRIMARY KEY, symbol text, at timestamptz DEFAULT now(),
  kind text CHECK IN ('discovered','finding_verified','finding_dropped','state_change','review_due',
                      'promotion_proposed','promoted','alert_sent','alert_suppressed','deep_dive','owner_note'),
  from_state text, to_state text, reason text, finding_ids bigint[], run_id uuid, payload jsonb)
```

The same migration widens `ai_budget_calls.kind` and `ai_quota_samples.job` to allow `research`, and inserts the `research_web` source row. `research_events` is append only. Retention never deletes from the four tables. Raw snapshots have no expiry already (D17). Duplicate findings across runs share a `dedupe_key`; a repeat does not create a new event.

### States and transitions

The pipeline job (RS3, `src/research/pipeline.ts` pure, `src/jobs/research-pipeline.ts` to apply) runs after the verifier and again after the nightly score. Every transition is decided by code from verified findings, engine output and the baseline. The model never sets a state.

| From | To | Condition |
| --- | --- | --- |
| (none) | DISCOVERED | first finding on a symbol that is not in `research_candidates`, verified or lead |
| DISCOVERED | WATCH | at least one verified finding from a primary or press source, and the DS1 quality filters pass where they apply (US listing; market cap and dollar volume floors; no SPAC, LP, ADR shell or non-common security). A name the filters cannot check (foreign listing) passes with `scorable = false` |
| DISCOVERED | DROPPED | no verified finding within 30 days, or a DS1 quality filter fails |
| WATCH | START_READY | the symbol is scored, the engine action for the latest date is `START_POSITION`, and the baseline holds no position |
| WATCH, START_READY, HOLD | ADD_READY | the baseline holds a position and the engine action is `START_POSITION`, `ADD` or `HIGH_CONVICTION_ADD` |
| START_READY | WATCH | the engine action is no longer a buy |
| START_READY, ADD_READY | HOLD | the baseline shows a new or larger position after the alert, or the engine action is `HOLD` for a held name |
| ADD_READY | HOLD | the engine action for the held name is no longer a buy |
| HOLD, ADD_READY | REDUCE | the engine action is `REDUCE` |
| REDUCE | HOLD | the engine action is no longer `REDUCE` and the position remains |
| HOLD, REDUCE | WATCH | the baseline no longer holds the position |
| any except DROPPED | BROKEN | the engine action is `THESIS_BROKEN` (score state `Criteria broken`), or the owner marks it |
| BROKEN | WATCH | the engine state has left `Criteria broken` and a verified positive finding dated after the break exists |
| DROPPED | DISCOVERED | any new verified finding on the symbol |

An engine `ADD` or `HIGH_CONVICTION_ADD` for a name the owner does not hold keeps the candidate in `WATCH` with the note "add-level signal, no position". Decision G1 keeps the public signal independent of holdings, so this distinction lives here and in the owner view.

A verified negative finding (a guidance cut, a regulatory rejection, a lost contract) on a candidate that is not scored does not move it to BROKEN on its own. It sets `review_at` to today and sends an owner review card. Only the engine or the owner decides BROKEN.

### Review dates

Each state sets `review_at` when it is entered. The value is the earlier of the state's interval and the next known catalyst or earnings date from the calendar.

| State | Interval |
| --- | --- |
| DISCOVERED | 14 days |
| WATCH | 30 days |
| START_READY, ADD_READY, REDUCE | 7 days |
| HOLD | 90 days, or the next earnings date |
| BROKEN | 90 days |
| DROPPED | 180 days |

A candidate whose review date has passed enters the next daily watch. The Monday owner card lists overdue reviews.

### Never forget an idea

Rows in `research_candidates` are never deleted. A dropped name stays in the table with its history and comes back on any new verified finding or at its 180-day review. Every weekly discovery prompt receives the list of open candidates (symbol, state, thesis) so that the model updates them instead of announcing them again as new.

### Promotion into the scored universe

Points need the nightly chain, so an outside name must join the universe first. When a `WATCH` candidate is scorable, has at least two verified findings, and at least one of them is confirmed, the pipeline writes a `discovery_candidates` row for the current week: status `pending`, theme from the research themes, sources from the verified findings (URL and kind `research`), and the score fields filled by the DS1 screen for that one symbol. It records `promotion_proposed` and sends an owner card. The owner promotes with the existing DS1 command:

```
npm run discovery:promote -- SYMBOL --dry-run
npm run discovery:promote -- SYMBOL
```

After that the normal chain (collect, prices, daily, detect, extract, judge) scores the name from the next run, and the candidate's `in_universe` turns true. Promotion stays a manual owner step, as in DS1. DS1 (`scripts/discovery-promote.ts`) is on an open branch and must merge before RS3 can rely on it.

A non-US name that the collectors cannot price or read stays in `WATCH` with `scorable = false`. Its card says "outside scoring coverage".

## Action classes and the two-stage model

The old automation used eight action classes. They map to pipeline states and to the engine's actions and tiers (`src/engine/signals.ts`).

| Old class | Pipeline state | Engine action and tier | Owner card header | Public card |
| --- | --- | --- | --- | --- |
| WATCH (EUR 0) | DISCOVERED or WATCH | `WATCH`, `NONE`, or not scored | `WATCH · EUR 0` | band label only |
| START POSITION, stage 1 | START_READY | `START_POSITION`, `STARTER` | `START POSITION · EUR a–b` | band label |
| START POSITION, stage 2 | START_READY | `START_POSITION`, `STANDARD` or `FULL` | `START POSITION · EUR a–b` | band label |
| ADD | ADD_READY | `ADD`, `ADD_THIRD` | `ADD · EUR a–b` | band label |
| HIGH-CONVICTION ADD | ADD_READY | `HIGH_CONVICTION_ADD`, `ADD_HALF` | `HIGH-CONVICTION ADD · EUR a–b` | band label |
| HOLD / NO ACTION | HOLD | `HOLD` | no card (no routine HOLD noise) | none |
| REDUCE / STOP ADDING | REDUCE | `REDUCE` | `REDUCE · stop adding` | band label |
| THESIS BROKEN | BROKEN | `THESIS_BROKEN` | `THESIS BROKEN` | `Criteria broken` |
| CSPX ALLOCATION | none, portfolio level | `CSPX_ALLOCATION` (owner view only, G4) | `CSPX ALLOCATION · EUR a–b` | never |

Stage 1 is the starter tier. Stage 2 is a larger start (`STANDARD`, `FULL`) or an add. The engine's `startTiers` rule decides the step: score 18 and company Strong gives `STANDARD`; score 18, company Very strong, catalyst Strong and a fresh confirmed EPS beat or guidance raise gives `FULL`. A stage 1 card states what would graduate it in two lines: the engine condition, written by code, and the candidate's `upgradeTriggers`, written by the model and checked like other model text.

Bands follow `docs/roadmap/lane-status.md`. The owner header uses the old action words; the public card uses only the band label, and "Conditions met" while `ADVICE_OUTPUT` is off (`docs/wording-gate.md`).

### Amounts

The EUR band comes from deterministic code, never from a model: `allocate()` in `src/engine/allocation.ts` with `ALLOCATION_CONFIG`, the tier from the engine, and free cash, monthly contribution and positions from the latest `portfolio_baseline` row. Capital is dynamic. Cash may build up across months; a month with no candidate ready spends nothing, and a strong signal may use more than one month's contribution, within the per-name cap and the order ceilings. Every owner card compares the candidate against three alternatives, computed by code: CSPX (its 60-day return from stored bars, or SPY where CSPX bars are not stored), the best existing holding in `ADD_READY` or `HOLD` by relative score, and keeping the cash.

The CSPX ALLOCATION card is an owner card from the Monday allocation run. It is sent when `allocate()` reports cash drag and no candidate is `START_READY` or `ADD_READY`. Its amount needs a rule the owner has not signed yet (lane file, open decisions), so until then the card shows the idle cash and no amount.

EUR amounts and action words appear only with `TELEGRAM_CARD_MODE=owner` on the owner's private channel. The public or default mode stays neutral.

## Cards

RS6 renders research cards with the AL1 and AL3 formatter (`src/notify/format.ts`): the same escaping, band emoji, section order, 4096-character trimming and EN/SK text. A scored name keeps its AL3 idea card, extended with the research lines below. A name that is not scored gets a research card from a new `formatResearchCard` in `src/notify/research-card.ts` that reuses the AL3 helpers.

Owner mode, a name that is not scored yet:

```
🔵 SMPL · WATCH · EUR 0
New robotics supplier with a signed contract and a higher outlook.
What happened
• Signed a five-year actuator supply agreement.
• Raised the full-year revenue outlook.
Why it matters
• The contract is large next to current annual revenue.
Setup: not rated, outside the scored universe
Numbers: Contract value USD 1,250M · FY revenue outlook 410-425M
Plan
Now: WATCH, EUR 0
Upgrade: next quarterly report confirms the raised outlook and contract revenue starts
Invalidation: the supply agreement is cut or the outlook is lowered
Opportunity cost: CSPX +3.1 % in 60 days · best holding XYZ (Setup 78 %) · cash EUR 640
Evidence: Company IR · Company IR · Example Wire (UNCONFIRMED)
Coverage: 3 facts checked (2 primary, 1 press), 1 unconfirmed · not scored yet
Pipeline: DISCOVERED 10-06 → WATCH 10-07 · promotion proposed
Owner page · Methodology
```

(Figures in the example are made up, as in `src/research/fixtures/sample-output.json`.)

The parts from the old format: headline with action and EUR band, one-line verdict, What happened (2 to 3), Why it matters (1 to 2), Setup with Company, Entry and Catalyst ratings, Numbers (3 to 5), Plan (now, upgrade trigger, invalidation, opportunity cost), Evidence (2 to 4 links), UNCONFIRMED marks. Where the parts come from:

- Verdict, What happened, Why it matters: the candidate card text of the model. A line whose findings were all dropped is removed; a line backed only by unconfirmed findings ends with "(UNCONFIRMED)". The card needs at least one What happened line, or it is not sent.
- Setup: the engine's ratings for a scored name. A name that is not scored shows "not rated", because the model never rates.
- Numbers: the figures of verified findings first, then engine numbers (score, revenue growth from SEC, distance to MA200). A research card may show fewer than three.
- Plan: "Now" from the state and the sizing code; upgrade and invalidation from the candidate; opportunity cost from code, plus the model's optional sentence.
- Evidence: links of verified findings, primary first, at most 4. Each link label is the source name, never copied text.

Added beyond the old format:

- coverage line: facts checked by class, count of unconfirmed, and for a scored name the EN45 relative score line;
- link to the web: the company page for a scored name, or the owner page `/[locale]/owner/research/[symbol]` (behind `OWNER_VIEW`) for a name that is not scored;
- pipeline history: the state changes with dates, and a pending promotion.

Public mode does not send research cards. `RESEARCH_PUBLIC_CARDS` stays off until RS8 passes and the lawyer question on public feeds (tasks-open G5) is answered. The public channel keeps the AL1 and AL3 band alerts for scored names, now with the verified research facts in their evidence lines, and the DS1 weekly candidates post.

### Alerts and dedupe

The old rule was "do not repeat an alert unless evidence, entry price, conviction or action materially changed". RS6 implements it in `src/research/materiality.ts` against the `last_alert` fingerprint stored on the candidate. A card is sent when the candidate enters `START_READY`, `ADD_READY`, `REDUCE` or `BROKEN`, when a promotion is proposed, when a review is due with a verified negative finding, or when a new candidate reaches `WATCH`. It is sent again only if one of these changed materially:

| Dimension | Material change |
| --- | --- |
| Action | The pipeline state or the engine action changed, or the size tier changed. |
| Evidence | A new confirmed finding of kind earnings, guidance, contract, regulatory, clinical, product, partnership or m_and_a, not in the last card. Unconfirmed findings, leads, aggregator items and restatements of a known fact (same `dedupe_key`) do not count. |
| Entry price | The last close moved 10% or more from the close stored with the last card, or the engine's entry rating changed by one step or more. |
| Conviction | Any of the company, entry or catalyst ratings changed by one step or more, or the relative score moved by 10 percentage points or more, or the band changed. |
| Amount (owner mode) | The EUR band moved by 25% or more and by at least EUR 50. A change in cash alone does not count otherwise. |

When nothing material changed, the job writes `alert_suppressed` with the reason and sends nothing. A symbol gets at most one research card in 3 days, except for a move to `BROKEN` or `REDUCE`. Deliveries go into `notification_deliveries` with kind `research:<locale>` and a key of symbol plus fingerprint hash, so a rerun never posts twice. The thresholds are placeholders for the owner.

## Adapters, caps and cost

One interface in `scanner/research-adapters.mjs` (RS1):

```js
// adapter = { name, available(env) -> { ok, reason }, quota() -> Promise<{ window, pct, resetAt } | null>,
//             run({ prompt, schemaPath, model, maxTurns, timeoutMs, workDir }) ->
//               Promise<{ text, usage, webSearches, webFetches, costUsd, cutoff }> }
```

Claude comes first. It already runs extract and judge in the cluster on the subscription token (`CLAUDE_CODE_OAUTH_TOKEN`). The research call uses the pattern already in `scanner/run-scan.mjs`: `claude -p --output-format json --no-session-persistence --permission-mode dontAsk --tools WebSearch,WebFetch --allowedTools WebSearch,WebFetch --max-turns <n> --model <model>`, an empty working directory, and the env allow-list from `run-scan.mjs`. No Bash, Read, Write or MCP tool is available. The runner extracts the JSON, fills `run`, validates and posts.

Codex comes second (RS7): `codex --search -a never exec --sandbox read-only --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --output-schema <file> -C <empty dir> -o <file>`, as documented in `scanner/README.md`. The adapter code is in `scanner/research-adapters.mjs`; it adds `--json` after `-o` to read token usage, and reads the reply from the `-o` file. The output schema is derived from `$defs.modelOutput` by `deriveStrictSchema` (refs inlined, keywords strict mode rejects removed, every object closed with all properties required), and the validator still runs on the reply. In the cluster, `CODEX_ACCESS_TOKEN` comes from secret `invest-buddy-codex-token`. The adapter feeds it to `codex login --with-access-token` on stdin, checks `codex login status`, and removes the private temporary `CODEX_HOME` after each call. Local runs can still use a login in `CODEX_HOME`. The API key path is disabled because no Codex token price is documented in this repo, so `RESEARCH_MONTHLY_USD` cannot cap its spend.

Caps and the kill switch (RS5), checked by the runner before every model call in this order:

| Env | Default | Effect |
| --- | --- | --- |
| `RESEARCH_ENABLED` | `off` | Kill switch. Any value other than `on` ends the run before a model call, with status `killed`. Verify and pipeline jobs still process stored rows. |
| `RESEARCH_WINDOW` | `00:00-07:00` | Subscription runs only inside this window (Europe/Bratislava). A deep dive outside it needs `--manual` and still passes the quota check. |
| `RESEARCH_MONTHLY_TOKENS` | 12,000,000 | Hard cap: the sum of `research_runs` tokens this calendar month. |
| `RESEARCH_MONTHLY_USD` | 0 | Hard cap for metered API auth. Codex API auth is refused at startup with any value because its cost cannot be measured. |
| `RESEARCH_DAILY_CALLS` | 4 | Model calls per day (Sunday allows the 3 weekly calls on top). |
| `RESEARCH_DAILY_TOKENS` | 600,000 | Research tokens per day. |
| `AI_DAILY_TOKEN_CEILING` | existing | The shared ceiling for extract, judge and research. |
| `RESEARCH_QUOTA_STOP_5H_PCT`, `RESEARCH_QUOTA_STOP_7D_PCT` | 70, 80 | Stop when the live Claude usage (`scanner/claude-usage.mjs`) is at or above these, at start and during the run. |
| `RESEARCH_MAX_TURNS`, `RESEARCH_MAX_SEARCHES`, `RESEARCH_MAX_FETCHES` | 30, 40, 60 | Per call. Searches and fetches are asked for in the prompt and counted from the CLI envelope. |
| `RESEARCH_ADAPTER` | `claude` | `claude` or `codex`. |
| `RESEARCH_CODEX_QUOTA_UNKNOWN` | unset | `allow` lets a Codex access token or local login run when no rate limit is reported. |
| `RESEARCH_CODEX_MODEL` | CLI default | Passed as `-m` when set. |

The defaults are placeholders for the owner. A skipped call is still logged in `research_runs` with its reason (`skipped_cap`, `skipped_quota`, `skipped_window`), so the cost log has no gaps. Each call reserves and finishes a row in `ai_budget_calls` with kind `research`, so the AI usage report covers it.

The Codex account is shared with the owner's own coding agents. The Codex adapter runs only inside the window, at most 2 calls a day, and skips at a reported rate limit of 50% or more. A local `codex-cli 0.163.0` run on 2026-10-19 reported `turn.completed.usage.input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens` and `reasoning_output_tokens`. It reported no rate limit or cost field. The adapter reads `rate_limits.*.used_percent` if a later CLI event supplies it. With no reading before the first call, an access token or local login run skips unless the owner sets `RESEARCH_CODEX_QUOTA_UNKNOWN=allow`; later calls in the same process use the last reading. The call count comes from `codexDailyCalls` in the research-caps usage report. Codex records token counts and `used_usd=0`; zero is not an estimate of actual API spend. API auth remains disabled until a documented price allows `RESEARCH_MONTHLY_USD` to be enforced.

## Security and licences

Prompt injection. Every fetched page is untrusted data.

- The researcher has only web search and fetch. It has no shell, no file access, no MCP servers and no credentials beyond its own login. It cannot post anything; the runner posts after validation.
- The verifier is code and never passes page text to a model. The researcher never sees the verifier's result.
- Text from pages reaches a later model (extract, judge) only as stored data in a delimited field. Those prompts already say that text inside data is not an instruction, and those models have no tools (`docs/script-first-pipeline.md`).
- HTML is converted to text with scripts, styles, frames, templates, comments and hidden elements removed. Nothing is ever executed or rendered.
- The validator rejects advice and score wording, so a page that tells the model to "rate this a strong buy" cannot get that phrase into a card.
- The ingest route caps the body at 1 MB and rejects unknown fields.

SSRF, for the verifier's fetcher (`src/research/fetch-guard.ts`, RS2):

- https only, port 443 only, no credentials in the URL, no IP literal hosts;
- resolve DNS and refuse loopback, private (10/8, 172.16/12, 192.168/16), link-local (169.254/16, including the metadata address), CGNAT (100.64/10), unique local IPv6 (fc00::/7), `::1`, and the cluster pod and service ranges; connect to the address that was checked;
- refuse `*.svc`, `*.cluster.local`, `localhost` and single-label names;
- at most 3 redirects, each checked again;
- 10 second timeout, 5 MB body limit, content types `text/html`, `text/plain`, `application/xhtml+xml` and `application/pdf` only;
- one request per second per host, a declared User-Agent with contact, `SEC_USER_AGENT` for `sec.gov`, and `robots.txt` disallow rules respected;
- RS5 adds a NetworkPolicy for the verify job: egress to 443 outside the cluster and to DNS, nothing else.

Licence classes. The research engine stores third-party pages in `raw_snapshots` for internal checking only, under `research_web` with display and redistribution off. Cards show our short claim, the source name and the link. A quote is shown only for `public_gov` sources with `display_allowed` (SEC, openFDA, USAspending). Press, IR, aggregator and social text is never shown. Whether storing full third-party pages is acceptable is an open question for the owner (lane file, risks).

## Evaluation before any schedule

RS8 replays the six sample cards of the old automation (MRVL, GMAB, GFS, INTT, MEDCL, EOS.AX) in a manual run and compares candidate recall and evidence quality with the old cards. The owner turned the research CronJobs on on 2026-10-19 before RS8 was run; notify stays suspended until the owner Telegram secret exists, and deepdive is manual. Details and pass levels are in the lane file.

## Open owner decisions

- Count `research_verified` like `verified_single` in the engine, or show it without points (RS4).
- Thresholds: daily watch triggers, review intervals, materiality limits, caps (all placeholders).
- CSPX ALLOCATION amount rule.
- Storing full third-party pages in the raw store.
- Public research cards after RS8 and G5.
