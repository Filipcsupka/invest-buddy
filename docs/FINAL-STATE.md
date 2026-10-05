# Pipeline state

The collector stores EDGAR filings, earnings exhibits, RSS items and computed facts. Twelve additional sources run by explicit `--source` selection without API keys: `frames`, `getcurrent`, `13f`, `openfda`, `clinicaltrials`, `usaspending`, `fed`, `treasury`, `bls`, `vix`, `gnews`, and `gdelt`. `collect:ping` checks source responses without a database write. Migrations 007 through 010 add source documents and facts, CUSIP mapping, extraction runs, judge runs, trade ideas and the portfolio baseline.

The extractor reads bounded keyword windows from stored text, checks cited quotes, and posts the scan payload. `CARRY_FORWARD=on` carries unchanged findings within their freshness windows. The judge receives reconciled facts and chart numbers; code fixes each action, amount band and rating through `SIGNAL_RULES`, while the model writes the text. The ideas page returns 404 unless `IDEAS_PAGE=on` or `DATA_MODE=fixture`. ADR-001 still limits public output to informational screening.

## Run locally

Use `npm run migrate` before jobs that write to Postgres. Set `DATABASE_URL` for database jobs and `SEC_USER_AGENT` with a real contact address for SEC requests. Set `FRED_API_KEY` to collect FRED data, and `TWELVE_DATA_API_KEY` for prices. The scanner needs `INGEST_BASE_URL`, `INGEST_TOKEN`, and a working Claude CLI login or `CLAUDE_CODE_OAUTH_TOKEN`. Set `IDEAS_PAGE=on` at build and run time when testing the ideas page.

```sh
npm run collect:ping
npm run collect -- --only NVDA --since 2026-09-01 --dry-run --memory
npm run collect -- --source frames,getcurrent,13f --only NVDA
npm run detect -- --since 2026-09-01
node scanner/run-extract.mjs --only NVDA --agent claude --model haiku
npm run reconcile
npm run daily
npm run judge -- --dry-run --input-file input.json
npm run retention -- --dry-run
```

`collect --dry-run --memory` and `retention --dry-run` avoid database writes. The other commands above may write locally; the judge example reads a saved input file and does not post.

## Open work

No cluster test has run. The cluster `SEC_USER_AGENT` still needs a monitored contact address. The account, licence and access tasks in `docs/tasks-accounts-needed.md` remain open. Filip still needs to decide whether the portfolio sized ideas page fits ADR-001 and review the `SIGNAL_RULES` thresholds.

A cluster test needs approval. Proposed sequence: build the local images, apply migrations first, then run a one-off collector Job with a unique name prefix and inspect its logs and stored rows. Do not start Argo sync or unsuspend CronJobs as part of that test.

## Intended daily order

The pipeline runs Tuesday through Saturday: prices at 05:00, collect at 05:35, detect at 06:10 (20-minute start deadline and 10-minute job deadline), extract at 06:25 (30-minute job deadline), reconcile at 07:00, daily scoring at 07:15, digest at 07:30 and judge at 07:45. Collect, detect, extract, judge and retention are suspended. Both web-search scan CronJobs are now suspended in the base manifests as well; they were set for 05:30, before collect, so move one between detect and reconcile if you resume it. `src/jobs/cronjob-order.test.ts` checks the order, the weekdays and the suspended flags.
