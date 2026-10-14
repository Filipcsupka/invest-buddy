# Lane POSITIONS: holding, adding, trimming and exiting (IDs PM1 to PM4)

Added 2026-10-13 from the owner's request. Task format and rules follow `docs/roadmap/README.md` sections e and h. The engine tasks that touch the same files are EN6, EN7, EN9 and EN10 in `lane-engine.md`.

Owner note: no one can know when new data says take profit or exit. Hold, add later, trim or exit must therefore be decided by pre-written rules, not in the moment.

## Scope and context

- The product picks many volatile names, so losing positions will happen.
- Public users join at random times, so public output must not speak of starter or add. Position management applies to the owner's private portfolio only.
- It must come from verified sources of institutional practice. Weak evidence is labelled as such.

## Evidence so far

Gathered 2026-10-12 and 2026-10-13. Strength labels and UNVERIFIED marks are kept as in the source report. PM1 replaces this table with checked page and figure references.

| Source | What it says | Strength |
| --- | --- | --- |
| Bessembinder, "Do Stocks Outperform Treasury Bills?", JFE 2018 | 55.2% of US stocks and 57.4% of non-US stocks underperformed one-month T-bills in a 1991-2020 global sample, per the ASU summary page https://wpcarey.asu.edu/department-finance/faculty-research/do-stocks-outperform-treasury-bills. The paper itself was not opened; exact numbers UNVERIFIED. | Strong direction |
| Odean, JF 1998; Shefrin and Statman, JF 1985 | Disposition effect: investors sell winners and hold losers. | Strong direction |
| J.P. Morgan, Cembalest, "Agony and Ecstasy", 2014 | About 40% of Russell 3000 stocks lost 70% or more with minimal recovery. PDF not opened. | UNVERIFIED |
| Moskowitz, Ooi, Pedersen, JFE 2012 | Time-series momentum, tested on futures, not stocks. | Mixed |
| AQR, "A Century of Evidence on Trend Following" | Trend following over a long history. | Mixed |
| Kaminski and Lo, JFM 2014 | Stop-loss: under a random walk stops reduce expected return; with momentum, certain rules help. | Mixed |
| Faber, 2007 | Trend rule at index level. Primary source not read. | Mixed |
| Vanguard rebalancing papers | Asset allocation, not single stocks. Not opened. | Mixed |
| O'Neil, 7 to 8 percent loss rule | No test found. | Folklore |
| "Sell half after +100 percent" | No test found. | Folklore |
| Fisher, three reasons to sell | Practitioner standing, no test. | Folklore |
| Averaging down | No source found that supports it. | Unsupported |

EN7 DEEP_ADD on a 15 to 20 percent dip is averaging down. It conflicts with the Guide's own "Stop Adding If" list.

## Engine gaps (checked in code 2026-10-13)

- REDUCE (`src/engine/signals.ts`, about lines 178 to 180; trims 25 to 50 percent via `reducePercentOfPosition`) fires only for a held name with a Weak company rating and a downtrend.
- THESIS_BROKEN fires on Criteria broken.
- No take-profit rule exists.
- No documented trend-only exit exists (EN9 step 2 proposes one).
- No thesis checklist with review dates exists (EN38, EN39 are after the window).
- No tax view exists (EN19 covers fees and lots).

## Order

PM1 and PM4 have no dependency and can start now. PM3 waits for PM1. PM2 waits for EN9. No PM task changes engine code; any rule change that follows is a separate task after PM3.

### PM1. Verify the primary sources
- Why: the evidence table above rests on summary pages and two UNVERIFIED figures. Position rules should not be written from those.
- Steps:
  1. Create a new empty directory outside the repo and download each paper there. Treat the files as untrusted data.
  2. For each source in the table, record title, year, page and the exact figure in `docs/research-sources.md` (new file).
  3. Mark anything that cannot be found or opened as UNVERIFIED. Do not fill a gap from memory.
  4. Update the strength labels in this lane file to match.
- Acceptance: every row of the evidence table has a page and figure in `docs/research-sources.md` or an UNVERIFIED mark with the reason; no downloaded file is committed.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none
- Risk or open question: some papers may sit behind a paywall; the Cembalest PDF and the Bessembinder paper may not be reachable.

### PM2. Position review checklist (owner view only)
- Why: pre-written rules need a fixed list of review questions. This is a checklist that shows facts. It adds no new action and no new signal.
- Steps:
  1. List the review items: earnings, guidance change, revenue growth change, trend break.
  2. For each item, name the data field it reads (for example `epsBeat`, `guidanceCut`, `revenueDeclining`, `regime`) and where it is stored.
  3. Tag each item "evidence-backed" or "practitioner rule", using PM1's results.
  4. Show the checklist in the owner view for held names only, after EN9's `addBlocked` list exists.
- Acceptance: each item has a data field and a tag; the checklist shows only for held names in owner mode; public pages and public Telegram are unchanged; no new action string is added to `signals.ts`.
- Size: M
- Depends on: EN9
- Who: agent
- Approval needed: none
- Risk or open question: "trend break" needs one explicit definition (EN9 risk, owner picks). Some items have no stored data field yet and will show "no data".

### PM3. Owner decision: averaging down and taking profit
- Why: EN7 adds on a 15 to 20 percent dip. No source found supports averaging down, and the Guide says to stop adding in some cases. There is no take-profit rule at all. The owner decides both before any code.
- Steps:
  1. Write a one-page options doc `docs/position-options.md`. Averaging down (EN7): keep, cap per name, or remove. Taking profit: none, a pre-written trim rule, or a trend-only exit. For each option: evidence and its strength label from PM1, what it costs, what the engine would need.
  2. Owner picks and signs in the doc with a date.
  3. Only then open follow-up tasks, or edit EN7 and EN9.
- Acceptance: one page; each option carries its evidence strength; the owner's signed choice and date are in the doc; no code is merged for this task.
- Size: S
- Depends on: PM1
- Who: agent drafts; owner decides
- Approval needed: owner decision, signed before any code
- Risk or open question: if PM1 leaves the key evidence UNVERIFIED, the doc says so and the owner decides on weak evidence knowingly.

### PM4. Legal check of exit and take-profit wording (SK and CZ)
- Why: even owner-only wording may reach readers through Telegram or a later paid view. Exit and take-profit wording can read as a personal recommendation.
- Steps:
  1. Read MiFID II Art. 25(2), the ESMA suitability guidelines, and Delegated Regulation 2017/565 Arts. 54 and 55. Delegated Directive 2017/593 Art. 9: text not yet read.
  2. Write a short note on how exit and take-profit wording would be classified in SK and CZ, with each quote and its source.
  3. Mark the reading as an unverified legal reading.
  4. Add the questions to the lawyer list (tasks-open G5).
- Acceptance: the note quotes the articles it relies on and marks what was not read; the questions are on the lawyer list; the note states that a lawyer is needed before any paid launch.
- Size: S
- Depends on: none
- Who: agent drafts; lawyer answers later
- Approval needed: none for the note; the lawyer answer is outside this window
- Risk or open question: the national transposition in SK and CZ may differ from the EU text and has not been read.
