#!/usr/bin/env bash
set -uo pipefail

# Runs screenshot capture and/or the e2e suite on GitHub Actions instead of
# locally — this repo is public, so standard GitHub-hosted runners are free
# and unlimited, and much faster than an old/slow local machine running
# Chrome + Puppeteer. See docs/dev-log/DEBUG_HARNESS.md Part E for the full
# design (including why/how uncommitted local changes reach the runner).
#
# Usage:
#   ./scripts/run-ci-puppeteer.sh --fixtures=name1,name2 [--ref=dev]
#   ./scripts/run-ci-puppeteer.sh --all-fixtures [--ref=dev]
#   ./scripts/run-ci-puppeteer.sh --e2e [--ref=dev]
#   ./scripts/run-ci-puppeteer.sh --fixtures=name1 --e2e   # both in one dispatch
#   ./scripts/run-ci-puppeteer.sh --all-fixtures --concurrency=3   # parallel capture pages
#
# Requires: gh CLI, already authenticated (`gh auth login`). Run from repo root.
# Leaves results in the exact same local paths the local scripts would:
#   tests/screenshots/*.png, tests/screenshots/index.json, tests/e2e-results/*
#
# CONCURRENCY: safe to invoke from multiple agents at the same time. Each run
# publishes its own snapshot to a UNIQUE disposable branch (ci-eval-<tag>) and
# the workflow's concurrency group is keyed on that per-run ref, so parallel
# dispatches neither race on a shared branch nor queue behind each other.

WORKFLOW="puppeteer-tests.yml"
TAG="run-$(date +%s)-$$"
BRANCH="ci-eval-$TAG"   # unique per invocation — never shared between runs
FIXTURES=""
ALL_FIXTURES=false
RUN_E2E=false
CONCURRENCY=2

for arg in "$@"; do
  case "$arg" in
    --ref=*) : ;; # accepted for compatibility; the dispatch ref is always this run's branch
    --fixtures=*) FIXTURES="${arg#*=}" ;;
    --all-fixtures) ALL_FIXTURES=true ;;
    --e2e) RUN_E2E=true ;;
    --concurrency=*) CONCURRENCY="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

if [ -z "$FIXTURES" ] && [ "$ALL_FIXTURES" = false ] && [ "$RUN_E2E" = false ]; then
  echo "Nothing to do — pass --fixtures=, --all-fixtures, and/or --e2e" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Falling back is up to the caller (e.g. run" >&2
  echo "node scripts/capture-screenshots.mjs directly instead)." >&2
  exit 1
fi

# --- 0. Best-effort cleanup of stale disposable branches (>48h) ---
# Branch names embed their creation epoch (ci-eval-run-<epoch>-<pid>), so age
# is parseable without extra API calls. The old shared `ci-eval` branch is
# deleted too if it lingers from a previous design.
git ls-remote origin "refs/heads/ci-eval-*" 2>/dev/null | while read -r _sha name; do
  b="${name#refs/heads/}"
  x="${b#ci-eval-run-}"
  ts="${x%%-*}"
  if [[ "$ts" =~ ^[0-9]+$ ]] && [ "$ts" -lt "$(( $(date +%s) - 172800 ))" ]; then
    echo "Cleaning stale disposable branch $b"
    git push origin --delete "$b" >/dev/null 2>&1 || true
  fi
done
git push origin --delete ci-eval >/dev/null 2>&1 || true

# --- 1. Get whatever's currently on disk (often uncommitted) onto GitHub ---
# `git stash create` snapshots the worktree + index (including untracked
# files) into a commit WITHOUT touching the working tree or index, so
# concurrent invocations never race on shared local git state — no
# add/commit/reset dance. A clean tree just publishes HEAD as-is.
if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes present — snapshotting worktree for CI (local tree untouched)..."
  SHA="$(git stash create --include-untracked)"
fi
if [ -z "${SHA:-}" ]; then
  SHA="$(git rev-parse HEAD)"
fi

echo "Publishing snapshot $SHA to disposable branch '$BRANCH'..."
if ! git push origin "$SHA:refs/heads/$BRANCH" --quiet; then
  echo "Failed to push snapshot to $BRANCH — aborting." >&2
  exit 1
fi

# --- 2. Dispatch the workflow against that disposable branch ---
CI_REF="$BRANCH"

echo "Dispatching $WORKFLOW on $CI_REF (tag=$TAG)..."
gh workflow run "$WORKFLOW" \
  --ref "$CI_REF" \
  -f "ref=$CI_REF" \
  -f "tag=$TAG" \
  -f "fixtures=$FIXTURES" \
  -f "all_fixtures=$ALL_FIXTURES" \
  -f "run_e2e=$RUN_E2E" \
  -f "concurrency=$CONCURRENCY"

echo "Waiting for the run to appear..."
RUN_ID=""
for i in $(seq 1 30); do
  RUN_ID=$(gh run list --workflow="$WORKFLOW" --json databaseId,displayTitle \
    --jq ".[] | select(.displayTitle | contains(\"$TAG\")) | .databaseId" 2>/dev/null | head -n1)
  [ -n "$RUN_ID" ] && break
  sleep 2
done

if [ -z "$RUN_ID" ]; then
  echo "Could not find the dispatched run (tag=$TAG) after 60s — check 'gh run list --workflow=$WORKFLOW' manually." >&2
  exit 1
fi

echo "Found run $RUN_ID — watching..."
gh run watch "$RUN_ID" --exit-status >/dev/null 2>&1

# Don't rely solely on --exit-status (not guaranteed across every gh
# version) — check the actual conclusion explicitly too.
CONCLUSION=$(gh run view "$RUN_ID" --json conclusion --jq '.conclusion' 2>/dev/null)
echo "Run $RUN_ID concluded: ${CONCLUSION:-unknown}"

# --- 3. Pull results back to the exact local paths the local scripts use ---
if [ -n "$FIXTURES" ] || [ "$ALL_FIXTURES" = true ]; then
  mkdir -p tests/screenshots
  gh run download "$RUN_ID" -n "screenshots" --dir tests/screenshots 2>/dev/null || \
    echo "No screenshots artifact found (capture job may not have run)." >&2
fi

if [ "$RUN_E2E" = true ]; then
  mkdir -p tests/e2e-results
  gh run download "$RUN_ID" -n "e2e-results" --dir tests/e2e-results 2>/dev/null || \
    echo "No e2e-results artifact found (e2e job may not have run)." >&2
fi

if [ "$CONCLUSION" = "success" ]; then
  exit 0
else
  exit 1
fi
