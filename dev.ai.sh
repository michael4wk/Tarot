#!/usr/bin/env bash
set -euo pipefail

# Tarot2 dev: launch Vite with AI proxy + hedge enabled, without exposing keys
# Usage:
#   ./dev.ai.sh                 # direct via VPN routing
#   PROXY=http://127.0.0.1:7890 ./dev.ai.sh  # process-level proxy fallback

# Hedge and proxy flags (front-end reads only flags; keys stay server-side)
export VITE_AI_DEV_PROXY=1
export VITE_AI_HEDGE_ENABLED=true
export VITE_AI_HEDGE_DELAY_MS="${VITE_AI_HEDGE_DELAY_MS:-0}"
export VITE_AI_ABORT_LOSER="${VITE_AI_ABORT_LOSER:-1}"
export VITE_AI_HEDGE_LOG_LEVEL="${VITE_AI_HEDGE_LOG_LEVEL:-warn}"

# Optional process-level proxy (does not change system proxy)
if [[ -n "${PROXY:-}" ]]; then
  export HTTPS_PROXY="$PROXY"
  echo "[dev.ai] Using process proxy via $HTTPS_PROXY"
fi

# Quick connectivity check to Gemini API discovery (non-auth)
check_url="${AI_CONNECTIVITY_CHECK_URL:-https://generativelanguage.googleapis.com/discovery/rest?version=v1beta}"
status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "${AI_CONNECTIVITY_TIMEOUT:-5}" "$check_url" || echo "000")
if [[ "$status" != "200" ]]; then
  echo "[dev.ai] Connectivity check failed (status=$status). If dev server errors, set PROXY=http://127.0.0.1:7890"
else
  echo "[dev.ai] Connectivity to upstream OK (status=$status)"
fi

# Delegate to existing dev runner
exec bash ./run.sh