#!/usr/bin/env bash
set -euo pipefail
root="$1"
support="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$root/build"
# Both revisions retain their exact Main.kt. Versioned binding adapters allow
# historical macOS-oriented code to link against the Linux POSIX bindings.
"${KONANC:?Set KONANC to the pinned Linux compiler}" "$root/src/Main.kt" \
  "$support/linux-posix-compat.kt" -o "$root/build/bg"
cp "$root/build/bg.kexe" "$root/bg"
echo "Built $root/bg with the recorded Linux POSIX binding adapters"
