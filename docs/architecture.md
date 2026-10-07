# Architecture diagrams

Mermaid diagrams, rendered by GitHub. Keep them in step with `deploy/README.md` and `docs/script-first-pipeline.md`. Schedules are Europe/Bratislava unless noted. The state of each job (running or suspended) is in `docs/SESSION-HANDOFF.md`.

## 1. Data pipeline

Scripts do the work. The two AI steps (extract, judge) run only when the change gate says something changed, and stay inside the monthly token cap.

```mermaid
flowchart LR
  subgraph sources[Sources]
    SEC[SEC EDGAR<br/>filings, Form 4, XBRL]
    FRED[FRED]
    AV[Alpha Vantage<br/>EPS surprise]
    TD[Twelve Data<br/>prices]
    FLEX[IBKR Flex<br/>positions, NAV]
  end

  subgraph pipeline[Weekday pipeline]
    PRICES[prices<br/>00:30] --> COLLECT[collect<br/>01:00]
    COLLECT --> DETECT[detect / gate<br/>01:35]
    DETECT -- changed tickers --> EXTRACT[extract, AI haiku<br/>01:50]
    EXTRACT --> MACRO[macro, no AI<br/>04:00]
    MACRO --> RECONCILE[reconcile<br/>04:10]
    RECONCILE --> DAILY[daily scoring<br/>04:25]
    DAILY --> DIGEST[digest<br/>07:30]
    DAILY --> JUDGE[judge, AI sonnet<br/>05:30, only if changed]
  end

  DISC[discovery<br/>Sat 09:30] -- candidates --> UNIV[(universe)]
  UNIV --> COLLECT
  PORT[portfolio<br/>06:00 UTC] --> DB

  SEC --> COLLECT
  FRED --> COLLECT
  AV --> COLLECT
  TD --> PRICES
  TD --> DISC
  SEC --> DISC
  FLEX --> PORT

  COLLECT --> DB[(Postgres<br/>documents, facts, bars,<br/>scores, ideas, NAV)]
  EXTRACT --> DB
  RECONCILE --> DB
  DAILY --> DB
  JUDGE --> DB
  DB --> WEB[Next.js web<br/>invest.filipcsupka.online]
```

## 2. From claim to score

```mermaid
flowchart TD
  DOC[Stored source document] --> EX[Extractor, AI, no tools]
  EX --> QC{Quote found in<br/>stored text?}
  QC -- no --> DROP[Claim downgraded]
  QC -- yes --> REC[Reconcile]
  XBRL[SEC XBRL and Form 4] --> REC
  RULES[Data rules<br/>EPS beat, macro] --> REC
  REC --> FIELD[Field: confirmed, verified_single<br/>or one source]
  FIELD --> SCORE[Score: fundamentals, technical, macro]
  SCORE --> STATE[State: setup, watch, wait,<br/>ignore, broken]
  STATE --> JUDGE[Judge explains changed signals]
  JUDGE --> IDEA[Idea card with evidence links]
```

## 3. How a change reaches the cluster

```mermaid
flowchart LR
  DEV[Branch in invest-buddy] --> PR[Pull request]
  PR --> CI[CI: quality<br/>lint, typecheck, tests, DB tests]
  CI --> MERGE[Merge to main]
  MERGE --> BUILD[Build web and scanner images<br/>ghcr.io, tag sha-xxxxxxx]
  BUILD --> PIN[deploy-gitops job pins the tag<br/>in the infra repo]
  PIN --> INFRA[(Filipcsupka/infra<br/>gitops/apps/invest-buddy)]
  INFRA --> ARGO[Argo CD, sync every 60 s,<br/>prune and self-heal]
  ARGO --> K3S[khtz k3s, namespace invest]
  MANIFESTS[Manifest changes in deploy/gitops] -. copied by hand, PR .-> INFRA
```

The pin is the last build to finish. When several PRs merge in a row, check that the pin equals the `main` short sha.

## 4. Runtime on khtz

```mermaid
flowchart TB
  USER[Reader] --> ING[Ingress<br/>public filter]
  OWNER[Owner] --> ING
  ING --> WEB[Deployment web<br/>Next.js, runs migrations in init]
  WEB --> PG[(Postgres<br/>PVC postgres-data)]

  subgraph cron[CronJobs, namespace invest]
    PJ[prices, collect, detect, macro,<br/>reconcile, daily, digest,<br/>portfolio, discovery]
    AIJ[extract, judge<br/>AI jobs]
  end
  PJ --> PG
  AIJ -- ingest API<br/>bearer token --> WEB
  AIJ -- Claude API<br/>separate account --> CLAUDE[Anthropic]

  subgraph secrets[Sealed secrets]
    S1[invest-buddy-secrets]
    S2[invest-buddy-scanner-secrets]
    S3[invest-buddy-market-secrets]
    S4[invest-buddy-source-keys]
    S5[invest-buddy-flex-secrets]
  end
  secrets -.-> cron
  secrets -.-> WEB
```

## 5. What each public and private view shows

```mermaid
flowchart LR
  DB[(Postgres)] --> PUB[Public pages]
  DB --> PRIV[Owner view, flag-gated]
  PUB --> D[Dashboard<br/>state groups, search, filter,<br/>held label]
  PUB --> C[Company page<br/>idea card, source per rule]
  PUB --> T[Track record<br/>real signals vs SPY]
  PUB --> P[Portfolio<br/>weights, NAV vs SPY]
  PUB --> Z[Sizing guide<br/>tier by account and cash]
  PRIV --> A[Owner allocation<br/>EUR amounts from free cash]
```

Public pages carry no EUR amounts (ADR-001). EUR amounts exist only in the owner view.
