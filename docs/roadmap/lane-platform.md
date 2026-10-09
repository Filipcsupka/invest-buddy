# Lane PLATFORM: quality and operations (PL1 to PL45)

Synthesis 2026-10-09: this copy is the working version for the window. The master plan is `docs/roadmap/README.md`. Lines starting with "Synthesis note" and the section "Changes by the synthesis" at the end are the only additions to the lane draft in ops-brain. Migration numbers written below (022, 023 and so on) are placeholders: several lanes claim the same numbers, so each PR takes the next free number when it opens (PL7 rule, PL15 lint). IDs from `docs/tasks-open.md` (A1 to I1, for example E1, C2, D1b, D2) are written with the prefix "tasks-open" where they could be read as a data lane ID.

Status 2026-10-09. Planning only, nothing was changed. Window: 2026-10-09 to 2026-12-31. Sources read: AGENTS.md files, `docs/tasks-open.md`, `deploy/README.md`, `docs/logging.md`, `docs/paywall-segments.md`, `.github/workflows/*`, `Dockerfile`, `deploy/gitops/gitops/apps/invest-buddy/base/*`, `scripts/migrate.ts`, `src/proxy.ts`, `src/app/api/*`, `src/jobs/job-log.ts`, ops-brain STATUS, ARCHITECTURE, ROADMAP, billing, regulatory, data-providers, 130 (sections 8 and 9). Live reads on khtz (`kubectl -n invest`, one SELECT-only check on Postgres) and `gh` read calls on 2026-10-09.

## Goal

Make building and running safe while features land, and reach a state where accounts and payments can be switched on after the window. That means: CI that does not fail for outside reasons, a merge and deploy flow with checks, a database with separate roles and a tested restore, alerts that reach the owner when a job fails, secrets handled one way, a security review gate for auth and payment code, cost and quota guards, basic GDPR groundwork for the waitlist and accounts, and a release checklist for the year-end waitlist launch.

## Facts that shape the plan (checked 2026-10-09)

- CI `quality` job fails in "Initialize containers" when pulling `postgres:16` from Docker Hub. Two kinds in the logs: `toomanyrequests: You have reached your unauthenticated pull rate limit` (run 37990248783) and a token timeout from `auth.docker.io` (run 37994319034). Both on branches that only changed docs or web files.
- The cluster Postgres is `postgres:16-alpine` from Docker Hub with a floating tag, 5 Gi `local-path` PVC on `k8s-worker-01`. The database is 30 MB today. The only DB role is the superuser `invest` and the web uses it. `invest-buddy-backup` is suspended, no backup exists.
- Argo CD `timeout.reconciliation` is `300s` live. `deploy/README.md` and `docs/tasks-open.md` A1 say Argo polls every 60 s and merge to running pod takes about 2 minutes. ops-brain STATUS says to force a hard refresh. The numbers disagree and no measurement is recorded.
- The `deploy/gitops/` mirror pins `sha-e42e164`, the live web runs `sha-8c844e6`. The mirror is already stale.
- The `monitoring` namespace has Prometheus, Alertmanager, Loki and Grafana Pending for 40 to 59 days. The scheduler message is "didn't match Pod's node affinity/selector"; the Prometheus pod has `nodeSelector accelerator=nvidia` and neither node has that label. So there is no working alerting or log store. Logs exist only as container logs (`docs/logging.md`).
- `src/jobs/job-log.ts` writes job start and end lines to stdout only. Nothing stores a job result in the database, so a job that never ran leaves no trace. `/api/health` returns max dates of three tables and opens a new `pg.Pool` per call, no auth, no limit.
- Rate limiting exists only in `src/app/api/ingest/scan/route.ts` (in-memory map, 60 per minute, after token check). No limit on public pages, `/api/health` or any future signup route.
- `next.config.ts` sets no security headers. Privacy page is 1,080 bytes of source; terms page exists.
- GitHub repo is private. Branch protection API returns 403 "Upgrade to GitHub Pro or make this repository public". CodeQL and dependency-review are skipped because `GHAS_ENABLED` is unset. Trivy image scan, gitleaks, `npm audit --omit=dev` and kubeconform run in `build.yml`.
- Worker node `k8s-worker-01`: allocatable 2 CPU, about 3.9 GB memory; requests 28% CPU, 27% memory, limits 132% CPU, 63% memory, 55 pods. Control plane memory at 72%. `kubectl top` works.
- AI jobs: Claude subscription token, soft stops at 85% (five hour) and 90% (seven day), `AI_DAILY_TOKEN_CEILING` default 0 (off). 2026-10-09 extract: 35 Haiku calls, 0.31 USD on the CLI meter, 806,713 tokens counted for the day (`docs/tasks-open.md` C6).
- Twelve Data plan limits in `deploy/README.md`: 8 requests per minute and 800 per day on the plan in use; free tier for private beta only.
- Migrations: `scripts/migrate.ts` runs all pending files in one transaction under an advisory lock; the web init container runs it on every new web pod. Last file is `021_idea_translations.sql`.

## Owner decisions needed

1. Alert channel: email, Discord, Telegram or push? A Discord bot secret exists in namespace `ai-agent` (`discord-bot-secrets`), so a channel may already exist. Needed for PL25.
2. Offsite backup target and who pays: SFTP host for restic (the manifest expects one, none is named), or an S3 compatible bucket. Needed for PL22. Spend or third-party signup.
3. Staging: local compose only, or a second namespace `invest-staging` on the same single worker (extra DNS name, small CPU and memory cost)? Needed for PL11.
4. Merge gate: pay for GitHub Pro to get branch protection, or keep the convention plus a merge script? Also whether to enable GitHub Advanced Security for CodeQL (cost unverified). Needed for PL7 and PL36.
5. Availability target: is a restore from backup after a node loss (hours of downtime, up to a day of data loss with a daily dump) acceptable until paid users exist? Needed for PL38.
6. Is nightly production use of a Claude subscription token acceptable for a paid product? Anthropic terms for automated subscription use were not checked here. If not, an API key budget is needed. Needed for PL41. Spend and legal.
7. Operator identity for the privacy text: which legal person is the controller, and which contact address is shown? Needed for PL43. Legal.
8. Mail provider for waitlist and alerts (unverified terms, EU data location matters). Needed for PL25. Third-party signup.
9. Cookies and analytics: none, or a privacy-friendly analytics tool? Needed for PL43.
10. Which Claude account runs the nightly jobs token, and which accounts run Orca agents? They share quota windows. Needed for PL41.

## Group A: CI and build

### PL1. Stop the Docker Hub pull failure in CI
- Why: two of the last failed `Build` runs died pulling `postgres:16` (logs above). Source: `.github/workflows/build.yml` `services.postgres`. Docker Hub limit terms: https://docs.docker.com/docker-hub/usage/ (not fetched in this session, unverified).
- Steps: 1) Check the runner image for a preinstalled PostgreSQL: add a throwaway workflow step that prints `pg_lsclusters` and `/usr/lib/postgresql/*/bin/postgres --version` (runner image list: https://github.com/actions/runner-images, unverified). 2) If version 16 is there, replace `services.postgres` in `build.yml` with a step that starts it, creates user `investbuddy` and database `investbuddy_test`, and waits with `pg_isready`. 3) Keep `TEST_DATABASE_URL` and the `npm run migrate` step unchanged. 4) If not available, use PL2 first and point the service at the GHCR mirror.
- Acceptance: five consecutive PR runs and one main run pass `quality` with no Docker Hub request in the log (`grep -c registry-1.docker.io` is 0 in the "Initialize containers" step); the CI log still shows 0 skipped DB tests (`src/db/*pg.test.ts`, `collectors-pg.test.ts`). No new test needed.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none
- Risk or open question: runner Postgres may differ from the cluster's 16-alpine in minor version; low risk. If the runner image drops Postgres later, CI fails at the start step, which is visible.

### PL2. Mirror the Postgres image on GHCR and pin it by digest
- Why: the cluster also pulls `postgres:16-alpine` from Docker Hub with a floating tag (`base/postgres.yaml`); a node restart during a rate limit would leave the database down. Also fallback for PL1.
- Steps: 1) New workflow `.github/workflows/mirror-images.yml`, weekly and manual, using `docker buildx imagetools create --tag ghcr.io/filipcsupka/mirror-postgres:16-alpine postgres:16-alpine` with retry and backoff. 2) Record the digest in the job summary. 3) Open a PR to infra (not this repo) changing `postgres.yaml` image to the mirror digest. 4) Make the GHCR package readable by the cluster (pull secret or public package; check how `ghcr.io/filipcsupka/invest-buddy` is pulled today).
- Acceptance: workflow run shows the digest; `kubectl -n invest get deploy postgres -o jsonpath='{.spec.template.spec.containers[0].image}'` shows the GHCR digest; postgres pod Ready after rollout; backup and restore test (PL24) still pass.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: cluster write (infra PR merge, the Postgres pod restarts, `Recreate` strategy means short downtime)
- Risk or open question: a mirror is only as fresh as the weekly run; Dependabot docker updates do not see it. The same pull may hit the rate limit once a week; retry covers that.

### PL3. Build each image once, cache layers, skip publish on docs-only merges
- Why: `scan-images` builds both images, then `publish-images` builds them again. `deploy/gitops` pins re-run on docs-only merges (H8 says harmless but they cost runner time and an Argo sync). Source: `build.yml`.
- Steps: 1) Add `cache-from/cache-to type=gha` to the four `build-push-action` steps. 2) In `publish-images`, push the image that was scanned (build with `push: false` plus `outputs: type=oci` artifact, or build once in one job that scans then pushes). 3) Add `paths-ignore: ['docs/**','**/*.md']` to the `push` trigger only, so PR checks still run. 4) Keep the job names unchanged.
- Acceptance: main push after a code change publishes both images with tags `sha-<7>`; a docs-only merge produces no publish and no infra commit; `Build` wall time on a repeat PR run is lower than the previous median (record both numbers in the PR). Test: `scanner/test/dockerfile-copy.test.mjs` still passes.
- Size: M
- Depends on: PL1
- Who: agent
- Approval needed: none
- Risk or open question: scanned image and published image must be the same digest; the PR must show that. Provenance and SBOM settings (`sbom: true`, `provenance: mode=max`) must stay.

### PL4. Drift check between `deploy/gitops` mirror and infra
- Why: the mirror pins `sha-e42e164` while live runs `sha-8c844e6`; `deploy/README.md` says the mirror was last synced 2026-10-08. Schedule tests read the mirror (`src/jobs/cronjob-order.test.ts`), so a drifted mirror gives false results.
- Steps: 1) Scheduled workflow `mirror-drift.yml` (daily) that checks out `Filipcsupka/infra` with `INFRA_REPO_TOKEN` (read) and diffs `gitops/apps/invest-buddy/` against `deploy/gitops/gitops/apps/invest-buddy/` ignoring the `images:` block in the overlay. 2) On difference, fail and write a summary. 3) Add the rsync command to the failure message. 4) Add the check to `deploy/README.md`.
- Acceptance: workflow passes right after a manual rsync; fails when one CronJob schedule is edited in a scratch branch of infra (shown in the PR description); `deploy/README.md` names it.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none (uses the existing `INFRA_REPO_TOKEN`; confirm it has read on infra)
- Risk or open question: token scope was documented as Contents read/write; a read-only check could use a narrower token, which would be a new secret.

### PL5. Read-only deploy verification script
- Why: after a merge the agent or owner has to check overlay tag, deployment image, CronJob images and health by hand (`docs/tasks-open.md` H8 lists them). Source: `deploy/README.md` "Verify and roll back".
- Steps: 1) `scripts/verify-deploy.sh` using `KUBECONFIG=~/.kube/khtz kubectl -n invest` read calls and `curl`: compare `sha-` tag in infra `overlays/prod/kustomization.yaml` (path argument) with `deploy/invest-buddy-web` image and every CronJob container image; print Argo `Synced/Healthy` and revision; fetch `/api/health`, `/en/dashboard`, `/sk/dashboard`, `/robots.txt`, and expect public `/api/ingest/scan` to return 404. 2) Exit non-zero on any mismatch. 3) Document in `deploy/README.md`.
- Acceptance: run on current prod prints all OK and exit 0; run with a wrong expected tag exits 1. A `bats` or shell test with stubbed `kubectl` covers both cases (`scripts/verify-deploy.test.sh`).
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none (read only)
- Risk or open question: none known.

### PL6. Measure and fix the Argo refresh delay
- Why: live `timeout.reconciliation` is 300s but docs claim a 60 s poll and 2 minute pipeline; STATUS says to hard refresh. Source: `kubectl -n argocd get cm argocd-cm`.
- Steps: 1) Measure: for the next three merges record time of infra commit, time of Argo `status.sync.revision` change, time of new pod Ready (read only). 2) Write the numbers in `deploy/README.md` and fix the 60 s claim. 3) Propose one of: lower `timeout.reconciliation` to 60s in infra (Argo repo-server load for a few apps), or a GitHub webhook to Argo (needs a public path, a secret and an ingress rule; private repo webhook terms: https://docs.github.com/en/webhooks, unverified), or accept 5 minutes. 4) Implement the owner's choice in infra.
- Acceptance: a table of three measured deploys in `deploy/README.md`; after the change, median commit to Ready time is at most the target the owner picks (suggest 3 minutes, an assumption).
- Size: S
- Depends on: PL5
- Who: agent
- Approval needed: cluster write (infra change to `argocd-cm`), possibly new secret (webhook secret)
- Risk or open question: other apps share this Argo; a shorter poll affects all. A webhook needs a public endpoint into Argo, which widens the attack surface; prefer the poll change.

## Group B: Agent workflow, docs and tests

### PL7. Orca workflow rules and merge gate
- Synthesis note: add to the hot files list: `src/jobs/retention.ts`, `src/jobs/cronjob-order.test.ts`, `src/config/flags.ts`, `src/proxy.ts`, `package.json` (`build:jobs`), `Dockerfile` and `scanner/Dockerfile` COPY lists. The migration number rule here applies to every lane.
- Why: many agents will write in parallel for 12 weeks. PRs #74 to #83 show the pattern but no document states it. Branch protection is unavailable on the free plan (403 above).
- Steps: 1) Write `docs/agent-workflow.md`: one task = one PR; one worktree per task (Orca `--worktree` per task, never two writers on the same files); branch name `<lane-id>-<slug>`; run `npm run ci:verify` before push; PR text short and evidence based (repo rules: no AI attribution); lane file ownership table; hot files list (`docs/tasks-open.md`, `src/i18n/*`, migrations numbering, `scanner/Dockerfile` COPY list) with one named owner at a time. 2) Add `.github/pull_request_template.md` (summary line, link to task ID, checks run, approvals needed). 3) Add `scripts/merge-pr.sh <n>`: refuses unless `gh pr checks` all pass, PR has no `needs-review` label, and, when the diff touches `migrations/`, `.github/`, `deploy/`, or auth and billing paths, an `independent-review-ok` label exists. 4) Define who merges: owner, or an agent only after the gate script passes and the PR contains no approval-needed items. 5) State the migration number rule: claim the next number in the PR title to avoid two PRs using `022_`.
- Acceptance: doc and template merged; script test (`scripts/merge-pr.test.sh` with stubbed `gh`) covers pass, failing check, missing review label; one real PR merged through the script.
- Size: M
- Depends on: none
- Who: agent
- Approval needed: none; owner picks the merge gate (decision 4); GitHub Pro would be spend
- Risk or open question: without branch protection a direct push to `main` is still possible; the script is a convention, not a block.

### PL8. Split the hot task file and add a docs check
- Synthesis note: `docs/roadmap/` already exists: the roadmap synthesis put the four lane files and the master plan there, and those repo copies are the working source for the window (the ops-brain lane files are the planning drafts). The docs check must treat tasks-open IDs (A1 to I1) and roadmap IDs (D, W, EN, PL) as separate namespaces, because tasks-open D1 and D2 collide with lane DATA D1 and D2.
- Why: `docs/tasks-open.md` is 41 KB with groups A to I; every agent edits it, so merge conflicts are likely. Done tasks (A1 to A8, B1 to B6) bury the open ones.
- Steps: 1) Move done tasks to `docs/tasks-done.md` unchanged. 2) Keep open tasks in `docs/tasks-open.md`; keep the roadmap lane files in `docs/roadmap/` as added by the synthesis. 3) `scripts/docs-check.mjs`: fail if a doc references a missing file, if `docs/tasks-open.md` mentions a task ID that exists in two files, or if a `Status` date is older than 30 days on an open task (warning only). 4) Run it in the `quality` job.
- Acceptance: `node scripts/docs-check.mjs` exits 0 on main and 1 on a fixture with a broken link (test `scripts/docs-check.test.mjs`); open file shrinks; no task text is lost (diff of line counts shown).
- Size: S
- Depends on: PL7
- Who: agent
- Approval needed: none
- Risk or open question: moving text changes line references quoted in other notes (for example "H8 in docs/tasks-open.md"); keep IDs unchanged and add a redirect note.

### PL9. Make local tests run without the broken Node
- Why: STATUS lessons say local Homebrew Node 25.9.0 fails on a missing `libllhttp.9.3.dylib` and a full vitest run shows 97 failing files on a clean main; agents lose time comparing against baselines.
- Steps: 1) `scripts/test-local.sh` runs `npm ci` and `npm test` inside `node:22-alpine` pinned like the Dockerfile (same digest) with a Postgres container for `TEST_DATABASE_URL` (reuse PL12 compose when it exists). 2) Add `.nvmrc` with 22. 3) Document in `docs/agent-workflow.md` and remove the dylib workaround text from STATUS once the script works.
- Acceptance: on this Mac `scripts/test-local.sh` finishes with the same pass count as the last green CI run (record both numbers); a deliberately broken test makes it exit non-zero.
- Size: S
- Depends on: PL7
- Who: agent
- Approval needed: none
- Risk or open question: Docker must run on the Mac; arm64 image pulls come from Docker Hub (rate limit applies to the Mac too, use the PL2 mirror once it exists).

### PL10. Test strategy and the rules version golden test
- Synthesis note: the golden test is EN1 (`src/engine/golden.test.ts`) and the rules-version guard is EN11's config hash test. Step 2 here links them in the strategy doc instead of adding a second golden test.
- Why: tests exist at several levels but nothing states which level covers what, and `docs/tasks-open.md` C5 asks for golden tests after rule changes. Existing: vitest in `src` and `scripts`, `node --test` for `scanner/test`, DB tests behind `TEST_DATABASE_URL`, `cronjob-order.test.ts`, `dockerfile-copy.test.mjs`. No e2e.
- Steps: 1) Write `docs/test-strategy.md`: pyramid (unit pure engine, DB tests with real Postgres, job tests, route tests, manifest tests, e2e smoke from PL13), what must have a test per PR type (migration, job, route, page, rule change), how to name DB tests. 2) Use the golden test from EN1 (`src/engine/golden.test.ts`) and the version guard from EN11; changing output without bumping the rules version string fails. 3) List current gaps in the doc (no e2e, no auth or payment tests, no load test).
- Acceptance: the golden test passes on main; changing one point value in `signals.ts` without a version bump fails it (shown in the PR as a before and after run); the doc lists each gap with the PL task that closes it.
- Size: M
- Depends on: EN1, EN11
- Who: agent
- Approval needed: none
- Risk or open question: PR #80 (BUY needs score 18) is open and held; the golden file must be regenerated after the owner decides, so do not merge this before that.

## Group C: Staging and preview

### PL11. Decide the staging approach (ADR)
- Synthesis note: this ADR is the decision behind W9 and PL14 (owner decision 1 in `docs/roadmap/README.md`).
- Why: payments and auth must be exercised somewhere that is not production, and prod is read-only for agents. Cluster has one worker (see facts).
- Steps: 1) Write `docs/adr/staging.md` with three options: local compose only; second namespace `invest-staging` with its own Postgres, no CronJobs, noindex and basic auth; per-PR previews (rejected for cost unless the owner asks). 2) Give memory and CPU numbers from `kubectl top` and requests above. 3) State the data policy: staging holds only public data and test users. 4) Owner picks.
- Acceptance: ADR merged with the owner's choice recorded; resource estimate uses measured values with dates.
- Size: S
- Depends on: none
- Who: agent drafts, owner decides
- Approval needed: none for the doc (decision 3)
- Risk or open question: a staging namespace on the same node competes with prod for 3.9 GB memory; the control plane node is already at 72% memory.

### PL12. Docker compose stack for local and CI smoke
- Why: no way to run web plus database plus migrations plus seed data with one command; `scripts/seed-local-bars.ts` and `scripts/post-sample-scan.ts` exist but are manual.
- Steps: 1) `compose.yaml` with postgres 16 (mirror image from PL2 when ready), a `migrate` one-shot using the runtime image target, `web` with `DATA_MODE=db`, and a `seed` one-shot running the two scripts. 2) `scripts/compose-smoke.sh` fetches `/api/health`, `/en/dashboard`, `/sk/company/NVDA` and checks status 200 and no sample stamp. 3) Document ports and teardown.
- Acceptance: `docker compose up --build` on a clean checkout ends with the smoke script exiting 0; the dashboard shows seeded scores; `docker compose down -v` leaves no volume.
- Size: M
- Depends on: PL1
- Who: agent
- Approval needed: none
- Risk or open question: seeding uses fixture data; real SEC data is not fetched, so staging realism is limited.

### PL13. End to end smoke in CI
- Synthesis note: W8 owns Playwright, `e2e/` and the CI job. This task is the DB-mode project inside that setup, run against the PL12 compose stack.
- Why: pages can regress without unit tests noticing (B4 and B5 needed separate tests for stamp and empty states). Source: `docs/tasks-open.md` B4, B5, I1.
- Steps: 1) Add a `smoke` job to `build.yml` that runs PL12's compose stack and a browser test (Playwright, licence Apache-2.0 per my memory, unverified: https://github.com/microsoft/playwright/blob/main/LICENSE) in `e2e/` covering: dashboard EN and SK, company page, 404 for unknown ticker, `/robots.txt`, language switch, no `SAMPLE` text in `DATA_MODE=db`. 2) Upload screenshots as artifacts on failure. 3) Keep runtime under 6 minutes.
- Acceptance: job green on main; a PR that reintroduces the sample stamp in db mode fails it (demonstrated in the PR); added to `docs/test-strategy.md`.
- Size: M
- Depends on: PL10, PL12, W8
- Who: agent
- Approval needed: none
- Risk or open question: browser download in CI adds time and a new third-party dependency; if the owner objects, use `fetch`-based checks only.

### PL14. Staging namespace manifests
- Synthesis note: W9 is merged into this task. Add W9's app-side items to the acceptance: staging flag values (`AUTH`, `WAITLIST` on, `BILLING` in test mode, mail to a log sink or test inbox), `robots.txt` disallow and `X-Robots-Tag: noindex`, and `docs/staging.md` with the promotion path PR, staging, prod. The database choice is owner decision 1.
- Why: if the owner picks the namespace option (PL11), auth and payment flows need a live host with HTTPS for webhooks.
- Steps: 1) `overlays/staging` in `deploy/gitops/gitops/apps/invest-buddy/` with web and Postgres only (no CronJobs), host `staging.invest.filipcsupka.online`, `X-Robots-Tag: noindex` middleware and basic auth or IP allowlist. 2) Separate sealed secrets with different values from prod. 3) Argo Application for staging in the infra repo. 4) `PAYWALL` and payment flags default off.
- Acceptance: `kustomize build` and `kubeconform -strict` pass in CI (extend the existing step to both overlays); after owner approval, `scripts/verify-deploy.sh --staging` passes; staging cannot reach the prod database (test: connection to `postgres.invest` from the staging pod fails, NetworkPolicy or separate namespace DNS check).
- Size: M
- Depends on: PL2, PL5, PL11
- Who: agent
- Approval needed: cluster write, new secrets, DNS record (owner)
- Risk or open question: no NetworkPolicy exists in the cluster today (E3), so isolation relies on namespaces and different credentials unless a policy is added.

## Group D: Database safety, roles and schema

### PL15. Migration lint in CI
- Why: all pending migrations run in one transaction on every web pod start (`scripts/migrate.ts`); a bad file blocks web start. Nothing checks migration content.
- Steps: 1) `scripts/migration-lint.ts`: for each new file in the PR (compare with `origin/main`): name pattern, ascending number with no gap or duplicate, no `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `ALTER COLUMN ... TYPE`, `CREATE INDEX` without `IF NOT EXISTS` unless the line `-- lint:allow <reason>` is present; no `CREATE INDEX CONCURRENTLY` (cannot run in a transaction). 2) Run it in `quality`. 3) Unit tests with fixture files.
- Acceptance: lint passes on migrations 001 to 021 or lists which need an allow comment (decided in the PR); fixtures for each forbidden pattern fail; a duplicate number fails.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none
- Risk or open question: false positives on legitimate drops; the allow comment is the escape.

### PL16. Rollback compatibility test (expand and contract)
- Why: README says to check schema compatibility with the rollback image before rollout, but nothing does it. Rollback is an infra revert and a forward-only schema.
- Steps: 1) CI step: build a database with migrations from `origin/main`, apply the PR's new migrations on top, then run the DB tests from `origin/main` (checked out into `main-tests/`) against it. 2) Write the expand and contract rule in `docs/agent-workflow.md`: a column or table is dropped only one release after code stops using it. 3) Document the manual rollback steps in `deploy/README.md`.
- Acceptance: a PR adding a nullable column passes; a scratch PR renaming a column used by main's code fails (shown in the PR); step runs only when `migrations/` changed.
- Size: M
- Depends on: PL1, PL15
- Who: agent
- Approval needed: none
- Risk or open question: main's tests may use fixtures that insert into new tables; failures must be read, not auto-ignored.

### PL17. Move migrations out of the web init container
- Why: today every new web pod runs `npm run migrate` as an init container with the application URL; a failing migration loops the web pod, and PL19 needs a role with DDL rights that the web should not have.
- Steps: 1) Add an Argo `PreSync` hook Job `invest-buddy-migrate` in `base/` that runs `npm run migrate` with `MIGRATE_DATABASE_URL` (superuser or `migrator` role) and `activeDeadlineSeconds`. 2) Remove the init container from `web.yaml`. 3) Keep the advisory lock. 4) Add a test in `src/jobs/cronjob-order.test.ts` style that the hook has the right annotations and no other job uses the superuser URL.
- Acceptance: after rollout a new image with a new migration applies it before the web pod starts; a failing migration leaves the old web pod serving (shown on staging first); `kubectl -n invest get job invest-buddy-migrate` shows Complete.
- Size: M
- Depends on: PL14 (test on staging), PL16
- Who: agent
- Approval needed: cluster write (infra change), live migration behaviour changes
- Risk or open question: Argo hook delete policy and first sync ordering with the Postgres Deployment; test on staging only.

### PL18. One pool per process, split health from readiness
- Synthesis note: W2 creates `src/db/pool.ts`; this task extends it with `readPool()` and `writePool()` and moves the API routes onto it. W4 adds `/api/live` and `/api/ready`.
- Why: `src/app/api/health/route.ts` and the ingest routes create `new pg.Pool` per request and end it; public health is open to anyone. Under traffic this opens a connection per request to a Postgres with a 384Mi limit.
- Steps: 1) `src/db/pool.ts` exporting `readPool()` and `writePool()` singletons configured from `DATABASE_URL` and (later) `INGEST_DATABASE_URL`, with max, idle timeout and statement timeout from env. 2) Replace per-request pools in `src/app/api/**/route.ts` and `src/db/*.ts` callers. 3) `/api/health` returns only `{ok:true}` plus database reachability (one `SELECT 1`); move freshness dates to an owner-token endpoint (`/api/ingest/ops-report`, PL29). Keep the response shape the deploy scripts and `docs/tasks-open.md` A6 expect until updated. 4) Tests with a fake pool for reuse and shutdown.
- Acceptance: 100 sequential calls to `/api/health` in a test open at most one connection (assert via pool stats); `pg_stat_activity` count on staging stays at or below the configured max under the PL39 load; probes in `web.yaml` still pass.
- Size: M
- Depends on: W2
- Who: agent
- Approval needed: none for code; cluster write when the new image is pinned
- Risk or open question: `docs/logging.md` and STATUS describe the health fields; update both.

### PL19. Roles and grants migration (C2)
- Synthesis note: tables from other lanes that need grants in the window: W11 (waitlist), W12 (`mail_log`), W28 (auth, entitlements), W36, W37, W41, and the lane DATA tables.
- Why: only the superuser `invest` exists and the web uses it (`docs/tasks-open.md` C2). A leaked web credential gives full write and raw document access.
- Steps: 1) Design the grant matrix in `docs/db-roles.md` from the actual tables (list with `\dt` on staging): `web_ro` SELECT on score, alert, instrument, idea, portfolio, bar and track record tables; no access to `source_documents`, `collected_facts`, `extraction_runs`, `ai_budget_calls`; `ingest_rw` INSERT and UPDATE on the tables the ingest routes write (`src/app/api/ingest/*`); `jobs_rw` for CronJobs; `migrator` owner of objects. 2) Migration `022_roles.sql` creating roles `NOLOGIN` (passwords are set later, never in SQL) and grants, plus `ALTER DEFAULT PRIVILEGES` so later tables do not widen access. 3) Test `src/db/roles-pg.test.ts` (needs a superuser TEST URL): as `web_ro`, `INSERT` fails, `SELECT` on `source_documents` fails, `SELECT` on `score_results` works. 4) Add a lint rule (PL15) that every new table migration also states its grants.
- Acceptance: tests above pass in CI; migration applies twice cleanly; `\du` on staging shows the roles, none with `rolsuper`.
- Size: M
- Depends on: PL1, PL15, PL18
- Who: agent
- Approval needed: live migration (applies on next deploy, goes through PL17 when ready)
- Risk or open question: grants for tables created by later lanes (accounts, waitlist) must be decided per table; waitlist and account tables must not be readable by `web_ro` unless a page needs them.

### PL20. Role passwords and the `web_ro` rollout
- Why: roles from PL19 are inert until they have credentials and the web uses them.
- Steps: 1) One-off Job (in the PR as a manifest, applied only after approval) that runs `ALTER ROLE ... LOGIN PASSWORD` from sealed secret values. 2) Seal `DATABASE_URL_RO` and `INGEST_DATABASE_URL` for `invest` (staging first), using the helper from PL31. 3) Web reads pages with `readPool()` on the RO URL and ingest routes with `writePool()`. 4) Keep `DATABASE_URL` (superuser) only in the migrate Job and backup.
- Acceptance: on staging then prod, all pages render (`scripts/verify-deploy.sh` passes); `kubectl -n invest exec deploy/postgres -- psql -U web_ro ... -c "insert ..."` fails (read only check of the error); the web Deployment no longer references `DATABASE_URL` superuser.
- Size: M
- Depends on: PL14, PL17, PL19, PL31
- Who: agent with owner approval
- Approval needed: new secrets, cluster write, live DB role change
- Risk or open question: a missed grant shows as a 500 on one page; keep the old URL available for a quick infra revert for 24 hours.

### PL21. Switch the CronJobs to the `jobs_rw` role
- Why: collectors, prices and reconcile run with the superuser today.
- Steps: 1) Per job, list tables written and read (from `src/jobs/*.ts`). 2) Adjust the grants matrix and migration `0xx_jobs_grants.sql`. 3) Change `DATABASE_URL` in each CronJob to the `jobs_rw` secret, one job per infra PR in schedule order. 4) Extend `cronjob-order.test.ts` so no CronJob mounts the superuser secret.
- Acceptance: each job completes on its next schedule with no `permission denied` in its log; test fails if a CronJob references the superuser key.
- Size: M
- Depends on: PL20
- Who: agent
- Approval needed: cluster write, secrets
- Risk or open question: `retention` deletes rows and `backup` needs read of everything; these two may keep a more privileged role by design.

## Group E: Backups and restore

### PL22. Pick the backup target and enable the CronJob
- Synthesis note: PL22, PL23 and PL24 together are tasks-open E1. W44 and D38 depend on them.
- Why: no backup exists; Postgres is on one node's `local-path` volume (E1; `deploy/README.md` warns node loss makes the volume unavailable). Needed before any real user data.
- Steps: 1) Owner picks a target (decision 2). Candidate: SFTP restic repository as the manifest expects, or S3 compatible storage. Terms and price unverified. 2) Create `invest-buddy-backup-secrets` through the sealed flow (`RESTIC_PASSWORD`, `RESTIC_REPOSITORY`, `ssh_key`, `known_hosts`). 3) Run one manual Job from the CronJob, then unsuspend. 4) Store the restic password in the owner's password manager as a second copy.
- Acceptance: `restic snapshots` (run in a one-off Job) lists a snapshot tagged `postgres` from today; the CronJob shows a completed run the next night at 02:30; the restic password exists in two places (owner confirms).
- Size: S
- Depends on: none
- Who: owner for target and credentials, agent for manifests
- Approval needed: spend or third-party signup, new secrets, cluster write
- Risk or open question: losing the restic password makes all backups unreadable.

### PL23. Harden the backup script
- Why: `base/backup-cronjob.yaml` dumps plain SQL with `--clean --if-exists`, keeps 7 daily and 4 weekly, and has no size check or integrity check.
- Steps: 1) Use `pg_dump --format=custom`, check dump size above a minimum, run `restic check --read-data-subset=5%` weekly. 2) Print one JSON line at the end (bytes, duration, snapshot id) so PL26 can store it. 3) Dump roles with `pg_dumpall --roles-only` without passwords into the same snapshot, or document that PL19 recreates roles. 4) Test the script with a local Postgres and a local restic repository (`scripts/backup.test.sh`).
- Acceptance: script test produces a snapshot and the dump restores with `pg_restore --list` listing all public tables; a zero-byte dump makes the script exit non-zero.
- Size: S
- Depends on: PL22
- Who: agent
- Approval needed: cluster write when the ConfigMap changes
- Risk or open question: custom format needs `pg_restore`, already in the image (`postgresql-client`).

### PL24. Restore test, scripted and written up
- Why: backups are worthless unproven (E1 DoD: "one restore test written up"); needed before the waitlist stores emails.
- Steps: 1) `scripts/restore-test.sh`: one-off Job restores the latest snapshot into a scratch database `restore_test` on the same Postgres (or a throwaway pod), compares row counts of `score_results`, `daily_bars`, `source_documents`, `trade_ideas`, runs `npm run migrate` against it (must apply nothing), and starts the web image pointed at it for a `/api/health` call. 2) Drop the scratch database. 3) Write `docs/restore-runbook.md` with timings and the node-loss procedure (new PVC, restore, run PL20 role step). 4) Schedule the check monthly (CronJob, suspended until the owner enables) and after each schema change that adds a table.
- Acceptance: the written result lists snapshot id, restore duration, row counts live versus restored (equal within the dump time), and the health check output; a second person (or agent) can follow the runbook without extra help; time to restore is recorded for decision 5.
- Size: M
- Depends on: PL23
- Who: agent
- Approval needed: cluster write (scratch database and one-off Job)
- Risk or open question: restoring on the same node does not prove recovery from node loss; the runbook step for a fresh node is only reasoned, so mark it untested unless a spare node is used.

## Group F: Monitoring and alerts (light)

### PL25. Alert channel and notifier module
- Synthesis note: the mailer is W12 (`src/mail/mailer.ts`). When the owner picks email as the alert channel, this notifier sends through it, so it depends on W12; a webhook channel does not.
- Why: no working alerting (Alertmanager Pending, see facts); digest uses `ConsoleMailer` which only logs (`src/jobs/digest.ts`); waitlist and alerts need a real mailer later. E2 says "a test alert fires and reaches you".
- Steps: 1) Owner answers decisions 1 and 8. 2) `src/notify/notifier.ts` interface with `send({channel, subject, body})`, an implementation for the chosen channel (webhook or SMTP), and a `ConsoleNotifier` for tests. 3) Config via env, secret sealed per PL31. 4) Test with a local HTTP sink: success, timeout, non-2xx. 5) Provider terms: record the URL, data location and date; mark unverified until read.
- Acceptance: a one-off Job sends a test message that the owner confirms received (timestamp noted); unit tests cover three failure cases; no token appears in logs (test with the logger).
- Size: M
- Depends on: PL31, W12 (email channel only)
- Who: agent, owner signs up for the channel
- Approval needed: third-party signup, new secret, cluster write for the test Job
- Risk or open question: the same module serves digest and waitlist mail; coordinate with the growth lane so only one mailer is built.

### PL26. Store job results in the database
- Synthesis note: step 4 edits `src/jobs/retention.ts`; land after D5.
- Why: `runLoggedJob` writes stdout only (`src/jobs/job-log.ts`), kubelet rotation drops old logs, and a job that never ran leaves nothing. Needed for alerts and for the ops report.
- Steps: 1) Migration `0xx_job_runs.sql`: `job_runs(job text, run_id uuid, started_at, ended_at, status, duration_ms, counts jsonb, max_rss_mb)` with index on `(job, started_at desc)` and grants (PL19 rule). 2) In `runLoggedJob`, insert at start and update at end using a small pool; a DB failure must not fail the job (log and continue). 3) Add `process.resourceUsage().maxRSS` (feeds PL38). 4) Retention: delete rows older than 400 days in `retention.ts`. 5) Tests in `src/jobs/job-log.test.ts`: ok, partial, failed, and DB down.
- Acceptance: after one run of each CronJob on staging, `SELECT job, status, ended_at FROM job_runs` shows all; killing the DB during a job still ends with the job's own exit code; log lines unchanged (existing tests pass).
- Size: M
- Depends on: PL15, PL19
- Who: agent
- Approval needed: live migration (on deploy)
- Risk or open question: the scanner jobs (`scanner/run-extract.mjs`, `run-judge.mjs`) are Node scripts outside `runLoggedJob`; they need the same hook or a post to an ingest route.

### PL27. Watchdog job
- Why: E2 and H1: a failed judge Job raised no alert; a CronJob that does not run is invisible. Prometheus rules are not an option now.
- Steps: 1) `src/jobs/watchdog.ts`: reads `job_runs` and the expected schedule table (one TypeScript map generated by a test from the CronJob manifests so they cannot drift), alerts when a job has no `ok` or `partial` run since its last expected time plus grace, when `/api/health` freshness dates are stale, when the DB size passes 70% of the PVC (`pg_database_size`), when a TLS certificate expires within 14 days (HTTPS handshake to the public host), and when the AI ceiling stop (exit 5) occurred. 2) CronJob `invest-buddy-watchdog` weekdays at 07:45 plus a daily noon run, `concurrencyPolicy: Forbid`. 3) Suppress duplicates for 24 hours (table `alert_state`). 4) Tests with fake clock for each rule.
- Acceptance: on staging, suspending one job produces exactly one alert in the next watchdog run and none in the following one within 24 hours; the manifest-derived schedule test fails when a CronJob is added without an entry; owner receives a test alert.
- Size: M
- Depends on: PL25, PL26
- Who: agent
- Approval needed: cluster write (new CronJob), new secret if not yet sealed
- Risk or open question: Saturday jobs and the weekday chain differ; the grace values are guesses until a week of data exists.

### PL28. External uptime and dead-man check
- Why: the watchdog runs inside the cluster; if the cluster or ingress is down it cannot report. 
- Steps: 1) Pick an external check (a free uptime service or a cron on the owner's Mac via launchd that curls `/api/health` and the home page and sends a message; services and terms unverified). 2) Have the watchdog ping a heartbeat URL after each run so silence alerts the owner. 3) Document the setup in `docs/ops-monitoring.md`.
- Acceptance: stopping the web Deployment on staging (or blocking the host) makes the external check send a message within 10 minutes; stopping the watchdog CronJob triggers the dead-man alert on the next missed ping (both shown with timestamps).
- Size: S
- Depends on: PL27
- Who: owner signs up, agent wires
- Approval needed: third-party signup
- Risk or open question: free uptime tiers and their commercial use terms are unverified.

### PL29. Owner ops report endpoint
- Synthesis note: this endpoint also carries the lane DATA coverage block (D39) and reuses the D1 inventory queries and the EN32 cost report.
- Why: facts about job health, AI use, DB size and data calls are spread over `ai-budget?report=usage`, kubectl and logs. Needed for the weekly status and the cost guard.
- Steps: 1) `GET /api/ingest/ops-report` (owner token, same auth as `ai-budget`) returning: last 14 days of `job_runs` per job, freshness dates (moved from `/api/health`), DB size, row counts of top tables, AI usage summary (reuse `src/db/ai-usage-report.ts`), data call counts (PL42). 2) `npm run ops-report` prints it as text. 3) Tests with a seeded DB.
- Acceptance: response schema tested; unauthenticated call returns 401 (test); the report runs against staging and prod (read only) and the output is pasted into the next STATUS update.
- Size: M
- Depends on: PL18, PL26
- Who: agent
- Approval needed: none
- Risk or open question: public route is blocked for `/api/ingest` by the Traefik rewrite in `public-ingress-filter.yaml`, so this stays internal; the owner reaches it by port-forward (a read-only action).

## Group G: Secrets, rate limits and security

### PL30. Secrets inventory and rotation calendar
- Why: secrets are spread over `invest-buddy-secrets`, `-scanner-secrets`, `-market-secrets`, `-source-keys`, `-flex-secrets`, `-backup-secrets`, `-codex-auth-seed`, plus GitHub `INFRA_REPO_TOKEN`. No list of owner, purpose, expiry or rotation step. `deploy/README.md` documents only the Claude, Codex and ingest cases.
- Steps: 1) `docs/secrets.md`: table of every secret name and key (names only, no values) from `kubectl -n invest get secret` and `get sealedsecret` metadata, GitHub secrets list names (`gh secret list`), purpose, who can rotate, expiry if known, rotation steps. 2) Mark unknown expiries (the `claude setup-token` lifetime is not documented in the repo, unverified). 3) Add reserved placeholder names for later secrets: session or auth signing key, payment keys and webhook secret, mail key, DB role URLs. 4) Calendar entries as a section of the file.
- Acceptance: every key in `kubectl -n invest get secret -o json | jq` metadata (names only) appears in the file (a script `scripts/secrets-doc-check.sh` compares, read only); no value in the file (gitleaks passes).
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none (metadata reads only)
- Risk or open question: reading secret key names via `kubectl get secret -o json` also returns values; the script must use `jq 'keys'` on `.data` and never print values.

### PL31. Seal helper and no-plaintext-secret test
- Why: sealing is a manual snippet in `deploy/README.md` using `/tmp` files and `read -rs`; easy to get wrong when ten new secrets are needed.
- Steps: 1) `scripts/seal-secret.sh <name> <namespace> <key>...` reading each value from the terminal without echo, fetching the cert read-only, writing the sealed YAML to a path outside the repo until reviewed. 2) Test with a stub `kubeseal` for argument handling. 3) Add a test that fails when any manifest in `deploy/` has `kind: Secret` with `data` or `stringData`, except files named `*.placeholder.yaml`.
- Acceptance: script produces valid SealedSecret YAML for a dummy value with a test cert (shown in the PR, dummy only); the plaintext test fails on a fixture with a Secret; gitleaks stays green.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none to build; sealing real secrets needs owner input each time
- Risk or open question: the sealed-secrets controller name and namespace come from `deploy/README.md` (`sealed-secrets` in `kube-system`); the script should read them from args.

### PL32. Config validation and a flag inventory
- Synthesis note: W1 owns the flag module `src/config/flags.ts`. The env schema here goes in `src/config/env.ts` (a file `src/config.ts` next to the folder `src/config/` would make `@/config` ambiguous). The payment flag is `BILLING`, as in W1, not `PAYMENTS`.
- Why: behaviour is controlled by many env vars (`DATA_MODE`, `IDEAS_PAGE`, `OWNER_VIEW`, `PAYWALL`, `AI_DAILY_TOKEN_CEILING`, `INFRA_BUMP`, `MACRO_*`). A typo silently turns a feature off or, worse, on. Payments need a kill switch.
- Steps: 1) `src/config/env.ts` with a zod schema listing every env var the web reads, defaults, and a startup check that fails the web with a clear message (names only, never values). 2) `docs/flags.md` listing each flag, default, who may change it, and its effect; reserve `BILLING` (default off) and `PAYWALL` (default off, per `docs/paywall-segments.md`). 3) A test that scans `process.env.` references in `src/` and fails when a variable is missing from the schema.
- Acceptance: the web refuses to start with `DATA_MODE=bogus` (test); the scan test fails when a new `process.env.FOO` is added without a schema entry; `docs/flags.md` matches the schema (test compares names).
- Size: M
- Depends on: W1
- Who: agent
- Approval needed: none
- Risk or open question: job scripts under `scanner/` read env too; cover them in a second schema or leave out and say so.

### PL33. Rate limit utility and limits on public routes
- Synthesis note: merged into W7. W7 builds the single app limiter (`src/security/rate-limit.ts`, not `src/lib/rate-limit.ts`) and carries this task's eviction and forged-header acceptance. Do not build a second limiter. References to PL33 in other tasks mean W7.
- Why: the only limiter is in-memory on `/api/ingest/scan`; public pages, `/api/health` and future signup, login and webhook routes have none.
- Steps: 1) `src/lib/rate-limit.ts`: fixed or sliding window, key function, in-memory with a size cap and eviction, optional Postgres backing for auth routes (single web replica today, so memory is enough; note it breaks with replicas). 2) Use the real client IP only from the header set by Traefik (check which header Traefik forwards; the current code trusts the first `x-forwarded-for` value, which a client can forge unless Traefik overwrites it). 3) Apply to `/api/health` and to a stub for later routes. 4) Tests: window reset, eviction, forged header.
- Acceptance: unit tests pass; on staging 200 requests in 10 seconds to a limited route yield 429 after the limit and recover after the window; log line shows `rate_limited` without the raw IP (hash only).
- Size: M
- Depends on: PL18
- Who: agent
- Approval needed: none
- Risk or open question: whether Traefik overwrites `x-forwarded-for` from untrusted clients on this cluster is unverified; check the Traefik `forwardedHeaders` settings in infra first.

### PL34. Traefik rate limit and security headers
- Synthesis note: the CSP and app headers in `next.config.ts` are built in W7; this task keeps the Traefik middlewares (rate limit and headers), including W7's optional step 4.
- Why: app limits do not stop floods before they reach Node; `next.config.ts` sets no headers (no CSP, no HSTS, no frame protection).
- Steps: 1) Add a Traefik `Middleware` `rateLimit` (average and burst values from PL39 numbers) and a `headers` middleware (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`) to `base/`, referenced by `ingress.yaml`. 2) Add a Content-Security-Policy in `next.config.ts` `headers()` using nonces only if needed; start in report-only mode. 3) Test in `src/` that the config exports the headers; a staging curl check in `scripts/verify-deploy.sh`.
- Acceptance: `curl -sI` on staging shows the headers; Next pages still render (smoke job PL13 passes); the CSP report-only mode logs no violation on the main pages for a week before enforcement (record).
- Size: M
- Depends on: PL13, PL14, PL39
- Who: agent
- Approval needed: cluster write (infra)
- Risk or open question: a strict CSP can break inline styles used by the 404 page in `src/proxy.ts`, which writes inline HTML and CSS.

### PL35. Security checklist for auth and payment code
- Synthesis note: the tasks from other lanes are known now: auth W27, W28, W29; billing W40, W41, W42; waitlist W11, W14, W15.
- Why: accounts and payments are built in other lanes in this window; a checklist before the code exists avoids rework. Source: `docs/paywall-segments.md` (gate design), research/billing.md.
- Steps: 1) Write `docs/security-checklist-accounts-payments.md`: session cookie flags and rotation, magic link single use and expiry, CSRF, login and reset rate limits (PL33), email enumeration, webhook signature check on the raw body, idempotency by event id, replay window, no card data stored, least privilege DB role for account tables (PL19), audit log of subscription changes, admin actions, secrets (PL30), logging redaction, account deletion path (PL44). 2) For each item name the test that proves it. 3) Link from the PR template when a PR touches auth or billing paths.
- Acceptance: checklist merged; the PR template references it; every item has a named test file or marked "manual review"; the other lanes' auth and billing tasks cite it (owner or coordinator confirms).
- Size: S
- Depends on: PL19, PL33
- Who: agent
- Approval needed: none
- Risk or open question: payment provider is not yet chosen (billing.md says Stripe needs pre-approval, Paddle AUP bans signals); items stay provider-neutral.

### PL36. Scheduled scanning, dependency policy and GHAS decision
- Why: Trivy scans only at build time with `ignore-unfixed`; CodeQL and dependency-review are skipped; Dependabot already limits to minor and patch with groups (the H5 note is partly out of date: `.github/dependabot.yml` ignores semver-major).
- Steps: 1) Weekly workflow `scan-deployed.yml`: pull the tag currently pinned in `overlays/prod` and run Trivy on it, plus `npm audit --omit=dev`; open an issue on HIGH or CRITICAL. 2) Update `docs/tasks-open.md` H5 to match the config. 3) Add a monthly manual major-upgrade task: the owner picks one major (Node, TypeScript, ESLint, vitest) per month; record Node 22 support end date after checking https://nodejs.org/en/about/previous-releases (unverified). 4) Record the GHAS decision (cost unverified: https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security); if no, keep gitleaks and Trivy and note the CodeQL gap in the release checklist.
- Acceptance: the workflow runs once manually and produces a report (or "no findings"); H5 text updated; decision 4 recorded in `docs/security-checklist-accounts-payments.md`.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: spend if GHAS or Pro is chosen
- Risk or open question: scanning the pinned image needs read access to GHCR from CI (the repo token has it for the same owner).

### PL37. Pre-launch security review of auth and payment code
- Synthesis note: run a first pass over the waitlist routes (W11, W14, W15) before the waitlist gate, and the full pass over auth and billing once W42 is merged.
- Why: required gate before payments can be switched on after the window; a second set of eyes on code written fast by agents.
- Steps: 1) When the auth and billing PRs from the other lanes are merged to staging, run the checklist (PL35) line by line. 2) Run `/security-review` on each PR and one independent reviewer (different model) over the full auth and billing diff. 3) Attempt: forged webhook, replayed webhook, expired and reused magic link, role escalation to `web_ro` writes, rate limit bypass via header. 4) Write `docs/security-review-2026-12.md` with findings and fixes.
- Acceptance: every checklist item has a result; zero open HIGH findings; each attack above has a test that now passes (added to the repo); owner reads and signs the summary.
- Size: L
- Depends on: PL13, PL20, W7 (PL33), PL35, W27, W28, W29, W40, W41, W42; first pass only W11, W14, W15
- Who: agent reviews, owner signs
- Approval needed: none for review; legal sign-off on payments is outside this window
- Risk or open question: if the other lanes slip, this task has nothing to review; it then becomes a review of the waitlist code only.

## Group H: Performance, capacity and cost

### PL38. Resource right-sizing and an availability note
- Why: one worker holds web, Postgres, all Jobs and 55 pods; limits are 132% of CPU. Job memory limits were chosen without data. A single node with `local-path` means node loss is downtime plus restore (decision 5).
- Steps: 1) Use `max_rss_mb` from PL26 over two weeks plus `kubectl top pod` samples during the nightly chain to table request and limit per CronJob. 2) Check the chain overlaps (prices to judge, `deploy/README.md` order) do not exceed node memory (sum of concurrent limits). 3) Adjust `resources` in infra manifests; add `NODE_OPTIONS=--max-old-space-size` below the web limit (384Mi). 4) Write `docs/capacity-and-availability.md`: single node, no HA, RTO and RPO from PL24 timings, disk (38 GB ephemeral allocatable), PVC use and growth rate (30 MB now), and the owner's decision 5.
- Acceptance: table with measured peaks and dates; no OOMKilled in `kubectl -n invest get pods -o json | jq` for two weeks (read only check); the doc states RTO and RPO as measured numbers.
- Size: M
- Depends on: PL24, PL26
- Who: agent
- Approval needed: cluster write (infra resource edits)
- Risk or open question: the Claude CLI based jobs spawn child processes; their memory may not show in Node RSS.

### PL39. Load baseline on staging
- Why: nothing is known about how many page views the web survives at 300m CPU and 384Mi. A waitlist launch can create a spike.
- Steps: 1) Script `scripts/load-test.mjs` (autocannon, licence MIT per memory, unverified: https://github.com/mcollina/autocannon) against staging only (never prod) for dashboard, company page, landing in EN and SK, with a ramp. 2) Record requests per second, p95 latency, memory and CPU from `kubectl top`, errors. 3) Feed numbers to PL34 rate limits and to the release checklist. 4) Note the effect of Next.js caching and the DB pool (PL18).
- Acceptance: a table in `docs/capacity-and-availability.md` with the three runs; the owner can read the maximum sustained rate before p95 exceeds 1 second; no prod host appears in the script (test refuses `invest.filipcsupka.online`).
- Size: S
- Depends on: PL14, PL18
- Who: agent
- Approval needed: none beyond staging being deployed
- Risk or open question: staging and prod share one node, so a load test can slow prod jobs; run it in a quiet window (not 00:30 to 06:00 Bratislava).

### PL40. AI cost ceiling and weekly cost report
- Synthesis note: the judge must honour the ceiling before it is set for judge; that is EN32.
- Why: `AI_DAILY_TOKEN_CEILING` defaults to 0, so only the soft stops at 85% and 90% protect the shared subscription (`docs/logging.md`). More discovery and ranking this window means more calls.
- Steps: 1) Read 30 days of `GET /api/ingest/ai-budget?report=usage` (internal) and choose a ceiling at a multiple of the observed daily peak (value decided with the owner; 806,713 tokens was one day's total on 2026-10-09, one data point). 2) Set the ceiling in infra for extract and judge. 3) Add the per-job token and cost summary to the ops report (PL29) and to a weekly Monday line in STATUS. 4) Watchdog (PL27) alerts on exit 5 and on a week above a set share of the ceiling. 5) Tests: ceiling reached leaves the gate pending (exists, `scanner/test/ai-budget.test.mjs`); add the report section test.
- Acceptance: ceiling live and visible in `kubectl -n invest get cronjob invest-buddy-extract -o yaml` (read only); a forced test Job with a tiny ceiling exits 5 and the watchdog alerts once; the weekly report shows tokens per job per day.
- Size: S
- Depends on: PL27, PL29, EN32
- Who: agent
- Approval needed: cluster write (env change in infra)
- Risk or open question: tokens are not dollars on a subscription; the dollar figure printed by the CLI meter is an estimate, not a bill.

### PL41. Claude quota calendar, terms check and API fallback estimate
- Why: nightly jobs and interactive or Orca agent work share the subscription windows (`docs/tasks-accounts-needed.md` row 13). Account pool: two accounts, jobs token binds to one (decision 10). Policy file: `agent-tools/claude-pool/coordinator-policy.md` (checkpoint at about 90%).
- Steps: 1) `docs/quota-plan.md`: job windows by time (extract 01:50, judge 05:30, Saturday review 11:00, discovery 09:30) against the days when Orca workers run; rule: bulk agent waves start after 07:00 Bratislava and check `npm run ai-usage` first; which account runs which job. 2) Read the Anthropic terms on automated and commercial use of subscription tokens and record the URL, date and the exact clause, or mark unverified (https://www.anthropic.com/legal/consumer-terms and https://www.anthropic.com/legal/commercial-terms, not fetched here). 3) `scripts/ai-cost-estimate.ts`: from `ai_budget_calls` compute what the same tokens would cost on the API using a price table in `config/ai-prices.json` that the owner fills (do not hard-code prices; mark unverified). 4) Add the result to the release checklist as the paid-launch cost line.
- Acceptance: `docs/quota-plan.md` merged and linked from `docs/logging.md`; the estimate script prints tokens and cost per job for the last 30 days from the ledger and refuses to run with an empty price file (test); terms clause recorded or an explicit "unverified" with an owner action.
- Size: S
- Depends on: PL40
- Who: agent drafts, owner confirms terms and prices
- Approval needed: legal (terms reading by the owner or lawyer), possible spend if an API key is needed
- Risk or open question: if automated subscription use for a paid product is not allowed, the whole nightly pipeline needs an API budget before launch.

### PL42. Data call ledger and guard
- Synthesis note: merged into D8. The ledger is D8's `api_usage` and the guard is `src/data/usage.ts`; the reserved `prices` share and the `quota_skip` partial status from this task are in D8's acceptance. `prices` makes 37 requests (36 tickers plus SPY, lane DATA), not 36.
- Why: this window adds data sources (other lane). Twelve Data allows 8 per minute and 800 per day on the current plan (`deploy/README.md`); `prices` uses 36 calls and discovery adds more; SEC has its own rate rules (the repo caps at 4 req/s, the SEC limit was not rechecked here). One extra job can silently starve `prices`.
- Steps: 1) Migration `0xx_api_calls.sql`: `api_calls(provider, day, count, last_at)`. 2) `src/data/call-guard.ts` wrapping provider clients (`src/data/twelvedata.ts`, `src/collectors/sources/*`) with per-provider daily and per-minute limits from `config/providers.json` (values from `docs/data.md` and the plan page; mark unverified ones). 3) A job that would exceed its share logs `quota_skip` and exits with a partial status instead of failing. 4) Reserve a share for `prices` (the benchmark of record). 5) Tests with fake clock.
- Acceptance: tests show a second job cannot take the reserved share; `ops-report` lists calls per provider per day; `prices` still fetches 36 symbols when discovery runs at the limit (test).
- Size: M
- Depends on: PL19, PL26
- Who: agent
- Approval needed: live migration on deploy
- Risk or open question: provider plans can change; the config carries a date per limit. Other lanes adding sources must use the wrapper; add to the PR template.

## Group I: GDPR groundwork and release

### PL43. Personal data inventory and privacy text alignment
- Synthesis note: W18 writes the privacy page from this inventory, and W39 uses this file as its data map.
- Why: waitlist emails and later accounts are personal data. Existing privacy page is a short stub (`src/app/[locale]/legal/privacy`, 1,080 bytes of source). This is not legal advice; a lawyer reviews (research/regulatory.md lists GDPR as open).
- Steps: 1) `docs/privacy-inventory.md`: per data item (waitlist email, locale, consent time and wording, source or UTM, account email, subscription status, payment customer id, IP in logs and rate limit hash, owner's own broker data) state purpose, lawful basis as proposed for the lawyer to confirm, where stored (table, log, backup, mail provider, payment provider), retention, who can read it. 2) Check the site for cookies and trackers (`grep` for `cookie`, analytics; none found in `src` by name search on 2026-10-09, confirm with a browser run) and list processors with DPA status unknown. 3) Draft the privacy page text in EN and SK from the inventory, marked "draft for lawyer review". 4) Answer decisions 7 and 9 in the doc.
- Acceptance: every table that can hold personal data in the migrations is in the inventory (script `scripts/pii-columns-check.mjs` lists columns named `email`, `ip`, `name`, `customer` and fails when one is missing from the doc, with a test); privacy page text exists in both languages with the contact and operator fields filled or flagged; the owner marks the lawyer questions list.
- Size: M
- Depends on: none
- Who: agent drafts, owner and lawyer decide
- Approval needed: legal (lawyer review before launch)
- Risk or open question: lawful basis and the need for a data protection officer or records of processing are legal questions, not decided here.

### PL44. Deletion, export and waitlist retention
- Synthesis note: the waitlist table is W11, and W11 owns the purge of unconfirmed rows from step 3; this task keeps the rate limit rows purge, the registry and the scripts. W39 builds the account page on top.
- Why: a deletion path must exist before collecting emails; backups keep copies (restic keeps 7 daily and 4 weekly, `base/backup-cronjob.yaml`).
- Steps: 1) `scripts/gdpr-delete.ts <email>`: deletes or anonymises rows in waitlist and account tables (names from the other lanes; create a registry `src/privacy/registry.ts` that each table's owner adds to, and a test that every table with an `email` column is registered). 2) `scripts/gdpr-export.ts <email>` returns the person's rows as JSON. 3) Extend `src/jobs/retention.ts` to purge unconfirmed waitlist rows after N days (N chosen with the owner) and old rate limit rows. 4) Document the backup delay: deleted data can persist in snapshots up to the keep window; no snapshot rewrite is proposed. 5) Request log: confirm no email or IP is logged (test on the logger).
- Acceptance: tests create a waitlist row, export it, delete it, and show zero rows afterwards; the registry test fails for an unregistered table; `retention` dry run reports counts; the doc states the backup retention period.
- Size: M
- Depends on: PL19, PL43, W11
- Who: agent
- Approval needed: none to build; running a deletion on prod data needs owner approval each time
- Risk or open question: statutory response times and the backup handling are for the lawyer.

### PL45. Release checklist and launch drill for the year-end waitlist launch
- Synthesis note: W26 (runbook and preflight script) is one line of this checklist. Tasks deferred past the window (cut list in `docs/roadmap/README.md`, for example PL28, PL34, PL39) become signed accepted-risk lines instead of blockers.
- Why: ties the lane together; the owner wants marketing and a waitlist at year end with free and paid tiers built but payment off.
- Steps: 1) `docs/release-checklist-waitlist.md` as a go or no-go list with owner sign-off lines: CI green and PL1 fixed; last restore test within 14 days (PL24); alert test within 7 days (PL27, PL28); secrets inventory current (PL30); role split live (PL20, PL21); security review done (PL37); rate limits on (W7, PL34); privacy text and deletion path live (PL43, PL44); mailer and double opt-in tested (PL25, W12, W14, W15); flags `PAYWALL` and `BILLING` off and verified (PL32); load numbers known (PL39); AI ceiling and quota plan (PL40, PL41); backup of the day before launch exists; rollback steps written; owner on call plan for launch week. 2) Add a change freeze rule for the days before launch, date chosen by the owner. 3) Drill on staging: deploy, break the web image, roll back through infra revert, restore a backup, receive an alert, delete a test waitlist entry; record timings. 4) A launch day sequence: pin tag, verify with PL5, post-launch checks at 1, 6 and 24 hours (read only).
- Acceptance: every line has an owner, a proof link (log, PR, doc) and a date; the drill is written up with timings and failures found; the owner signs go or no-go; the checklist is dated and kept in ops-brain next to STATUS.
- Size: M
- Depends on: PL5, PL20, PL21, PL24, PL27, PL28, PL30, PL32, PL33, PL34, PL37, PL39, PL40, PL41, PL43, PL44
- Who: agent drafts and runs the drill, owner signs
- Approval needed: cluster write for the drill on staging; legal for the privacy and terms lines
- Risk or open question: the drill can fail late in December; start the list in November and tick items as they land.

## Suggested order for the first four weeks

Synthesis note: the week plan in `docs/roadmap/README.md` replaces this order.

Week 1: PL1, PL5, PL7, PL15, PL22 (owner decision first), PL30, PL31. Week 2: PL2, PL4, PL8, PL9, PL12, PL23, PL18. Week 3: PL10, PL11, PL16, PL19, PL24, PL25, PL26. Week 4: PL27, PL6, PL14, PL13, PL32, PL42. The rest follow dependencies. Sizes sum to roughly 100 to 120 working days if done one after another, so run lanes in parallel and cut PL13, PL28, PL34 and PL39 first if time is short (my estimate, not measured).

## Overlaps to settle with other lanes

- Mailer and waitlist storage: PL25 and PL44 assume the growth lane builds the waitlist page and table. Synthesis note: settled; the web lane builds them (W11, W12, W14).
- Auth and billing code: this lane owns the checklist and the review, not the code.
- Data provider sources: PL42 assumes the data lane uses the call guard. Synthesis note: settled; PL42 is merged into D8.

## Changes by the synthesis

- Header: added the synthesis line (working copy, migration numbers are placeholders).
- Suggested order: replaced by the week plan in `docs/roadmap/README.md`.
- PL7: hot files list extended; migration rule applies to all lanes.
- PL8: step 2 changed, because `docs/roadmap/` now holds the corrected lane files; the docs check must keep tasks-open IDs and roadmap IDs apart (tasks-open D1 and D2 collide with lane DATA D1 and D2).
- PL10: step 2 uses the EN1 golden test and the EN11 guard; dependency EN1, EN11 added.
- PL11, PL14: W9 merged into PL14; W9's app-side items added to PL14's acceptance.
- PL13: becomes the DB-mode project in W8's Playwright setup; dependency W8 added.
- PL18: builds on W2's `src/db/pool.ts`; dependency W2 added.
- PL19: lists the new tables from other lanes that need grants.
- PL22: PL22 to PL24 are tasks-open E1.
- PL25: sends email through the W12 mailer; dependency W12 (email channel only) added.
- PL26: lands after D5 (shared `src/jobs/retention.ts`).
- PL29: also carries D39's data block and reuses D1 and EN32.
- PL32: schema file renamed to `src/config/env.ts`; reserved flag `PAYMENTS` renamed `BILLING`; dependency W1 added.
- PL33: merged into W7.
- PL34: Traefik side only; CSP stays in W7.
- PL35, PL37: other-lane task IDs filled in (W11, W14, W15, W27 to W29, W40 to W42); PL37 runs a first pass on the waitlist routes before the waitlist gate.
- PL40: dependency EN32 added.
- PL42: merged into D8; corrected the request count (`prices` makes 37 requests, not 36).
- PL43: W18 and W39 use this inventory.
- PL44: waitlist table is W11 (dependency line filled in); the unconfirmed-row purge belongs to W11.
- PL45: `PAYMENTS` renamed `BILLING`, PL33 replaced by W7, "growth lane" replaced by W12, W14, W15; W26 is a line; deferred tasks become signed accepted-risk lines.
- Overlaps section: marked the mailer, waitlist and call-guard overlaps as settled.
