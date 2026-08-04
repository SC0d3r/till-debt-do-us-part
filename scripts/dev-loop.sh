#!/usr/bin/env bash
set -uo pipefail

# Continuous autonomous dev loop for the game-director agent.
#
# Why this exists: a single `opencode run` call is one conversation with a
# finite context window — it cannot literally run "forever" on its own. So
# game-director is designed to do exactly ONE development cycle per invocation
# and persist everything that matters to docs/dev-log/*.md. This script is what
# actually makes development continuous: it just keeps calling that one cycle,
# forever (or for N cycles), with logging.
#
# Usage:
#   ./scripts/dev-loop.sh          # run forever
#   ./scripts/dev-loop.sh 20       # stop after 20 cycles
#
# Requires: opencode CLI installed and authenticated, run from the repo root,
# on (or able to create) the `dev` branch.

AGENT="game-director"
LOG_DIR="logs/dev-loop"
BASE_COOLDOWN_SECONDS=30
MAX_COOLDOWN_SECONDS=300   # cap backoff at 5 minutes so it doesn't sleep forever
MAX_CYCLES="${1:-0}"       # 0 = run forever

mkdir -p "$LOG_DIR"

i=0
consecutive_failures=0
while true; do
  i=$((i + 1))
  ts="$(date +%Y%m%d-%H%M%S)"
  echo "=== Cycle $i @ $ts ==="

  # --auto: auto-approve any permission not explicitly set to "deny" in the
  # agent/config frontmatter, since there's no human here to answer "ask"
  # prompts. Real safety boundaries (force-push, etc.) are "deny" rules in
  # .opencode/agent/*.md and opencode.json, which --auto does NOT override.
  opencode run \
    --agent "$AGENT" \
    --auto \
    --title "dev-loop-$ts" \
    "Continue development. Read docs/dev-log/CYCLE_STATE.json first (this may be a resume after a crash/outage, not a fresh cycle), then the other docs/dev-log/*.md files, and run exactly one development cycle." \
    2>&1 | tee "$LOG_DIR/cycle-$ts.log"

  status="${PIPESTATUS[0]}"
  if [ "$status" -ne 0 ]; then
    echo "!! Cycle $i exited with status $status — see $LOG_DIR/cycle-$ts.log" >&2
    consecutive_failures=$((consecutive_failures + 1))
  else
    consecutive_failures=0
  fi

  if [ "$MAX_CYCLES" -ne 0 ] && [ "$i" -ge "$MAX_CYCLES" ]; then
    echo "Reached max cycles ($MAX_CYCLES). Stopping."
    break
  fi

  # Exponential backoff on consecutive whole-process failures (e.g. the
  # machine's internet is actually down) so this doesn't hammer a dead
  # connection every 30s. Resets to the base cooldown the moment a cycle
  # succeeds. CYCLE_STATE.json (see game-director's Resilience section) is
  # what lets the next successful invocation resume cleanly instead of
  # losing whatever was mid-flight when a failure happened.
  if [ "$consecutive_failures" -gt 0 ]; then
    backoff=$((BASE_COOLDOWN_SECONDS * (2 ** (consecutive_failures - 1))))
    if [ "$backoff" -gt "$MAX_COOLDOWN_SECONDS" ]; then
      backoff="$MAX_COOLDOWN_SECONDS"
    fi
    echo "Backing off ${backoff}s after $consecutive_failures consecutive failure(s)."
    sleep "$backoff"
  else
    sleep "$BASE_COOLDOWN_SECONDS"
  fi
done
