#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
compiler="${KONANC:-}"
system="$(uname -s)"
case "$system" in
  Darwin) platform_source=src/platform/Macos.kt; compiler_platform=macos-aarch64 ;;
  Linux) platform_source=src/platform/Linux.kt; compiler_platform=linux-x86_64 ;;
  *) echo "Unsupported build host: $system" >&2; exit 1 ;;
esac
if [[ -z "$compiler" ]]; then
  if command -v konanc >/dev/null 2>&1; then
    compiler="$(command -v konanc)"
  elif [[ -x "$HOME/.konan/kotlin-native-prebuilt-$compiler_platform-2.4.20/bin/konanc" ]]; then
    compiler="$HOME/.konan/kotlin-native-prebuilt-$compiler_platform-2.4.20/bin/konanc"
  else
    echo 'Set KONANC to the path of a Kotlin/Native compiler.' >&2
    exit 1
  fi
fi
mkdir -p build
"$compiler" src/Main.kt "$platform_source" -o build/bg
cp build/bg.kexe bg
echo 'Built ./bg'
