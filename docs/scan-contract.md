# Scan contract (v2)

Data path: scan runner (Filip's Mac or GPU box, subscription login) -> `POST /api/ingest/scan` on the web -> Postgres `scan_findings` -> daily CronJob (deterministic engine) -> `score_results`, `alerts` -> web pages read Postgres.

The runner never gets database credentials. It holds only a bearer token for the ingest endpoint.

## Request

`POST https://invest.filipcsupka.online/api/ingest/scan` with `Authorization: Bearer <INGEST_TOKEN>`, `Content-Type: application/json`, body under 1 MB.

```json
{
  "schemaVersion": 2,
  "runId": "uuid",
  "asOf": "2026-10-03",
  "generatedAt": "2026-10-04T05:30:00Z",
  "runner": { "name": "claude", "model": "string" },
  "tickers": [
    {
      "symbol": "NVDA",
      "fundamentals": {
        "revenueAccelerating": true,
        "revenueDeclining": false,
        "epsBeat": true,
        "guidanceRaised": true,
        "guidanceCut": false,
        "productCatalyst": { "present": true, "kind": "new chip", "summary": "one plain sentence" },
        "insiderOrInstitutionalBuying": null,
        "narrativeChanged": false
      },
      "evidence": [ { "claim": "fundamentals.guidanceRaised", "url": "https://...", "publishedAt": "2026-08-27", "fiscalPeriod": "Q2 FY2027", "quote": "exact sentence copied from the page" } ],
      "confidence": "high"
    }
  ],
  "macro": {
    "sectorRotationIntoGrowth": true,
    "dataTailwind": false,
    "notes": "one or two plain sentences",
    "evidence": [ { "claim": "macro.dataTailwind", "url": "https://..." } ],
    "events": [ { "date": "2026-10-10", "name": "CPI" } ]
  }
}
```

## Rules

- Every boolean may be `null`, meaning unknown. Unknown scores 0 points and is shown as unknown, never guessed.
- A `true` claim needs at least one evidence item whose `claim` names that field and whose `url` is https. Without it the server stores the claim but the engine ignores it.
- `confidence: "low"` findings are stored and shown but add no points.
- `symbol` must be in the instruments table; unknown symbols are rejected with the reason.
- Same `runId` is idempotent (second post returns 200 with `replayed: true`). Same `asOf` and symbol from a newer run supersedes the older one; history is kept.
- Responses: 200 `{accepted, rejected:[{symbol,reason}], replayed}`; 400 schema error with field paths; 401 bad token; 413 too large. The token is never logged.
- No prices, no position sizing, no advice wording anywhere in the payload. Scores are computed server side only.

## v2 additions: two agents, cross-checked

- `runner.name` is required and is `claude` or `codex`. Each agent posts its own run (own `runId`) for the same `asOf`. Superseding applies only within the same agent, symbol and `asOf`; the two agents never overwrite each other.
- Every evidence item for a `true` claim needs `publishedAt`, `fiscalPeriod` and `quote`, where `quote` is a sentence copied verbatim from the cited page.
- Agents must not read each other's output. Neither posts consensus; the server computes it.
- A reconcile job (not an agent) produces one consensus finding per symbol and field:
  - both agents give the same value, and the cited page was fetched and contains the quote (whitespace-normalised) -> accepted, `agreement: "agree"`;
  - values differ, or one agent gave null -> consensus null, `agreement: "disputed"`, both outputs kept;
  - only one agent ran -> consensus null, `agreement: "single"`, unless a deterministic source confirms it;
  - SEC XBRL (data.sec.gov companyfacts) can confirm or override numeric facts (revenue growth, EPS); a conflict marks the field `xbrl_override`.
- The engine reads only consensus. Unknown scores 0. The web shows agreement per field ("both agree", "disputed", "one source").
