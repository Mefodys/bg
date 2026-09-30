#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
runtime="${NODE:-}"
if [[ -z "$runtime" ]]; then
  if command -v node >/dev/null 2>&1; then
    runtime="$(command -v node)"
  else
    for candidate in "$HOME"/.gradle/nodejs/node-v24*-darwin-arm64/bin/node; do
      if [[ -x "$candidate" ]]; then runtime="$candidate"; break; fi
    done
  fi
fi
if [[ -z "$runtime" ]]; then echo 'Install Node.js 24 or set NODE to its executable.' >&2; exit 1; fi
exec "$runtime" web/server.mjs
