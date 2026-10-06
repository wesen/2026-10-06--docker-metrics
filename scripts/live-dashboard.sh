#!/usr/bin/env bash
# Run a dashboard program inside a running `docker-metrics serve` so its
# snapshots reach the WebSocket hub (a CLI `run` has no hub to publish to).
#
#   scripts/live-dashboard.sh [preset-or-dashboard.js] [run-id]
#
# Defaults to the Load lab preset; open http://127.0.0.1:8080/d/<dashboard id>.
set -euo pipefail
cd "$(dirname "$0")/.."
file="${1:-web/src/presets/files/120-dash-load-lab.js}"
run_id="${2:-tmux-board}"
base="${DM_URL:-http://127.0.0.1:8080}"

until curl -sf "$base/healthz" >/dev/null 2>&1; do sleep 1; done
python3 -c 'import json,sys; print(json.dumps({"source": open(sys.argv[1]).read(), "runId": sys.argv[2]}))' "$file" "$run_id" |
  curl -sf -XPOST "$base/api/v1/run" -H 'content-type: application/json' --data-binary @-
echo
echo "running $file as run $run_id"
echo "stop it with: curl -XPOST $base/api/v1/run/$run_id/stop"
