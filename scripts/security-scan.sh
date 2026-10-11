#!/usr/bin/env bash
# Local security scan, replaces the CI Trivy scan. See docs/ci.md.
# Usage: scripts/security-scan.sh [--local-image <tag>] [--skip-images] [--skip-fs]
# Exit 0 = clean, 1 = findings or a scan error.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/khtz}"
NAMESPACE="${NAMESPACE:-invest}"
TRIVY="${TRIVY:-trivy}"
# Same args as .github/workflows/security.yml
SEVERITY="HIGH,CRITICAL"
SKIP_DIRS="/usr/local/lib/node_modules/npm,/usr/local/lib/node_modules/corepack"

LOCAL_IMAGE=""
DO_FS=1
DO_IMAGES=1
while [ $# -gt 0 ]; do
  case "$1" in
    --local-image) LOCAL_IMAGE="${2:-}"; [ -n "$LOCAL_IMAGE" ] || { echo "--local-image needs a tag" >&2; exit 2; }; shift 2 ;;
    --skip-fs) DO_FS=0; shift ;;
    --skip-images) DO_IMAGES=0; shift ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

command -v "$TRIVY" >/dev/null || { echo "trivy not found (brew install trivy)" >&2; exit 2; }

RESULTS=()
FAILED=0
record() { # name, rc
  if [ "$2" -eq 0 ]; then RESULTS+=("PASS  $1"); else RESULTS+=("FAIL  $1 (exit $2)"); FAILED=1; fi
}

if [ "$DO_FS" -eq 1 ]; then
  echo "== trivy fs: dependencies, secrets, Dockerfile misconfig (Kubernetes manifests not scanned) =="
  "$TRIVY" fs --scanners vuln,secret,misconfig --misconfig-scanners dockerfile --severity "$SEVERITY" --ignore-unfixed \
    --skip-dirs node_modules,.git,.next,dist --exit-code 1 "$ROOT"
  record "repo filesystem" $?
fi

scan_image() { # label, ref, extra args...
  local label="$1" ref="$2"; shift 2
  echo "== trivy image: $label ($ref) =="
  "$TRIVY" image "$@" --severity "$SEVERITY" --ignore-unfixed --pkg-types os,library \
    --skip-dirs "$SKIP_DIRS" --exit-code 1 "$ref"
  record "$label $ref" $?
}

if [ "$DO_IMAGES" -eq 1 ]; then
  if ! command -v kubectl >/dev/null; then
    echo "kubectl not found" >&2; record "read deployed tags" 2
  else
    export KUBECONFIG
    WEB="$(kubectl -n "$NAMESPACE" get deploy invest-buddy-web -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null)"
    SCANNER="$(kubectl -n "$NAMESPACE" get cronjob invest-buddy-extract -o jsonpath='{.spec.jobTemplate.spec.template.spec.containers[0].image}' 2>/dev/null)"
    if [ -z "$WEB" ] || [ -z "$SCANNER" ]; then
      echo "could not read deployed images from the cluster (KUBECONFIG=$KUBECONFIG, namespace $NAMESPACE)" >&2
      record "read deployed tags" 2
    else
      scan_image "deployed web" "$WEB" --image-src remote
      scan_image "deployed scanner" "$SCANNER" --image-src remote
    fi
  fi
fi

if [ -n "$LOCAL_IMAGE" ]; then
  if docker info >/dev/null 2>&1; then
    scan_image "local image" "$LOCAL_IMAGE" --image-src docker
  else
    echo "Docker is not running, cannot scan $LOCAL_IMAGE" >&2
    record "local image $LOCAL_IMAGE" 2
  fi
fi

echo
echo "== summary =="
printf '%s\n' "${RESULTS[@]}"
if [ "$FAILED" -eq 0 ]; then echo "result: clean"; else echo "result: findings or errors, see above"; fi
exit "$FAILED"
