# Data storage and daily scoring

Set `DATABASE_URL` to a PostgreSQL connection string, then run `npm run migrate`. The migration runner applies numbered SQL files once and records them in `schema_migrations`. It uses a transaction and an advisory lock so concurrent invocations do not apply the same migration twice.

Run `npm run daily` to score the fixture universe at its latest available bar date. Pass `--date YYYY-MM-DD` to score an earlier fixture date; every instrument needs a bar on that date. `npm run daily -- --memory` runs against an in-memory repository for local checks. This repository loses its data when the process exits.

The daily write stores instruments, bars, fundamentals and macro snapshots, the full score audit, and state changes in one transaction. `ingest_runs.as_of` makes a completed date idempotent. A prior score from the most recent earlier date is the comparison point; the first recorded state does not create a change alert. Score audits hold the exact scoring inputs, rule hits, and rejection reasons. The email digest builder formats alert changes in English or Slovak; delivery is left to a mailer implementation.
