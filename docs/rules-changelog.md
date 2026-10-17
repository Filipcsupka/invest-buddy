# Rules changelog

The score rules version (`SCORE_RULES_VERSION` in `src/engine/score.ts`), the signal rules version (`SIGNAL_RULES.version` in `src/engine/signals.ts`) and the combined `RULESET_VERSION` (`src/config/rules.ts`) are listed here. Entries come from the commit history of those two constants. `src/config/rules.test.ts` fails when a rule value changes without a new version and a new entry.

`RULESET_VERSION` is `<score version>+<signal version>`. New rows in `record_snapshots` and `trade_ideas` carry it in `ruleset_version` (migration 085, nullable, no backfill, not shown publicly). `record_snapshots.rules_version` and `score_input_snapshots.rules_version` still hold the score version, `trade_ideas.rule_config_version` holds the signal version, and the daily fingerprint in `src/jobs/daily.ts` and `ideaSignature` do not use the combined string.

## Current

- `2026-10-11.2+2026-10-14.3`: first combined version. No rule change; it names the two versions that were already live (EN11).

## Score rules

- `2026-10-11.2`: partial and planned data count as no data (#142, EN45).
- `2026-10-11.1`: relative scoring against evidenced points (#140, EN45).
- `2026-10-10.1`: accumulation volume point fixed (#115).
- `2026-10-06.1`: first version, with the dated track record snapshots.

## Signal rules

- `2026-10-14.3`: `data_rule` and `verified_single` count as confirmed; ratings come from the Guide score rule hits (EN4, EN5, #177).
- `2026-10-11.1`: relative scoring against evidenced points (#140, EN45).
- `2026-10-10.1`: start and add thresholds clarified (#107, EN3).
- `2026-10-09.1`: START_POSITION needs score 18; 15 to 17 can qualify for ADD (#80).
- `2026-10-06.1`: signals from data only, size tiers instead of EUR bands.

## Horizon rules 2026-10-17.1
New, report only. Own version, not part of `RULES_SNAPSHOT`; scoring, status and `RULESET_VERSION` are unchanged. See `docs/horizon-rules.md`.
