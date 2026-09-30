#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
compiler="${KONANC:-}"
if [[ -z "$compiler" ]]; then
  if command -v konanc >/dev/null 2>&1; then
    compiler="$(command -v konanc)"
  elif [[ -x "$HOME/.konan/kotlin-native-prebuilt-macos-aarch64-2.4.20/bin/konanc" ]]; then
    compiler="$HOME/.konan/kotlin-native-prebuilt-macos-aarch64-2.4.20/bin/konanc"
  else
    echo 'Set KONANC to the path of a Kotlin/Native compiler.' >&2
    exit 1
  fi
fi
mkdir -p build
"$compiler" src/Main.kt -o build/bg
cp build/bg.kexe bg
echo 'Built ./bg'
