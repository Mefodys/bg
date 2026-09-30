#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$#" != 1 ]]; then echo 'Usage: bash sandbox/launch-agent.sh atlas-filter|atlas-similar' >&2; exit 2; fi
exec python3 sandbox/manage.py launch "$1"
