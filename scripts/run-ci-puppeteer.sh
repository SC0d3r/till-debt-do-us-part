#!/usr/bin/env bash
set -uo pipefail

# Runs screenshot capture, the e2e suite, AND/OR arbitrary custom puppeteer
# test scripts on GitHub Actions instead of locally — this repo is public, so
# standard GitHub-hosted runners are free and unlimited, and much faster than
# an old/slow local machine running Chrome + Puppeteer. See
# docs/dev-log/DEBUG_HARNESS.md Part E for the full design (including why/how
# uncommitted local changes reach the runner).
#
# Usage:
#   ./scripts/run-ci-puppeteer.sh --fixtures=name1,name2 [--ref=dev]
#   ./scripts/run-ci-puppeteer.sh --all-fixtures [--ref=dev]
#   ./scripts/run-ci-puppeteer.sh --e2e [--ref=dev]
#   ./scripts/run-ci-puppeteer.sh --tests=tests/qa-tile-kit-regression.mjs,tests/qa-composer-regression.mjs
#   ./scripts/run-ci-puppeteer.sh --fixtures=name1 --e2e   # both in one dispatch
#   ./scripts/run-ci-puppeteer.sh --all-fixtures --concurrency=3   # parallel capture pages
#
# Async (multitasking) mode — dispatch and DON'T wait:
#   ./scripts/run-ci-puppeteer.sh --fixtures=name1 --async
#     -> prints CI_RUN_TAG=<tag>; exit 0 immediately. Continue other work.
#   ./scripts/run-ci-puppeteer.sh --collect=<tag>          # later: fetch results
#     -> finds the run by tag, waits for it, downloads artifacts, exits by conclusion.
#
# Requires: gh CLI, already authenticated (`gh auth login`). Run from repo root.
# Leaves results in the exact same local paths the local scripts would:
#   tests/screenshots/*.png, tests/screenshots/index.json, tests/e2e-results/*
#
# NETWORK RESILIENCE: every gh/git network call in this script is wrapped so
# that a 403 / "not reachable" / timeout failure is retried through the proxy
# wrappers `ap`, `apsi`, `proxychains4` (whichever exist) before giving up.
# Agents calling this script never need to wrap it themselves.
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
TESTS=""
CONCURRENCY=3
BROWSER="preinstalled" # preinstalled (default) | setup-chrome | puppeteer-bundled
ASYNC=false
COLLECT_TAG=""

# --- Network helpers -------------------------------------------------------
# Direct calls to GitHub sometimes fail with 403/forbidden/unreachable on this
# box. `ap`/`apsi`/`proxychains4` are proxy wrappers that usually succeed where
# the direct call didn't. Every gh/git network call goes through these.

is_network_err() {
  case "$1" in
    *403*|*[Ff]orbidden*|*not\ reachable*|*unreachable*|*could\ not\ resolve*|*Connection\ refused*|*timed\ out*|*timeout*|*network*|*proxy*|*HTTP\ 4*|*HTTP\ 5*)
      return 0 ;;
    *) return 1 ;;
  esac
}

run_gh() {
  local out rc wrap
  out="$("gh" "$@" 2>&1)"; rc=$?
  [ $rc -eq 0 ] && { printf '%s\n' "$out"; return 0; }
  if ! is_network_err "$out"; then
    printf '%s\n' "$out" >&2
    return $rc
  fi
  for wrap in ap apsi proxychains4; do
    command -v "$wrap" >/dev/null 2>&1 || continue
    out="$("$wrap" gh "$@" 2>&1)"; rc=$?
    if [ $rc -eq 0 ]; then printf '%s\n' "$out"; return 0; fi
  done
  printf '%s\n' "$out" >&2
  return $rc
}

run_git_net() {
  local out rc wrap
  out="$("git" "$@" 2>&1)"; rc=$?
  [ $rc -eq 0 ] && { printf '%s\n' "$out"; return 0; }
  if ! is_network_err "$out"; then
    printf '%s\n' "$out" >&2
    return $rc
  fi
  for wrap in ap apsi proxychains4; do
    command -v "$wrap" >/dev/null 2>&1 || continue
    out="$("$wrap" git "$@" 2>&1)"; rc=$?
    if [ $rc -eq 0 ]; then printf '%s\n' "$out"; return 0; fi
  done
  printf '%s\n' "$out" >&2
  return $rc
}

for arg in "$@"; do
  case "$arg" in
    --ref=*) : ;; # accepted for compatibility; the dispatch ref is always this run's branch
    --fixtures=*) FIXTURES="${arg#*=}" ;;
    --all-fixtures) ALL_FIXTURES=true ;;
    --e2e) RUN_E2E=true ;;
    --tests=*) TESTS="${arg#*=}" ;;
    --concurrency=*) CONCURRENCY="${arg#*=}" ;;
    --browser=*) BROWSER="${arg#*=}" ;;
    --async) ASYNC=true ;;
    --collect=*) COLLECT_TAG="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

if [ -z "$COLLECT_TAG" ] && [ -z "$FIXTURES" ] && [ "$ALL_FIXTURES" = false ] && [ "$RUN_E2E" = false ] && [ -z "$TESTS" ]; then
  echo "Nothing to do — pass --fixtures=, --all-fixtures, --e2e, and/or --tests=" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Falling back is up to the caller (e.g. run" >&2
  echo "node scripts/capture-screenshots.mjs directly instead)." >&2
  exit 1
fi

# --- 0b. COLLECT mode: no dispatch — find a previously-dispatched async run
# by its tag, wait for it, and pull results back. Used after --async. ---
if [ -n "$COLLECT_TAG" ]; then
  TAG="$COLLECT_TAG"
  echo "Collecting results for tag=$TAG..."
  RUN_ID=""
  for i in $(seq 1 30); do
    RUN_ID=$(run_gh run list --workflow="$WORKFLOW" --json databaseId,displayTitle \
      --jq ".[] | select(.displayTitle | contains(\"$TAG\")) | .databaseId" 2>/dev/null | head -n1)
    [ -n "$RUN_ID" ] && break
    sleep 2
  done
  if [ -z "$RUN_ID" ]; then
    echo "No run found for tag=$TAG — check 'gh run list --workflow=$WORKFLOW' manually." >&2
    exit 1
  fi
  echo "Found run $RUN_ID — watching..."
  run_gh run watch "$RUN_ID" --exit-status >/dev/null 2>&1 || true
  CONCLUSION=$(run_gh run view "$RUN_ID" --json conclusion --jq '.conclusion' 2>/dev/null)
  echo "Run $RUN_ID concluded: ${CONCLUSION:-unknown}"
  # In collect mode we don't know which artifacts were requested, so try both
  # and ignore whichever doesn't exist.
  mkdir -p tests/screenshots
  TMP=$(mktemp -d)
  if run_gh run download "$RUN_ID" -n "screenshots" --dir "$TMP" 2>/dev/null; then
    cp -f "$TMP"/* tests/screenshots/ 2>/dev/null || true
  else
    echo "No screenshots artifact found (capture job may not have run)." >&2
  fi
  rm -rf "$TMP"
  mkdir -p tests/e2e-results
  TMP=$(mktemp -d)
  if run_gh run download "$RUN_ID" -n "e2e-results" --dir "$TMP" 2>/dev/null; then
    cp -f "$TMP"/* tests/e2e-results/ 2>/dev/null || true
  else
    echo "No e2e-results artifact found (e2e/custom-tests job may not have run)." >&2
  fi
  rm -rf "$TMP"
  if [ "$CONCLUSION" = "success" ]; then
    exit 0
  else
    exit 1
  fi
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
# Build a snapshot commit WITHOUT touching the working tree or index, so
# concurrent invocations never race on shared local git state. A private temp
# index (GIT_INDEX_FILE) lets us stage the full worktree — tracked changes AND
# untracked files (respecting .gitignore) — into a commit object that we then
# push to a disposable branch. A clean tree just publishes HEAD as-is.
#
# NOTE: do NOT use `git stash create` here — it never includes untracked
# files (the -u flag is silently ignored for `create`), so brand-new test
# files or source modules would be missing from the CI snapshot and every
# custom test / new feature would fail on the runner.
if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes present — snapshotting worktree for CI (local tree untouched)..."
  TMPIDX="$(mktemp)"
  GIT_INDEX_FILE="$TMPIDX" git read-tree HEAD
  GIT_INDEX_FILE="$TMPIDX" git add -A
  TREE="$(GIT_INDEX_FILE="$TMPIDX" git write-tree)"
  SHA="$(echo "ci snapshot $(date -u +%s)" | git commit-tree "$TREE" -p HEAD)"
  rm -f "$TMPIDX"
fi
if [ -z "${SHA:-}" ]; then
  SHA="$(git rev-parse HEAD)"
fi

echo "Publishing snapshot $SHA to disposable branch '$BRANCH'..."
if ! run_git_net push origin "$SHA:refs/heads/$BRANCH" --quiet; then
  echo "Failed to push snapshot to $BRANCH — aborting." >&2
  exit 1
fi

# --- 2. Dispatch the workflow against that disposable branch ---
CI_REF="$BRANCH"

echo "Dispatching $WORKFLOW on $CI_REF (tag=$TAG)..."
if ! run_gh workflow run "$WORKFLOW" \
  --ref "$CI_REF" \
  -f "ref=$CI_REF" \
  -f "tag=$TAG" \
  -f "fixtures=$FIXTURES" \
  -f "all_fixtures=$ALL_FIXTURES" \
  -f "run_e2e=$RUN_E2E" \
  -f "tests=$TESTS" \
  -f "concurrency=$CONCURRENCY" \
  -f "browser=$BROWSER"; then
  echo "Failed to dispatch workflow — aborting." >&2
  exit 1
fi

echo "Waiting for the run to appear..."
RUN_ID=""
for i in $(seq 1 30); do
  RUN_ID=$(run_gh run list --workflow="$WORKFLOW" --json databaseId,displayTitle \
    --jq ".[] | select(.displayTitle | contains(\"$TAG\")) | .databaseId" 2>/dev/null | head -n1)
  [ -n "$RUN_ID" ] && break
  sleep 2
done

if [ -z "$RUN_ID" ]; then
  echo "Could not find the dispatched run (tag=$TAG) after 60s — check 'gh run list --workflow=$WORKFLOW' manually." >&2
  exit 1
fi

# --- 2b. Async mode: hand the tag back and leave. The caller continues other
# work and later runs `--collect=<tag>` to fetch results. ---
if [ "$ASYNC" = true ]; then
  echo "CI_RUN_TAG=$TAG"
  echo "CI_RUN_ID=$RUN_ID"
  echo "Collect later with: ./scripts/run-ci-puppeteer.sh --collect=$TAG"
  exit 0
fi

echo "Found run $RUN_ID — watching..."
run_gh run watch "$RUN_ID" --exit-status >/dev/null 2>&1 || true

# Don't rely solely on --exit-status (not guaranteed across every gh
# version) — check the actual conclusion explicitly too.
CONCLUSION=$(run_gh run view "$RUN_ID" --json conclusion --jq '.conclusion' 2>/dev/null)
echo "Run $RUN_ID concluded: ${CONCLUSION:-unknown}"

# --- 3. Pull results back to the exact local paths the local scripts use ---
# `gh run download` refuses to overwrite existing files, so extract into a
# fresh temp dir and copy over — never leaves stale files from earlier runs.
if [ -n "$FIXTURES" ] || [ "$ALL_FIXTURES" = true ]; then
  mkdir -p tests/screenshots
  TMP=$(mktemp -d)
  if run_gh run download "$RUN_ID" -n "screenshots" --dir "$TMP" 2>/dev/null; then
    cp -f "$TMP"/* tests/screenshots/ 2>/dev/null || true
  else
    echo "No screenshots artifact found (capture job may not have run)." >&2
  fi
  rm -rf "$TMP"
fi

if [ "$RUN_E2E" = true ] || [ -n "$TESTS" ]; then
  mkdir -p tests/e2e-results
  TMP=$(mktemp -d)
  if run_gh run download "$RUN_ID" -n "e2e-results" --dir "$TMP" 2>/dev/null; then
    cp -f "$TMP"/* tests/e2e-results/ 2>/dev/null || true
  else
    echo "No e2e-results artifact found (e2e/custom-tests job may not have run)." >&2
  fi
  rm -rf "$TMP"
fi

if [ "$CONCLUSION" = "success" ]; then
  exit 0
else
  exit 1
fi