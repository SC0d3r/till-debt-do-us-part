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
COOLDOWN_SECONDS=30
MAX_CYCLES="${1:-0}"   # 0 = run forever

mkdir -p "$LOG_DIR"

i=0
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
    "Continue development. Read docs/dev-log/*.md, pick up exactly where you left off, and run exactly one development cycle." \
    2>&1 | tee "$LOG_DIR/cycle-$ts.log"

  status="${PIPESTATUS[0]}"
  if [ "$status" -ne 0 ]; then
    echo "!! Cycle $i exited with status $status — see $LOG_DIR/cycle-$ts.log" >&2
  fi

  if [ "$MAX_CYCLES" -ne 0 ] && [ "$i" -ge "$MAX_CYCLES" ]; then
    echo "Reached max cycles ($MAX_CYCLES). Stopping."
    break
  fi

  sleep "$COOLDOWN_SECONDS"
done
