# ADR: Point-in-time storage

Status: proposed, needs owner review. Date: 2026-10-10. Roadmap task D6 (`docs/roadmap/lane-data.md`). This ADR also covers the retention audit from EN21 step 1. No code or migration comes with it; D12, D14, D15, D18 to D20, D27 and D28 build the tables it lists.

## Context

Later features need to answer "what did we know on day X": score history, track record, backtests, replay, paid depth. Today several tables overwrite in place, so the answer is lost. Read from the migrations and the code on 2026-10-10:

- `daily_bars` upserts with `ON CONFLICT (ticker,bar_date) DO UPDATE` (`src/db/prices.ts`, `src/db/postgres.ts`). A vendor correction or a split replaces old rows with no trace.
- `score_results` is refreshed on the same date (`src/db/postgres.ts`). The stored `audit` holds the inputs, but a same-day rerun replaces them.
- `consensus_findings` has primary key `(symbol, field, as_of)` and upserts (`src/jobs/reconcile.ts`, `src/jobs/macro.ts`). A rerun loses the earlier value and the agent values.
- `source_documents` upserts by `url` and overwrites `body` and `content_hash` (`src/db/collectors.ts`). It expires after 30 to 100 days, and `src/jobs/retention.ts` deletes it. `collected_facts` expires after 30 days.
- Only `record_snapshots` and `record_signals` (`migrations/018_track_record.sql`) are immutable.

## Decision

### 1. Every observation table carries two times

- `observed_at timestamptz`: when we fetched or computed it. Set by the database (`DEFAULT now()`), never by the caller.
- A business date: `as_of` (the day the value describes), `period_end` and `filed` (fundamentals and filings), `bar_date` (bars), `published_at` (documents).

Existing columns that already play this role keep their names (`fetched_at`, `computed_at`, `reconciled_at`, `received_at`); a new table uses `observed_at`.

### 2. Append-only revision tables

For data that is revised or recomputed (bars, scores, consensus, estimates), the live table stays as it is, so current reads do not change. A sibling `*_revisions` or `*_history` table keeps every earlier value. A row is written when the stored value is about to change, and once for the first sight of a new value. Revision tables are append-only (pattern 4).

Worked example, bars (D12):

```sql
CREATE TABLE daily_bar_revisions (
  ticker text NOT NULL REFERENCES instruments(ticker),
  bar_date date NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  open numeric NOT NULL, high numeric NOT NULL, low numeric NOT NULL,
  close numeric NOT NULL, volume numeric NOT NULL,
  source_id text,
  PRIMARY KEY (ticker, bar_date, observed_at)
);

-- In the upsert transaction: keep the value that is about to be replaced.
INSERT INTO daily_bar_revisions (ticker, bar_date, open, high, low, close, volume, source_id)
SELECT b.ticker, b.bar_date, b.open, b.high, b.low, b.close, b.volume, 'twelvedata'
FROM daily_bars b
JOIN (VALUES ('NVDA', DATE '2026-10-08', 190.1, 193.0, 189.5, 192.4, 41000000))
  AS n(ticker, bar_date, open, high, low, close, volume)
  ON n.ticker = b.ticker AND n.bar_date = b.bar_date
WHERE (b.open, b.high, b.low, b.close, b.volume) IS DISTINCT FROM (n.open, n.high, n.low, n.close, n.volume);
```

The same shape serves scores (D14), consensus (D15) and estimates (D27, D28). D15 uses a trigger on the live table instead of application code, because several jobs write `consensus_findings`:

```sql
CREATE FUNCTION consensus_to_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO consensus_findings_history SELECT OLD.*, now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER consensus_findings_keep BEFORE UPDATE OR DELETE ON consensus_findings
  FOR EACH ROW EXECUTE FUNCTION consensus_to_history();
```

(`consensus_findings_history` has the live columns plus `superseded_at`, as D15 specifies.)

### 3. Documents keyed by content hash

`source_documents.url` stays the lookup key for "latest". A changed body must not overwrite the old one. The archive from D5 stores one row per `(url, content_hash)`, so a filing that is amended or re-served keeps every version; an identical refetch inserts nothing.

```sql
CREATE TABLE source_document_versions (
  url text NOT NULL CHECK (url LIKE 'https://%'),
  content_hash text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL,
  source text NOT NULL, doc_type text NOT NULL, symbol text,
  body text NOT NULL,
  PRIMARY KEY (url, content_hash)
);

INSERT INTO source_document_versions (url, content_hash, published_at, source, doc_type, symbol, body)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (url, content_hash) DO NOTHING;
```

The exact columns are D5's to settle; this ADR fixes the key and the no-overwrite rule.

### 4. Immutable trigger

Reuse the function from `migrations/018_track_record.sql`. It is generic in effect (it only raises), but its message says "Track record rows are immutable". A new migration must not edit `018`. Either reuse the function and accept the message, or add `reject_append_only_change()` with a neutral message in the first migration that needs it (D12) and have later tables use that one.

```sql
CREATE TRIGGER daily_bar_revisions_immutable BEFORE UPDATE OR DELETE ON daily_bar_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_record_change();
```

Limits: a trigger does not stop `TRUNCATE` or a superuser dropping the trigger. Statement-level protection (`BEFORE TRUNCATE`) is added on every append-only table, and the application role gets no `ALTER` or `TRUNCATE` right (platform lane, read-only web role).

### 5. Reading "as known on a date"

Reads stay simple. Each revisioned dataset gets a view or function that hides the join, so a caller writes one query.

```sql
-- Bars as we knew them at the end of a given day.
CREATE FUNCTION bars_as_known(p_date date)
RETURNS TABLE (ticker text, bar_date date, close numeric) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (ticker, bar_date) ticker, bar_date, close
  FROM (
    SELECT ticker, bar_date, close, observed_at FROM daily_bar_revisions
    UNION ALL
    SELECT ticker, bar_date, close, now() FROM daily_bars
  ) v
  WHERE bar_date <= p_date AND observed_at < (p_date + 1)
  ORDER BY ticker, bar_date, observed_at DESC
$$;
```

The live row counts as observed "now", so it only answers a call for today. A call for a past date reads revision rows written before the end of that day; a bar that was never revised has its first-sight row there (pattern 2). Fundamentals use the same shape with the business date `filed`: `fundamentals_as_of(date)` returns the latest row with `filed <= date` (D18 builds it; EN25 reads it).

Rule for every `*_as_known` function: filter on `observed_at` (or `filed`) for what we knew, never on the business date alone. Using only `bar_date <= p_date` looks ahead at revisions made later.

## Table-by-table decisions

Class: **A** append-only revision or history table added (D-task builds it); **I** already immutable; **L** live table kept, upsert allowed, rebuildable from other stored data; **E** operational log, kept as is; **X** to change in a later task. Retention classes are defined in section "Retention".

| Table | Today | Decision | Retention | Task |
|---|---|---|---|---|
| `daily_bars` | upsert overwrites | L plus A `daily_bar_revisions` | never delete | D12 |
| `price_ingest_runs` | log, no revised count | E, add `bars_revised` | keep | D12 |
| `fundamentals_snapshots` | upsert by `(ticker, as_of)` | L; new A table `fundamentals_pit` with `period_end`, `filed`, `observed_at` | never delete | D18 |
| `macro_snapshots` | upsert by `(ticker, as_of)` | L; inputs captured in `score_input_snapshots` | rebuildable | D14 |
| `score_results` | same-day refresh overwrites | L plus A `score_input_snapshots` (one row per distinct inputs fingerprint) | never delete the snapshots | D14 |
| `alerts` | `UNIQUE (ticker, as_of)`, upsert | L, derived from scores | keep | none |
| `portfolio_snapshots`, `portfolio_baseline`, `portfolio_nav_history` | upsert by date | X: owner data. Add a history table when the engine lane changes them (EN12 to EN14 touch the baseline). Not in this ADR's scope beyond keeping the rows | keep, private | EN lane |
| `scan_runs`, `scan_findings` | rows kept, `superseded_by` marks the old ones | I in practice (nothing deletes them); keep | keep | none |
| `macro_findings` | upsert by `run_id` | L; run is keyed by `run_id`, so each run is its own row | keep | none |
| `consensus_findings` | upsert by `(symbol, field, as_of)` | L plus A `consensus_findings_history` (trigger) | never delete the history | D15 |
| `reconcile_runs` | upsert by date | E | keep | none |
| `source_documents` | upsert by `url`, body overwritten, 30 to 100 day expiry | public SEC filings: archive by `(url, content_hash)`, no expiry. Internal-only or display-restricted text (for example Cboe, Alpha Vantage payloads): keep the 30 day rule | filings: never delete; restricted text: 30 days | D5 |
| `collected_facts` | upsert by `(symbol, fact_key, as_of)`, 30 day expiry | derived numbers that history needs (EPS surprise, price move, insider net) get append-only copies in the D27, D28 and D18 to D20 tables; the live fact table keeps its 30 day expiry | live 30 days; derived history never delete | D27, D28, D18 to D20 |
| `collector_runs` | log | E | keep | none |
| `cusip_map` | upsert by cusip, 0 rows | L, reference data | keep | D10 |
| `extraction_runs` | upsert by `(symbol, as_of, agent, input_hash)`, 30 day expiry | the run output is rebuildable from stored documents; score inputs are in `score_input_snapshots` | 30 days | none |
| `judge_runs` | upsert by `(as_of, agent, input_hash)`, 30 day expiry | as above | 30 days | none |
| `trade_ideas` | insert only (`DO NOTHING`), 90 day expiry | A in kind; the 90 day expiry is the open point. The signal itself is kept in `record_signals` | ideas 90 days; signals never delete | decision below |
| `record_snapshots`, `record_signals` | immutable (`018`) | I | never delete | done |
| `filing_watch` | insert only, `DO NOTHING` | A in kind | never delete | none |
| `discovery_price_bars` | upsert by `(symbol, bar_date)` | L plus A revisions in D12's scope only if discovery bars feed a score; today they do not feed `score_results`, so no | keep | none |
| `discovery_candidates` | `(week_start, symbol)` per week | A in kind; EN37 stores non-passes too | never delete | EN37 |
| `scheduled_gates` | upsert by `gate_date`, has `revision` | L; the counter says a rerun happened but loses the old reasons. Low value; leave | keep | none |
| `ai_budget_calls`, `ai_quota_samples` | log | E | 90 days is enough (cost report); no purge exists today | none |
| `instruments` | upsert by ticker, no dates | X: `universe_membership` carries the dates | never delete | D10, D11 |
| `users`, `subscriptions`, `ingest_runs` | account and run tables from `001`, not used by the data path | out of scope; the web lane decides history for accounts | per web lane | W lane |

## Retention

- **Never delete:** public SEC filings, bar and score and consensus revisions, score input snapshots, universe membership, security master, corporate actions, `record_*`, estimates and earnings snapshots, discovery screens.
- **Keep, no purge job:** run logs and cost ledgers. If one grows large, summarise before deleting, in its own task.
- **Expire:** display-restricted or internal-only raw text (30 days as today); `extraction_runs` and `judge_runs` (30 days); `trade_ideas` (90 days) unless the owner decides otherwise.
- `src/jobs/retention.ts` stays suspended (`invest-buddy-retention`) until D5 changes its delete rules. Any new table in the never-delete class needs a test that the retention job does not touch it (the test D12 and D14 add).

## Consequences

- Reads of the live tables do not change. Only new code calls `*_as_known` functions.
- Storage grows by about 37 revision rows a day only when a value changes, plus one row per new bar. D1 and D38 hold the estimates; this ADR adds none of its own.
- Writes in the prices job and the score job get one extra statement each, inside the existing transaction.
- A bad write can no longer be corrected by an update on an append-only table. A correction is a new row; a view picks the latest by `observed_at`.

## Open points for the owner

1. `trade_ideas` expiry (90 days): keep, or archive the idea text with the signal? The signal and score stay in `record_*` either way. Default: keep the 90 days; the web and engine lanes read ideas for history only through `record_signals`.
2. Whether Twelve Data's free series is split-adjusted only, or also dividend-adjusted, is unverified (D12 risk). It decides if a vendor "revision" is a real correction or an adjustment. D13 records the answer from a fetch.
3. Portfolio tables (`portfolio_baseline`, `portfolio_nav_history`) hold private owner data. Their history belongs to the engine lane (EN12 to EN14). No decision is taken here.
