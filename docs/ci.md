# CI

GitHub Actions minutes are limited (free allowance used up, capped budget; owner decision 2026-10-11, task PL46). Every PR and push runs only the cheap checks. The heavy security scans run nightly and before launch.

## What runs when

| Trigger | Workflow | Jobs |
| --- | --- | --- |
| Pull request (code) | Build | `quality` (lint, typecheck, migrate, tests with the runner PostgreSQL, build, `npm audit`, manifest check), `secret-scan` |
| Pull request touching `Dockerfile`, `scanner/Dockerfile`, `package.json`, `package-lock.json` or `deploy/` | Build | the above plus `docker-build` (both images, buildx with GHA cache, no push, no scan) |
| Pull request touching only `docs/*`, `docs/roadmap/**`, root `*.md` or `.github/ISSUE_TEMPLATE/**` | none | workflow skipped |
| Pull request touching `package.json` or `package-lock.json` | Security | `dependency-review` (only when `GHAS_ENABLED=true`) |
| Push to `main` | Build | `quality`, `secret-scan`, then `publish-images` (build once, push `sha-<7>` and `latest`), then `deploy-gitops` (only when `INFRA_BUMP=true`) |
| Nightly 03:15 UTC, manual | Security | `trivy` on the published `latest` web and scanner images, no rebuild |
| Weekly Monday 03:23 UTC, manual | CodeQL | `analyze` (only when `GHAS_ENABLED=true`) |

Notes:
- `docs/design` is not skipped because `src/i18n/status-copy.test.ts` reads `docs/design/status-slider.md`.
- The repository is private on the free plan, so branch protection and required checks are not available (GitHub returns 403). A skipped workflow therefore cannot block a merge. If branch protection is enabled later, a required check from a skipped workflow stays pending; use a path-aware summary job or do not require it.
- PR runs cancel earlier runs of the same PR (`cancel-in-progress`).
- A failed nightly scan is a red run of the Security workflow. It does not block `deploy-gitops`, which lives in Build.

## Cost reasoning

- Trivy and the image build were the longest jobs and ran on every PR and every main push. Now images are built once, on main, and PRs only build them when the inputs change.
- The scan reads the image already pushed to GHCR, so it costs scan time only, once a day.
- CodeQL runs weekly instead of on every PR and push.
- Docs-only PRs cost nothing.
- Trade-off: a vulnerable base image or dependency can reach `main` and be deployed up to a day before the scan reports it. `npm audit --audit-level=high` still runs in `quality` on every PR.

## Run the full security scan manually

1. Actions, Security, Run workflow. Leave `image_tag` as `latest` or enter `sha-<7>`.
2. Actions, CodeQL, Run workflow (needs `GHAS_ENABLED=true`).
3. Read the job logs. A red `trivy` job lists HIGH and CRITICAL findings that have a fix.

## Launch gate checklist

- [ ] `main` is the commit that will be launched and its Build run is green.
- [ ] Security workflow run manually on that image: no open HIGH or CRITICAL findings, or each has a signed accepted-risk line.
- [ ] CodeQL run manually: findings reviewed.
- [ ] `dependency-review` or `npm audit` reviewed for the last dependency changes.
- [ ] Findings and fixes recorded in the security review (PL37, `docs/roadmap/lane-platform.md`).
- [ ] Result entered in the release checklist (PL45, `docs/roadmap/lane-platform.md`).
