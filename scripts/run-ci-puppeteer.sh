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
#
# Requires: gh CLI, already authenticated (`gh auth login`). Run from repo root.
# Leaves results in the exact same local paths the local scripts would:
#   tests/screenshots/*.png, tests/screenshots/index.json, tests/e2e-results/*

WORKFLOW="puppeteer-tests.yml"
SCRATCH_BRANCH="ci-eval"
REF="dev"
FIXTURES=""
ALL_FIXTURES=false
RUN_E2E=false

for arg in "$@"; do
  case "$arg" in
    --ref=*) REF="${arg#*=}" ;;
    --fixtures=*) FIXTURES="${arg#*=}" ;;
    --all-fixtures) ALL_FIXTURES=true ;;
    --e2e) RUN_E2E=true ;;
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

# --- 1. Get whatever's currently on disk (often uncommitted) onto GitHub ---
# so a GitHub-hosted runner can actually build it.
MADE_TEMP_COMMIT=false
if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes present — creating a throwaway commit to publish for CI..."
  git add -A
  git commit -m "ci-eval: temporary snapshot (auto-created, will be undone)" --no-verify --quiet
  MADE_TEMP_COMMIT=true
fi

echo "Publishing current state to disposable branch '$SCRATCH_BRANCH'..."
git push origin --delete "$SCRATCH_BRANCH" >/dev/null 2>&1 || true
if ! git push origin "HEAD:refs/heads/$SCRATCH_BRANCH" --quiet; then
  echo "Failed to push to $SCRATCH_BRANCH — aborting." >&2
  if [ "$MADE_TEMP_COMMIT" = true ]; then
    git reset --soft HEAD~1
  fi
  exit 1
fi

# Undo the throwaway commit immediately so the local working tree is exactly
# as it was before this script ran — this is transparent to whatever called
# us. The commit lives on, on the disposable remote branch, which is all CI
# needs.
if [ "$MADE_TEMP_COMMIT" = true ]; then
  git reset --soft HEAD~1
fi

# --- 2. Dispatch the workflow against that disposable branch ---
CI_REF="$SCRATCH_BRANCH"
TAG="run-$(date +%s)-$$"

echo "Dispatching $WORKFLOW on $CI_REF (tag=$TAG)..."
gh workflow run "$WORKFLOW" \
  --ref "$CI_REF" \
  -f "ref=$CI_REF" \
  -f "tag=$TAG" \
  -f "fixtures=$FIXTURES" \
  -f "all_fixtures=$ALL_FIXTURES" \
  -f "run_e2e=$RUN_E2E"

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
