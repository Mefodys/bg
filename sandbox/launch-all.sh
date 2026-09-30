#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."
# Each compose up returns independently; no shared mutable checkout.
bash sandbox/launch-agent.sh atlas-filter &
filter_pid=$!
bash sandbox/launch-agent.sh atlas-similar &
similar_pid=$!
filter_result=0
similar_result=0
wait "$filter_pid" || filter_result=$?
wait "$similar_pid" || similar_result=$?
echo "Launch results: filter=$filter_result similar=$similar_result"
[[ "$filter_result" == 0 && "$similar_result" == 0 ]]
