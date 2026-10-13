# Task board

Updated 2026-10-11 night. One table per state. A PR that finishes a task moves it to Done in the same PR or the next status PR; "implemented" means merged with CI green. Live notes say what was checked on the cluster. Detail per task is in the lane files and in `docs/tasks-open.md` section J.

## Done (merged, CI green)

| ID | What | PR | Live check |
| --- | --- | --- | --- |
| DOC1 | Architecture diagrams and system map | #160 | docs only |
| D11 | Universe membership history | #110 | migration 043 applied |
| D18 | SEC companyfacts history | #109 | migration 034 |
| D20 | Form 4 transactions and backfill | #118 | backfill run 2026-10-11: 45,999 rows, 35 tickers |
| D20b | Insider flag computed from stored Form 4 | #129 | 34 tickers have `insider_net_buy_90d` |
| D21 | 13D, 13G and 8-K holder events | #128 | migration 047 applied, job suspended |
| D22 | 13F quarterly holdings job | #148 | migration 050, job suspended, first run planned 2026-11-20 |
| D27 | Earnings calendar snapshot | #117 | migration 046, job suspended |
| D31 | News sources, GDELT hardening | #108 | migration 042 |
| D35 | Universe criteria and selection script | #146, #157 | script only |
| D43 | History read model | #116 | used by W33 |
| D10 refresh | Security master refresh in the image | #130 | run once: 36 of 37 CIKs filled |
| EN3, EN27, EN40 | Thresholds, outcomes at 1/5/20/60 days, macro inflation | #107, #120, #113, #122 | |
| EN45 | Relative scoring, planned and partial data count as no data, rules version in the daily fingerprint | #140, #142, #149 | recompute 2026-10-11: 4 Setup, 12 Watch, 7 Wait, 7 Ignore, 6 Broken |
| EN46 | Score shown as percent of core rules, catalyst as separate bonus, methodology EN+SK | #169 | no engine, weight or stored audit change |
| ST0 to ST3 | Status slider: design spec, engine module, slider and company header, dashboard rows and legend | #134, #133, #136, #137 | slider live on the company page |
| ST5 | Catalyst rule from stored 8-K text | #139 | |
| ST6 | Revenue acceleration from stored SEC facts | #138 | |
| ST7 | Honest source labels, planned data | #141 | |
| AL1 | Telegram event alert per ticker | #132 | digest live Tue to Sat 07:30 |
| AL2 | Weekly Telegram summary job | #135 | test post sent, CronJob suspended |
| AL3 | Telegram idea card (public and owner mode) | #156 | default mode public |
| SK1 | /insiders page EN and SK | #127 | live with real rows |
| DS1 | Discovery filters, weekly candidates post, promote script | #158 | discovery CronJob live Saturday 09:30 |
| W6 | Error pages and request id | #152 | |
| W10 | Advice-like output behind `ADVICE_OUTPUT` | #121 | |
| W20 | SEO, sitemap, JSON-LD | #153 | |
| W22 | EN and SK copy audit, glossary | #154 | |
| W24 | Accessibility and mobile checks | #155 | |
| W25 | Design polish pass | #151 | |
| W33, W34 | Score history, scanner filters | #123, #111 | |
| PL46, SEC1 | Cheap CI, local security scan script | #143, #144 | first manual Security run passed |
| D19 | Filing archive with 3-year backfill | #147 | migration 051; CI green, live backfill not run |
| D24 | Macro observations FRED and Treasury | #150 | migration 049 |
| W7 | Security headers and rate limit | #145 | no migration |
| RS0 | Research engine spec, ADR, lane RS, schema | #161 | docs, schema, types |
| RS1 | Researcher runner and prompts | #163 | not run live |
| RS2 | Source verifier | #162 | not run live |
| RS3 | Research tables and pipeline state machine | #164 | migration 052 |
| RS4 | Judge integration and fact feed | #165 | migration 053 |
| RS5 | Research CronJobs, caps and kill switch | #167 | jobs suspended, owner unsuspends after RS8 |
| RS6 | Private research cards, materiality and owner page | #166 | not run live |
| Telegram | Channel, sealed secret, digest unsuspended | infra #37 to #41, #126 | first alert sent 2026-10-10 |

## Open (added 2026-10-13)

| ID | What | Depends on | Gate |
| --- | --- | --- | --- |
| EN47 | Setup threshold at 18 points (78.3%) and a Partial tier at 15; reachable maximum | EN40, EN46, D1b | owner written sign-off before code |
| EN48 | Position tiers and owner-mode actions; public output stays state only | EN47 | owner approval |
| PM1 | Verify primary sources for position rules | none | |
| PM2 | Position review checklist, owner view only | EN9 | |
| PM3 | Owner decision on averaging down and taking profit | PM1 | owner decision signed before code |
| PM4 | Legal check of exit and take-profit wording, SK and CZ | none | lawyer before any paid launch |

Detail: `lane-engine.md` (EN47, EN48) and `lane-positions.md` (PM1 to PM4).

## In progress

| ID | What | State |
| --- | --- | --- |
| RS7 | Codex adapter and secret | adapter code done (`scanner/research-adapters.mjs`, strict schema, quota and call caps, fake-binary tests); auth path and PVC/secret still waiting for the owner, not done |
| RS8 | Evaluation on the six old cards | offline harness done (fixture, `scripts/research-eval.ts`, `docs/research-eval.md`); live run waits for owner approval, not done |

## Queued, in order

1. RS8 live run on the six old cards (offline harness is in; RS0 to RS6 are merged). RS7 adapter code is in; its auth path and secret wait for the owner.
2. Web: W5 page cache, W3 performance baseline, W21 OG images, W23 native Slovak review, W32 tier map, W35 CSV export.
3. Engine: EN4, EN5, EN28.
4. Data: D36 roll out 150 names (after D35 criteria), D26 FX, D28 EPS history, D13 corporate actions.
5. Infra sync: copy the new suspended CronJobs from the app mirror to infra (D19, D22, D35, DS1 if they add any) and un-suspend one by one after a test run, with owner approval.
6. Last: membership, billing, client work (W27 to W45) stay deferred by owner decision.

## Waiting on the owner

- `TELEGRAM_CARD_MODE=owner` for the private channel (action word and EUR band).
- A private research page password (`OWNER_RESEARCH_PASSWORD`) alongside `OWNER_VIEW=on`; the page challenges the owner before showing facts.
- Weekly summary CronJob: un-suspend after the format is approved.
- Research runner: Claude first, OpenAI token later through a sealed secret; Anthropic terms for unattended runs on a subscription token to be decided before any schedule.
- GDELT daily collect (infra CronJob suspended).
- Notes for ops-brain from the capture ledger (PR #80 status mismatch, W10 allowlist lesson, GitHub billing incident).
