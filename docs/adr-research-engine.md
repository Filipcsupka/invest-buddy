# ADR: research engine (RS0)

Date: 2026-10-11. Status: superseded on 2026-10-21. The owner decided there is no AI scraping or collection: EODHD supplies the inputs and AI only judges. P8 removed the research runner, verifier jobs, pipeline, notify job and owner research pages; the design doc `docs/research-engine.md` was removed with them. The `research_*` tables and their rows stay. Tasks: `docs/roadmap/lane-research.md`.

## Context

The owner's scheduled ChatGPT task searched the whole market, wrote phone-sized cards with an action and a EUR amount, and found most of its value outside our 36-name universe: all six sample cards of 2026-10-05 to 2026-10-11 (MRVL, GMAB, GFS, INTT, MEDCL, EOS.AX) were outside it. It had no memory between runs, its quotes were not checked, and the same model chose the facts, the rating and the amount.

Our pipeline is script first (`docs/script-first-pipeline.md`): scripts collect, a model without tools reads stored text, and code scores. ADR-003 keeps scores deterministic and ADR-001 keeps public output to informational screening. Neither covers finding new names or catalysts on the open web.

## Decision

1. Three layers. Scripts keep giving deterministic facts and points. A research model with web search and fetch, and no other tools, finds what scripts cannot. The existing engine and judge merge verified facts into the score, the signal and the card.
2. The model never assigns points, ratings, actions or amounts. Its output schema has no field for them, and the validator rejects advice and score wording.
3. Every research claim passes a verifier written in code. The verifier fetches the cited page, checks that the quote is on it, stores a snapshot in the raw store (D17), classifies the source from its host and sets display rights. Unverified claims are dropped or shown as UNCONFIRMED leads in owner mode.
4. Research facts reach points only through reconcile: a verified primary fact plus an independent extract reading of the stored page gives `agree`. A research-only fact is stored as `research_verified` and adds no points until the owner decides otherwise.
5. A candidate pipeline with memory (`research_candidates`, `research_events`) and a code-driven state machine replaces the old prompt's "conceptual pipeline". Outside names join the scored universe through the DS1 `discovery:promote` command.
6. EUR amounts come from `allocate()` and the `portfolio_baseline` row, and appear only in owner mode on the private channel.
7. Claude CLI on the existing subscription token runs first. A Codex adapter follows behind the same interface once its auth works in the cluster (RS7). Caps, a kill switch and a per-run cost log apply to both.
8. No schedule is enabled before a manual replay of the six sample cards passes (RS8).

## Alternatives

- Keep the ChatGPT task. No storage, no audit trail, no quote checks, and amounts mixed into model text. Rejected.
- Scripts only (more RSS, GDELT, EDGAR full-text search). Free and deterministic, but it misses contracts, FDA decisions on foreign names, beneficiary chains and anything outside the feeds. Kept as layer 1; not enough alone.
- A paid search or research API (for example Perplexity, Exa, Tavily or Brave) called from code. Adds a monthly cost and licence terms we have not read, and still needs the verifier. Not chosen now; the adapter interface leaves room for it.
- Two research agents per run as in ADR-005. Doubles the cost before we know the recall of one. The Codex adapter (RS7) can become the second voice later.
- Let the model rate and size as before. Conflicts with ADR-003 and ADR-001. Rejected.

## Risks

- Subscription terms: ADR-005 item 6 reserves subscription tokens for the private beta. Research is an owner-only feature for now; a paid tier built on it needs API keys and a cost cap.
- Quota contention: research shares the Claude subscription with extract and judge, and the Codex account with the owner's coding agents. Mitigation: the night window, daily and monthly caps, live quota stops, and research runs after extract has started.
- Hallucinated or altered quotes: caught by the verifier. The rate is measured in RS8.
- Lower recall than the old task: paywalled press fails the fetch and leaves only an UNCONFIRMED lead. RS8 measures it.
- Prompt injection from fetched pages: the researcher has no tools beyond search and fetch, the verifier is code, page text reaches other models only as delimited data, and model text is checked for advice wording.
- SSRF through cited URLs: the fetch guard and a NetworkPolicy on the verify job.
- Licences: third-party text is stored internally and never displayed; only our claim and the link are shown. Storing full pages is an open owner question.
- Alert noise: the materiality rule, a 3-day cool-down per symbol and the delivery log.
- Owner data leaking to a public channel: amounts and action words only with `TELEGRAM_CARD_MODE=owner`, public research cards off by default, and the baseline is never sent to a model (daily watch receives symbols only).
