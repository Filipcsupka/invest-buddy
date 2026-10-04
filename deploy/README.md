# InvestBuddy deployment proposal

PROPOSAL. The files under `deploy/gitops/` mirror paths in `~/moje/infra`; this repository does not own the live cluster. The owner must approve every copy, commit, push, and Argo sync. The CI workflow publishes an image on `main`, but its infra pin job is disabled unless manually dispatched with `enable_infra_pin=true` after approval.

## Files

| Proposal path | Infra destination |
| --- | --- |
| `gitops/gitops/apps/invest-buddy/` | `gitops/apps/invest-buddy/` |
| `gitops/argocd/apps/web/invest-buddy.yaml` | `argocd/apps/web/invest-buddy.yaml` |
| `gitops/argocd/apps/web/kustomization.patch` | patch for `argocd/apps/web/kustomization.yaml` |
| `gitops/argocd/projects/default.patch` | patch for `argocd/projects/default.yaml` |
| `gitops/gitops/sealed-secrets/invest/*.placeholder.yaml` | templates only; do not copy or render |

The production overlay contains `sha-REPLACE_WITH_PUBLISHED_SHA`. Replace it with an image tag that exists in GHCR. The base references two Kubernetes Secrets, `invest-buddy-secrets` and `invest-buddy-backup-secrets`. The placeholder files are intentionally excluded from Kustomize because their ciphertext is invalid.

## Before rollout

The image contains `dist/jobs/daily.js`, `dist/jobs/digest.js`, and `dist/jobs/portfolio.js`, built by `npm run build:jobs`. The daily job runs at 23:30 on weekdays and the digest at 07:00 on weekdays in `Europe/Bratislava`. The digest needs `DIGEST_TO` in `invest-buddy-secrets`. The portfolio job is proposed for 06:00 UTC Tuesday through Saturday and starts suspended. It needs an Activity Flex Query with Open Positions and Change in NAV, plus `FLEX_TOKEN` and `FLEX_QUERY_ID` in a separate SealedSecret named `invest-buddy-flex-secrets`. Restrict the Flex token to the cluster egress IP and rotate it before expiry. Confirm the query fields, SPY data provider, market holidays, IBKR publication terms, and schedule before enabling it. A failed fetch keeps the last stored snapshot and its original date.

The `apps` AppProject currently lacks the `invest` destination. Its patch must be included with the application. PostgreSQL uses a 5 Gi `local-path` claim and is pinned to `k8s-worker-01`, where khtz places public apps and local volumes. The backup job uses the same image, with `pg_dump`, restic, and SSH installed in the runtime stage. It needs a tested SFTP restic repository reachable from that node over Tailscale. A local-path PVC has no node redundancy; verify a restore from the offsite repository before treating this as production ready.

## Seal secrets

Generate these files locally with real values outside Git. Use a trusted Sealed Secrets certificate for the target cluster; the commands below assume it has already been saved as `sealed-secrets.crt`. Avoid saving unencrypted Secret YAML to disk. Set the values interactively in the shell, and keep the two database password values consistent. URL-encode special characters in the password portion of `DATABASE_URL`. Verify the SSH host key against the backup host before putting it in `known_hosts`.

```sh
read -rs POSTGRES_PASSWORD
read -rs DATABASE_URL
read -r DIGEST_TO
read -rs RESTIC_PASSWORD
read -r RESTIC_REPOSITORY
kubectl create secret generic invest-buddy-secrets -n invest \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=DIGEST_TO="$DIGEST_TO" \
  --dry-run=client -o yaml \
  | kubeseal --cert sealed-secrets.crt --format yaml \
  > /tmp/invest-buddy-secrets.sealed.yaml
kubectl create secret generic invest-buddy-backup-secrets -n invest \
  --from-literal=RESTIC_PASSWORD="$RESTIC_PASSWORD" \
  --from-literal=RESTIC_REPOSITORY="$RESTIC_REPOSITORY" \
  --from-file=ssh_key=/path/to/backup-ssh-private-key \
  --from-file=known_hosts=/path/to/verified-known-hosts \
  --dry-run=client -o yaml \
  | kubeseal --cert sealed-secrets.crt --format yaml \
  > /tmp/invest-buddy-backup-secrets.sealed.yaml
unset POSTGRES_PASSWORD DATABASE_URL DIGEST_TO RESTIC_PASSWORD RESTIC_REPOSITORY
```

Check names and namespace in the sealed output without printing ciphertext. After owner approval, put the two sealed files in `gitops/apps/invest-buddy/base/` and add their names to `base/kustomization.yaml`. Do not copy the `.placeholder.yaml` files. Keep the real values out of shell history and Git.

Seal `FLEX_TOKEN` and `FLEX_QUERY_ID` into `invest-buddy-flex-secrets` for the same namespace before enabling the portfolio CronJob. The checked-in placeholder is not valid ciphertext. Apply `migrations/002_portfolio_snapshots.sql` through the migration runner before the portfolio job starts. The current SPY adapter uses a synthetic fixture and covers only its sample dates, so the proposed job needs a licensed market-data provider before it can publish current statements.

## Proposed infra copy

Run these commands only after the owner approves the complete infra diff, the sealed secrets, and the published image tag. `git apply --check` and `kubectl kustomize` are safe local checks before that approval.

```sh
cd /Users/filipcsupka/orca/workspaces/InvestBuddy/petrel
git -C /Users/filipcsupka/moje/infra apply --check "$PWD/deploy/gitops/argocd/apps/web/kustomization.patch"
git -C /Users/filipcsupka/moje/infra apply --check "$PWD/deploy/gitops/argocd/projects/default.patch"
cp -R deploy/gitops/gitops/apps/invest-buddy /Users/filipcsupka/moje/infra/gitops/apps/
cp deploy/gitops/argocd/apps/web/invest-buddy.yaml /Users/filipcsupka/moje/infra/argocd/apps/web/
git -C /Users/filipcsupka/moje/infra apply "$PWD/deploy/gitops/argocd/apps/web/kustomization.patch"
git -C /Users/filipcsupka/moje/infra apply "$PWD/deploy/gitops/argocd/projects/default.patch"
```

Copy the sealed outputs into the new base, add them to its Kustomization, and replace the overlay image tag before committing infra. Review `git diff --check` and `git diff` in infra. There is no direct `kubectl apply` step; khtz changes go through an approved infra commit and Argo CD.

## Verification and rollback

Before an approved infra commit:

```sh
kubectl kustomize /Users/filipcsupka/moje/infra/gitops/apps/invest-buddy/overlays/prod
kubectl kustomize /Users/filipcsupka/moje/infra/argocd/apps/web
git -C /Users/filipcsupka/moje/infra diff --check
git -C /Users/filipcsupka/moje/infra diff
```

After the approved GitOps rollout, the owner can inspect `argocd app get invest-buddy`, `kubectl -n invest get deploy,pods,svc,ingress,cronjob,pvc`, the cert-manager Certificate, job logs, and a restic restore in an isolated environment. Roll back by reverting the approved infra commit and pushing the revert after owner approval. Preserve the PostgreSQL PVC and backup repository during rollback; deleting either requires a separate decision.
