# Q4 2026 roadmap

Master plan for 2026-10-12 to 2026-12-31. Written 2026-10-09 from the four lane files in this folder (`lane-data.md`, `lane-web.md`, `lane-engine.md`, `lane-platform.md`), `docs/tasks-open.md`, and the vault notes `research/market-homework/130-positioning-and-business-model.md` and `99-lessons.md`. Task text lives in the lane files; this file decides order, owners and gates. Each lane file ends with a list of what the synthesis changed in it.

## Status

2026-10-10 08:30: weeks 1 and 2 of the first data wave are merged and live. Done: D1, D2, D3, D5, D6, D7, D8, D10, D12, D14, D15, D16, D17, D34, D42, EN1, EN36, PL1, W1, W2, plus the buy threshold PR #80 (EN2 decision default). Details and PR numbers are in the progress log under section J of `docs/tasks-open.md`.

## a) Summary

The owner decided on 2026-10-09 to use the 12 weeks to the end of the year for five things: collect as much market and fundamentals data as free or owned sources allow, so history accumulates; build features for the owner's own portfolio and for investing in general; finish the web so the free and paid tiers are ready; launch marketing and a waitlist at the end of the year; and consider paid market data once the waitlist has a meaningful size.

The lanes hold 178 tasks: D1 to D44, W1 to W45, EN1 to EN44, PL1 to PL45. Four are merged into others (W9 into PL14, PL33 into W7, PL42 into D8, EN21 into D6, D12, D14 and D15). 160 are scheduled in the window and 14 are planned after it.

What "ready" means on 2026-12-31:

- Data: raw SEC filings, fundamentals with filing dates, Form 4 trades, earnings calendar and EPS snapshots, score inputs, consensus history and price revisions are stored without expiry and keep growing; the universe has membership history and about 150 names; every stored row says where it came from and whether it may be shown.
- Owner features: the signal rules match the Guide or a signed ADR (ADR-006), and the private owner view shows sizing, holding-aware adds, allocation, drawdown, contribution, cash drag and fees from IBKR Flex data.
- Web, free tier and waitlist: the waitlist gate (section f) has passed and the owner has signed go or no-go. Marketing can start on the date the owner picks.
- Web, paid tier: login, entitlements, paywall gate, score history, alerts, account and data rights, Stripe in test mode and the go-live runbook are built and pass the paid journey test twice on staging. `BILLING` stays off in production.
- Operations: CI does not fail for outside reasons, backups run off the node with a tested restore, job failures alert the owner, the web uses a read-only database role, and a security review of the waitlist, auth and billing code is signed.

Out of scope in this window: legal sign-off (the lawyer's answers on BUY and ADD labels, sizing, the paid feed, refund and withdrawal wording), payment go-live (Stripe written approval and live keys, VAT registration, a data display licence), and customer acquisition beyond launching the waitlist and its marketing. Paid market data is evaluated after the waitlist has a meaningful size (D44, planned after the window).

## b) Owner decisions

One list, merged from all four lanes and ordered by the week in which the first task waits on the answer. "Needed in week N" means that task is scheduled in week N, so the answer is due by that Monday. Week 1 starts 2026-10-12.

1. Staging: where are auth, mail, billing and the waitlist tested? Options: local compose only; namespace `invest-staging` with its own small Postgres, noindex and basic auth (PL14); a staging namespace with only the web, using a second database on the prod Postgres (W9). Default: own namespace with its own Postgres, because magic links and Stripe webhooks need a public HTTPS host and a shared Postgres shares the prod failure domain (W9 risk). The cost is memory on the one worker (about 3.9 GB allocatable, PL facts). Unblocks PL11, PL14 and through them W4's DB-down test, W12, W27, W40, W43, PL17, PL20, PL39. Needed in week 1 (DNS record in week 3).
2. Merge gate: pay for GitHub Pro (branch protection) or GitHub Advanced Security? Options: Pro, GHAS, or the convention plus `scripts/merge-pr.sh` (PL7). Default: the convention and script with no spend, and record the CodeQL gap (PL36). Unblocks PL7, PL36. Needed in week 1.
3. Czech in this window? Options: yes, or EN and SK only. Default: EN and SK only, as the web lane assumes; Czech needs a translator (130 section 10, question 6). Fixes the scope of W13, W22, W23. Needed in week 1.
4. Spend cap for the window. Options: 0 EUR a month (lane DATA default), or a named monthly ceiling per item (backup storage, mail past the free tier, hosted analytics, GitHub Pro, Twelve Data Grow at 66 to 79 USD a month). Default: 0 EUR for data; name a ceiling only for backup storage and mail if their free tiers do not cover the need. D8 makes a paid source uncallable while its cap is 0. Unblocks D8 caps, PL22, W12, W19, PL7, PL36, D44. Needed in week 2.
5. Signal alignment (ADR-006, the six C5 decisions, PR #80). Options per EN2: BUY at 18; ADD at 15 (Guide section 8) or 18 (PR #80); count `data_rule` and `verified_single`; retire the private point tables; Guide EUR bands or the draft config; deep add and retest as ADD triggers. Default: the C5 recommendations with ADD at 15 as the Guide says, and merge PR #80 only after EN1 freezes today's behaviour. The Guide is the method, and EN1 needs the old behaviour to show a diff. Unblocks EN3 to EN11, PR #80, the START wording on W10 and W16 (130 section 10, question 7). Needed in week 2.
6. Backup target and who pays. Options: SFTP restic repository (the manifest expects one) or S3-compatible storage; prices unverified (PL22). Default: a target the owner already has, else S3-compatible storage under the decision 4 ceiling; keep the restic password in two places. Unblocks PL22, PL23, PL24, W44, D38. Needed in week 2, and before any email is stored (PL24).
7. IBKR Flex query: add Trades, Cash Transactions and lot detail? Owner action in the IBKR portal, query ID unchanged, then one redacted statement (EN12). Default: yes. Unblocks EN12, EN13, EN14, the realised part of EN17, EN19. Needed in week 2.
8. Retention: keep raw SEC filings forever and archive instead of delete? Options: archive (D5); a longer `expires_at`; keep deleting. Default: archive, and keep `invest-buddy-retention` suspended (it is, live 2026-10-09) until D5 is merged. The first documents expire on 2026-11-05 (lane DATA). Unblocks D5, D19, D38. Needed in week 3. The start-now PRs D2 and D3 do not wait on it; D5 does.
9. Advice-like output before the lawyer answers: the idea card's action, size tier and plan, `/sizing`, and state labels. Options: `ADVICE_OUTPUT` on or off at launch; a second flag for state labels. Default: off for the launch (web lane recommendation), and decide the second flag with W10. Unblocks W10, W13, W16, W21, W32, W37. Needed in week 3.
10. Track record windows: trading or calendar days for 1, 5, 20 and 60; benchmark SPY or CSPX; is a replay ever public? Default: trading days (D7 calendar), SPY because its bars are stored (CSPX coverage on the free plan is unverified, EN18), replay private until the lawyer answers (EN23). Unblocks EN27, EN28, the landing text in W16, W32. Needed in week 3.
11. Mail provider, sender address and DNS. Options: Resend (free 3,000 a month and 100 a day, EU region unverified), Amazon SES in an EU region (about 0.10 USD per 1,000, sandbox exit needed), Brevo (unverified). Default: Resend unless EU-only processing is required, then SES (W12). One provider for both lanes (W12, PL25). Unblocks W12, then W13, W14, W15, W27, W37, PL25. Needed in week 4, with SPF, DKIM and DMARC records in place.
12. Waitlist consent: launch notice only, or also the free weekly Slovak mail (130 section 9, step 6)? Default: two separate, versioned consent boxes, so the weekly mail never goes to people who agreed only to a launch notice (W38 risk). Unblocks W11, W14, W38. Needed in week 4 (draft wording; the lawyer checks it later).
13. Written permission requests and new free accounts. D42 drafts requests to Alpha Vantage, Cboe, Twelve Data, FINRA, Finnhub and GDELT. Default: send them as soon as the D42 drafts merge in week 3, because replies may take weeks (D42 risk); create a Massive free key only after reading its terms (D32); hold the Finnhub key and the FINRA credential (D29, D30 are after the window). Unblocks D32 and later D29, D30, D44. Needed in week 4.
14. Price chart and Twelve Data plan. Options: keep the chart of raw closes (licence risk, the free key is internal non-display), show a derived view, or hide it; buy Grow early or after the waitlist. Default: `RAW_SERIES_DISPLAY=off` (the D4 default) before marketing traffic, and no Grow before the waitlist unless D37 is wanted. Unblocks D4, W20, W21, D37. Needed in week 4.
15. Stripe: which legal entity holds the account, and ask for written pre-approval now? Default: open a test-mode account and start the pre-approval conversation in week 4, because Stripe lists investment and brokerage services as restricted (web lane terms table) and the answer is slow. Unblocks W40, W41, W42, W43. Needed in week 4 (request) and week 7 (test account).
16. Analyst estimates and Finnhub. Options: internal snapshots from Alpha Vantage now and a paid source later; ask Finnhub in writing; accept unknown. Default: Alpha Vantage snapshots for internal use (D27, D28); Finnhub only after a written yes, because the engine lane read its terms as no business use, even internal, without written approval. Unblocks D27, D28, EN41, and later D29. Needed in week 5.
17. Analytics. Options: Plausible CE self-hosted (AGPLv3, verified page), Umami (unverified), a hosted plan (price unverified), none. Default: Plausible CE self-hosted if node headroom allows (W4 and PL38 checks); otherwise none, using the W11 report's counts by source and price variant for the price test. Unblocks W19, W18, PL43. Needed in week 5.
18. Auth approach. Options: Better Auth with magic link, or a small hand-built magic link. Default: Better Auth behind `AUTH`, with the hand-built version as fallback if the pg adapter does not fit (W27). Unblocks W27, W28, W29. Needed in week 5.
19. Price, plan shape, free-tier numbers and trial. Options: one paid tier at 9.90 to 14 EUR a month on yearly billing, or about 29 EUR; a monthly plan; the N values for free score history, scanner rows, watchlist size and alerts. Default: one paid tier, test 9.90 against 14 EUR on the waitlist through W11's `price_variant` (130 section 9, step 4). No source gives the N values, so the owner sets them; placeholders stay marked in `src/config/plans.ts` until then. Unblocks W17, W30, W32, W33, W34, W36, W38, W42. Needed in week 6.
20. Ops alert channel. Options: email through the W12 mailer, Discord (a bot secret exists in namespace `ai-agent`), Telegram, push. Default: email through W12, so there is one provider and one secret. Unblocks PL25, PL27, PL28, PL40. Needed in week 6.
21. Universe widening. Options: approve the D35 criteria (placeholders), 150 names, 300 names, and whether new 20-F filers count. Default: approve 150 for week 7; 300 only if the D38 storage figures and the Twelve Data request math hold (301 requests a night needs a split job or Grow, D37); add no new 20-F filers until D18 shows their coverage (D18 risk). Unblocks the D35 list review, D36, D37. Needed in week 6 (criteria) and week 7 (name list).
22. Operator identity: company or person, IČO, address, contact, data controller. No default; only the owner can supply it. Unblocks W18, PL43, W26 preflight, W45. Needed in week 7.
23. Native Slovak reviewer: who, paid or not. Default: one reviewer for W23 and EN33 step 4, given the glossary first. Unblocks W23, EN33 step 4. Needed in week 7.
24. Trial and refund. Options: a card-free trial that falls back to free, or none; a 30-day refund line against the EU withdrawal rules (lawyer). Default: build the trial as an entitlement that stays off, keep refund text marked draft until the lawyer answers (W42). Unblocks W42. Needed in week 8.
25. Macro thresholds and the VIX fallback (tasks-open D1b). Options: thresholds for yield change, VIX and rotation; unknown handling; RV20 from SPY bars if Cboe says no. Default: build the RV20 switch with today's default unchanged (D25), and choose thresholds from EN40's table of how often each setting is true. Unblocks D25, EN40. Needed in week 8.
26. Availability target until paid users exist. Default: accept a restore from backup after a node loss, with RTO and RPO taken from PL24's measured timings. Unblocks PL38. Needed in week 9.
27. Claude subscription for the nightly jobs. Options: keep the subscription token, or budget an API key. Default: no change in the window; the owner reads the terms through PL41 before any paid launch and names which account runs the jobs. Unblocks PL41. Needed in week 10.
28. Waitlist launch date and change freeze. Default: go or no-go at the earliest on 2026-12-18 after the waitlist gate, then the owner picks the launch day (PL45 step 2). Needed in week 10.
29. Verification policy for key fields (second extractor pass). Default: keep `verified_single` and prefer deterministic sources (EN30 risk); EN30 is after the window. Not needed in the window.
30. Pre-revenue profile (PCVX-type names). Default: out of scope in the window (EN43 after the window). Not needed in the window.

## c) Start now

These need no owner decision and lose history for every week they wait. Each line names the first PR.

1. Retention stays suspended and archives instead of deleting. First PR: D2, branch `d2-data-sources`, migration `data_sources` with seed rows and `src/data/sources-registry.ts`. Then D3 in week 2 and D5 in week 3, merged before 2026-11-05 when the first documents reach `expires_at`. No infra change is needed: `invest-buddy-retention` is suspended live (read 2026-10-09). D2 and D3 need no decision; D5 needs decision 8.
2. Point-in-time storage. First PR: D6, `docs/adr-point-in-time.md`. Then D15 (consensus history trigger) in week 2, D12 (price revision log) and D14 (score input snapshots) after D3. Today a same-day rerun overwrites `consensus_findings`, `score_results` and `daily_bars`.
3. Security master and universe membership history. First PR: D10, `instrument_ids` seeded from SEC `company_tickers.json` (week 2, after D2). Then D11 seeds membership as of 2026-10-09 in week 3.
4. Raw snapshots, earnings calendar and EPS history. First PR: D8, `api_usage` and `src/data/usage.ts` (week 2). Then D17 raw store (week 3), D27 and D28 (week 5). The Alpha Vantage Saturday job is scheduled from 2026-10-10 but keeps only the newest quarter.
5. Fundamentals and filing archives. First PR: D34, the resumable backfill runner (week 3). Then D18 companyfacts (week 4), D19 filings back to 2023-10-01 (week 5), D20 Form 4 (week 6).
6. Universe widening. First PR: D35, `docs/universe-criteria.md` and `scripts/select-universe.ts`, which only writes a CSV for review (week 6, after D23). D36 adds the approved 150 names in week 7.
7. Discovery history. First PR: EN36, the MA200 pre-screen in `src/jobs/discovery.ts` (week 1). Then EN37 stores every screened name and its reason each week (week 2); today non-passes exist only in Job logs.
8. Golden fixture before any rule change. First PR: EN1, `scripts/export-golden.ts` and `src/engine/golden.test.ts` (week 1), before PR #80 or EN3 merge.

Also in week 1, because most other work waits on them: PL1 (CI pull failures), PL5 (deploy check), PL7 (workflow rules and migration numbers), PL15 (migration lint), W1 (flags), W2 (shared pool), W3 (performance baseline).

## d) Schedule

Seven agent streams on non-overlapping files: two data agents (DA, DB), three web agents (WA waitlist, WB paid tier, WC billing and support from week 4), one engine agent (EN) and one platform agent (PL). A stream is an agent seat, not a lane: a stream takes another lane's task when its files are free.

Sizing uses the lane scale (S 0.5 to 1 day, M 2 to 4, L 5 to 10). Each agent-week holds at most 5 days at the lower bound. The 160 scheduled tasks total 245 agent-days at the lower bound and 490 at the upper bound, against about 335 agent-days of seats in weeks 1 to 10 (six seats from week 1, the seventh from week 4). So the plan fits if tasks land near the lower bound; if they run longer, the cut list in section g is used in order. Weeks 11 and 12 hold only the paid journey and buffer, because of the holidays.

Markers: (C) critical path to the waitlist gate, (P) critical path to paid-ready, (H) history deadline. Owner decision numbers refer to section b.

| Week | DA | DB | WA | WB | WC | EN | PL | Owner |
|---|---|---|---|---|---|---|---|---|
| 1, 10-12 to 10-16 | D2 (H), D6 | D7, EN36 | W1, W3, W2 | W22 | | EN1, EN2, EN32, EN15, EN16, EN44 | PL1, PL5, PL7, PL15, PL11 (C, P) | decisions 1 to 3; old cards for EN44 (F9) |
| 2, 10-19 to 10-23 | D3 (H), D1 | D8, D10, D15 | W4, W5, W6 | W8 | | EN3, EN4, EN12, EN37 | PL2, PL4, PL9, PL22, PL30, PL31 | decisions 4 to 7; sign ADR-006; backup secrets |
| 3, 10-26 to 10-30 | D5 (H), D17 (H) | D34, D11, D42 | W10, W7 | PL43 | | EN5, EN11, EN27 | PL14 (C, P), PL18 | decisions 8 to 10; staging DNS |
| 4, 11-02 to 11-06 | D18 (H) | D4, D16 | W12 (C, P), W11 | W20, W21 | PL10, PL12 | EN28, EN31 | PL19, PL23, PL8, PL6 | decisions 11 to 15; mail DNS; D42 letters; Stripe request |
| 5, 11-09 to 11-13 | D19 | D22 (H), D27, D28, D23 (H) | W13 (C), W19 | W27 (P), W28 (P), W30 | PL13, PL44 | EN9, EN6 | PL24, PL26, PL35 | decisions 16 to 18 |
| 6, 11-16 to 11-20 | D20, D12 | D35 (H), D24 | W14 (C), W15, W17 (C) | W29 (P), W33 | PL32, PL36 | EN7, EN13, EN41 | PL16, PL25 | decisions 19 to 21; approve the D22 13F run on 2026-11-20; interviews start |
| 7, 11-23 to 11-27 | D38, D36 (H) | D21, D40 | W16 (C), W18 | W31 (P), W34 (P) | W40 | EN33, EN10 | PL17, PL27 | decisions 22, 23; approve the 150-name list; Stripe test account |
| 8, 11-30 to 12-04 | D14, D43 | D25, D26, D41, EN22 | W24 (C), W23, W26 (C) | W36 (P), W32 | W41, W42 | EN14, EN17, EN34 | PL20, PL29, PL28 | decisions 24, 25; role secrets for PL20 |
| 9, 12-07 to 12-11 | D13, D37 | D9, D39 | W25, PL39, PL34 | W37 (P) | W35, W44, PL38 | EN18, EN19, EN40 | PL37 (C, P) | decision 26; read and sign PL37 findings |
| 10, 12-14 to 12-18 | buffer | D32, D31 | buffer, waitlist soak | W38 (P), W39 (P) | buffer | EN20, EN23, EN35, EN42 | PL21, PL40, PL41, PL45 (C) | decisions 27, 28; go or no-go on the waitlist gate |
| 11, 12-21 to 12-25 | buffer | buffer | launch support | buffer | W43 (P), W45 (P) | buffer | buffer | sign W45 paid-ready review |
| 12, 12-28 to 12-31 | buffer | buffer | launch support | buffer | buffer | buffer | buffer | marketing launch on the chosen date |

Critical paths:

- Waitlist gate: decision 1, PL11, PL14, W12, W13, W14, W17, W16, W24, W26, PL37 (first pass on W11, W14, W15), PL45. D2, D3 and D5 feed W11 with one week of slack.
- Paid-ready: PL14, W12, W27, W28, W29, W31, W34, W36, W37, W38, W39, W43, W45. W34 sits on it only because W36 reuses its URL state for saved screens. The full PL37 pass in week 9 and W44 in week 9 must also be done before W45.
- History: D5 before 2026-11-05; D22 built before its fixed run on 2026-11-20; D36 (150 names) in week 7.

Planned after the window (2027): D29, D30 and D33 (wait on written terms), D44 (paid-data harness, after the waitlist), EN8, EN24, EN25, EN26 and EN29 (replay and tuning need more history), EN30 (decision 29), EN38 and EN39 (thesis notes and the review cadences), EN43 (decision 30), PL3. Together 34 to 68 agent-days. D44 is the first to pull in if week 11 or 12 is free.

## e) Parallelism rules

- One writer per file at a time. Two streams may work in the same week only when their PRs touch different files. A task whose files are held by an open PR waits or rebases after that PR merges.
- Migrations: the numbers in the lane files are placeholders. The PR takes the next free number when it opens and names it in the title (PL7). PL15's lint fails duplicate or skipped numbers. Two open PRs with the same number: the later one renumbers before merge.
- Infra repo and the `deploy/gitops` mirror: one infra PR at a time, applied by the owner (PL2, PL14, PL17, PL20, PL21, D40 and every new CronJob, W4).
- These files are sequential, in this order. When two of them land in the same week, the one listed first merges first and the other rebases:
  - `src/jobs/retention.ts`: D5, W11, PL26, PL44.
  - `src/jobs/cronjob-order.test.ts`, `package.json` (`build:jobs`), `Dockerfile` and `scanner/Dockerfile` COPY lists: one new job at a time (D34, D16, EN28, D40 slots, PL27, W37).
  - `src/config/flags.ts`: W1 first; then W10, D4, PL32 add entries.
  - `src/db/pool.ts`: W2, then PL18.
  - `src/db/prices.ts`, `src/jobs/prices.ts`, `src/data/twelvedata.ts`: D3, D8, D12, D9, EN22. D3 and D8 share week 2 in different streams; D8 merges after D3.
  - `src/collectors/edgar.ts`: D19, D20, EN42.
  - `src/engine/signals.ts` and the golden file: EN1, PR #80 folded into EN3, EN4, EN5, EN9 (one stream).
  - Track record page and `src/track-record/measure.ts`: EN27, EN28, then W32.
  - Company page: W10, D4, W20, W33, W32.
  - `src/proxy.ts`: W6, W10, W29, W34.
  - `.github/workflows/build.yml`: PL1, PL15, W8, PL13, PL16.
  - `scanner/run-judge.mjs` and `scanner/prompts/`: W22 creates the glossary in week 1; then EN32, EN31, EN33, EN34.
  - `src/i18n/messages.ts`: many tasks add keys. Parallel work is allowed, but each PR rebases before merge and the parity test must pass. Merges go one at a time.
  - `docs/tasks-open.md`: each PR adds only its own status line in section J and rebases; PL8 later splits the file.
- Safe to run in parallel: data collectors on different sources and tables; engine pure modules (`src/portfolio/*`, `src/engine/owner-overlay.ts`); web pages in different route folders; platform scripts under `scripts/` and docs.

## f) Gates

### Waitlist gate (W-gate), target week 10

All lines need a proof link (PR, test, log or doc) and a date in the PL45 checklist. A line for a task that was cut becomes a signed accepted risk.

- CI green on main without Docker Hub failures (PL1); staging soak passed (PL14).
- `/api/live` and `/api/ready` in use, probe split live, replica decision applied (W4); app rate limits and headers on (W7); Traefik limits (PL34) or a signed accepted risk.
- `ADVICE_OUTPUT` in the state chosen in decision 9, with the banned-phrase test green on EN and SK pages (W10).
- Waitlist double opt-in passes end to end on staging with the fake mailer (W11, W14, W15, W8); no email in logs.
- Real mail: SPF, DKIM and DMARC pass on a staging send (W12); EN and SK templates (W13); native Slovak review signed (W23).
- Landing and pricing live with one price everywhere and the waitlist button (W16, W17); analytics events or the W11 counts (W19); ticker sitemap and structured data (W20); Open Graph images (W21); axe shows zero serious or critical issues (W24); design audit filed (W25).
- Privacy notice and operator disclosure live, marked draft until the lawyer signs (W18, PL43); export and deletion path tested (PL44).
- Last restore test within 14 days (PL24); alert test within 7 days (PL27, PL28).
- Web on the read-only role and jobs on `jobs_rw` (PL20, PL21).
- Security first pass on the waitlist routes with zero open HIGH findings (PL37); secrets inventory current (PL30).
- Load numbers known (PL39); AI ceiling set and quota plan written (PL40, PL41).
- `scripts/preflight.mjs` passes on staging and prod (W26); launch drill done with timings (PL45); owner signs go or no-go.

### Paid-ready, target week 11

- W27 to W45 merged, each with its tests; no [PAID] task open without an owner and a reason (W45 review table).
- `e2e/paid-journey.spec.ts` passes twice in a row on staging (W43), and a flag-off run shows unchanged public behaviour.
- In production `AUTH`, `PAYWALL` and `BILLING` are off and verified (PL32, PL45); billing routes return 404 and refuse live keys in test mode (W40).
- Full PL37 review of auth and billing with zero open HIGH findings, signed by the owner.
- A restore that includes the user tables has been tested (W44).
- `docs/go-live-paid.md` signed (W45). It lists the pre-conditions outside this window: lawyer answers (tasks-open G5), data display licence, Stripe written approval and live keys, operator identity, VAT registration with an accountant, backups tested.

### What the owner must do, with dates

- By 2026-10-12 (week 1): decisions 1 to 3; supply the old EFXT, PCVX and WULF cards (EN44, tasks-open F9).
- By 2026-10-19 (week 2): decisions 4 to 7: spend cap, sign ADR-006, pick the backup target and seal `invest-buddy-backup-secrets` (PL22), extend the IBKR Flex query and hand over one redacted file (EN12).
- By 2026-10-26 (week 3): decisions 8 to 10; staging DNS record (PL14); book the lawyer session from 130 section 9, step 1 (answers are not needed in the window, but the questions are).
- By 2026-11-02 (week 4): decisions 11 to 15: mail provider signup, API key as a sealed secret, SPF, DKIM and DMARC records (W12); send the D42 permission requests once the drafts are merged; open the Stripe test-mode account and ask for written pre-approval (W40); confirm `SEC_USER_AGENT` carries a monitored contact address (lane DATA, unverified).
- By 2026-11-09 (week 5): decisions 16 to 18.
- By 2026-11-16 (week 6): decisions 19 to 21; start the 10 persona interviews from 130 section 9, step 5 (XTB, Trading 212 or Revolut users holding US stocks), so the answers arrive before the launch.
- By 2026-11-23 (week 7): decisions 22 and 23; approve the 150-name list for D36; Stripe test account ready for W40.
- Weeks 8 to 10: decisions 24 to 28; approve each live migration and new CronJob as it lands (lane DATA rule: cluster writes need the owner); seal the role URLs for PL20; read and sign the PL37 findings.
- 2026-12-18: go or no-go on the waitlist gate.
- Week 11: sign the paid-ready review (W45).
- Spend: within decision 4. New secrets expected in the window: mail API key (W12), `invest-buddy-backup-secrets` (PL22), DB role URLs (PL20), `invest-buddy-billing` and the webhook signing secret in test mode (W40, W41), staging secrets (PL14), `MASSIVE_API_KEY` (D32). `FINNHUB_API_KEY` and a FINRA credential wait until after the window.

## g) Risks and the cut list

Risks:

- Owner time is the bottleneck. Every migration, new CronJob and infra change is a cluster write that the owner approves and applies; lane DATA alone proposes about 20 migrations (placeholders 022 to 041).
- One worker node: 2 CPU, about 3.9 GB memory, CPU limits at 132% of allocatable (PL facts). Staging, a second web replica, self-hosted analytics and more jobs all compete for it.
- No backup exists until PL22 to PL24 (weeks 2 to 5), while the plan starts storing history that cannot be rebuilt.
- No alerting until PL25 and PL27 (weeks 6 and 7); monitoring pods in the cluster are Pending (PL facts), so a failed job stays silent until then.
- Twelve Data free plan: 800 requests a day and 8 a minute, shared by prices (37 a night), discovery, the cross-check and the widening (151, then 301 a night). D8 guards it.
- Licences: the Twelve Data free key is internal non-display while the company page plots closes; Alpha Vantage is personal non-commercial use; Cboe needs a signed licence (lane DATA terms table).
- The lawyer may not answer before the launch; the waitlist then launches with draft legal pages and `ADVICE_OUTPUT` off (W26 risk).
- Stripe may refuse or restrict the business (W40 risk). The paid tier can be ready but not launchable.
- Automated use of the Claude subscription for a paid product is unchecked (PL41).
- Thin history: score history starts 2026-10-02 and the record on 2026-10-06, so score history and 60-day outcomes look sparse at launch (W33, EN28).
- Effort: at the upper size bound the scheduled work is about twice the seat time.
- Open PRs #80 (score 18 for buys) and #82 (EN/SK presentability) touch files in EN3 and W22.

Cut list, in the order to cut if time runs short:

1. D37 (300 names). Keep 150; 300 needs a split price job or Grow.
2. PL34 (Traefik limits and headers). W7's app limiter and headers stay.
3. PL13 (DB-mode e2e). W8's fixture-mode e2e stays.
4. PL28 (external uptime check). The in-cluster watchdog stays.
5. PL39 (load baseline). Becomes an accepted risk line in PL45.
6. W35 (CSV export). Also needs a legal answer on redistribution.
7. W34 (scanner filters). W36 then ships the watchlist without saved screens, which also shortens the paid critical path.
8. PL38 and PL36 (right-sizing and scheduled scanning).
9. D32, D9 and D31 (second price source, adapter interface, news). No paid trial is planned before 2027.
10. EN42 and EN44 (424B5 and readout inputs, old-versus-new comparison).
11. EN35 (cheaper AI flow).
12. W25 (design polish) shrinks to the waitlist pages only.
13. EN20 (owner page wiring). The analytics modules EN15 to EN19 stay testable without the page.

Never cut: D2, D3, D5, D17, D18, D19 (history), W10 to W18 and W26 (waitlist), PL19 to PL24 (roles and backups before emails are stored), PL37, PL45, W43, W45.

## h) How we work

- One task per PR. One agent per task, in its own Orca worktree, never two writers on the same files. Branch `<task-id>-<slug>`; the PR title starts with the task ID (PL7).
- Every PR states its acceptance proof: the tests that cover the acceptance lines and, for live behaviour, the check that was run. No merge without it. Migrations, `.github/`, `deploy/`, auth and billing paths need an independent review label before merge (PL7); PL35 is the checklist for auth and billing.
- PR and commit text is short and plain, says what changed, and carries no AI attribution. Durable docs go through the humanizer pass.
- After each merge: add one status line for the task in `docs/tasks-open.md` section J and in the ops-brain `projects/investing-platform/STATUS.md`, with the PR number and the live proof.
- Deployment: merge to main builds the images and pins the tag in infra (tasks-open A1). The live proof is the deploy check (PL5's `scripts/verify-deploy.sh` once merged; until then the checks in tasks-open H8) plus the task's own live check on https://invest.filipcsupka.online. Cluster writes (live migrations through the web init container, new or unsuspended CronJobs, one-off Jobs, secrets) wait for the owner's approval.
- Local Node is broken on the owner's Mac (STATUS lessons); use CI, or PL9's container script once it exists.
- The lane files are the task source. When a task changes scope, edit its lane file in the same PR and add a line to that file's "Changes by the synthesis" list.
