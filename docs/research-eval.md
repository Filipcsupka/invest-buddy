# Research evaluation (RS8)

Status: not run. The offline harness is ready. The live run needs the owner's approval, and the RS5 CronJobs stay suspended until the owner signs this page.

The six old sample cards are in `src/research/fixtures/old-samples.json`: MRVL, GMAB, GFS, INTT, MEDCL, EOS.AX. The MRVL card has no day in the old sample file, so its date is empty. The other dates come from the sample window 2026-10-05 to 2026-10-11.

## How to fill it

1. After the manual runs, take the run ids: one `weekly_discovery` (as-of the day before the first sample date) and one `deep_dive` per ticker (as-of the card date).
2. Run `DATABASE_URL=... npm run research:eval -- <run id> ... [--max-tokens N] [--max-cost-usd N]`. It reads stored rows only.
3. Copy each result into the table. Where the script says "needs owner" or "not measured", leave it for the owner to fill by hand.

## Measures

| Measure | Run ids | Result | Pass level | Owner grade |
| --- | --- | --- | --- | --- |
| Candidate recall, discovery run: sample names that reach DISCOVERED or better without being named | | | at least 4 of 6 | |
| Trigger recall, deep dives: the sample's trigger found as a finding | | | 6 of 6 | |
| Trigger evidence: that finding verified on a primary source | | | at least 5 of 6 | |
| Quote failures: `quote_not_found` share of all evidence items | | | at most 10% | |
| Figures on cards that match a verified quote | | | 100% | |
| Social or unverified claims shown as facts | | | 0 | |
| Primary links per card, against the old card's links | | | not fewer on any card | |
| UNCONFIRMED marks on claims with one non-primary source | | | 100% | |
| Repeat alerts across two consecutive daily runs without material change | | | 0 | |
| Tokens and cost per run | | | within the RS5 caps | |
| Owner grade: card useful for a decision | | | at least 4 of 6 | |

## Notes on what the script can and cannot show

- Trigger recall matches a deep-dive finding by symbol and kind. The script prints the claim so the owner can confirm it is the trigger.
- The old cards' links are not stored, so the primary-link comparison and the owner grade are always "needs owner".
- Cost is checked only when the caps are passed on the command line. They are environment values, not stored rows.
- Repeat alerts need daily runs on two consecutive days. Without them the script prints "not measured".
- The date rule count is the evidence items in stored rows dated after their run's as-of day. Output the validator rejected is never stored, so it is not in the count.

## Result

Evidence items dropped by the date rule: not run

Run ids: not run

Cost: not run

## Sign-off

Signed: 

Date: 

## Claude quota-unknown override

The Anthropic usage endpoint can answer 403 (or fail), so the runner has no quota reading and records `skipped_quota`. To let Claude subscription runs go ahead anyway, set `RESEARCH_QUOTA_UNKNOWN_OVERRIDE=on`. Any other value, or unset, keeps the skip. It is off by default and the owner sets it.

It only applies when there is no reading. A reading above the stop levels still stops the run, and the kill switch, window, token caps and daily call cap are unchanged. Codex and API-key runs are not affected.

With the override on, a run also needs all of these to pass, counted from `ai_budget_calls`:

| Env | Default | Meaning |
| --- | --- | --- |
| `RESEARCH_OVERRIDE_RUN_CALLS` | 3 | model calls in one runner invocation (a weekly run uses 3) |
| `RESEARCH_OVERRIDE_DAILY_CALLS` | 2 | research calls today (Europe/Bratislava day) |
| `RESEARCH_OVERRIDE_MONTHLY_CALLS` | 20 | research calls this month |

The counts include every research call in the table, not only override runs, so the caps are conservative. If a count or cap value cannot be read, the run is skipped as `skipped_quota`. The `research-caps` report now returns `monthlyCalls`. The eval harness (`npm run research:eval`) reads stored rows only and is not affected.
