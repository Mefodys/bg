# bg — Repository Skills Scanner

A Kotlin/Native executable for macOS Apple Silicon, Linux x86_64, and Linux ARM64. The built binary runs
without Python or a JVM. The implementation uses POSIX APIs; Windows is not
currently supported.

Build with Kotlin/Native (`konanc` on PATH or `KONANC` set to its executable):

```bash
bash build.sh
```

The script also detects the matching installed Kotlin/Native 2.4.20 distribution under
`~/.konan`. Output is the native binary `bg` (also `build/bg.kexe`).

For ARM64 Linux sandboxes, cross-compile using the Linux x86_64 compiler:

```bash
BG_TARGET=linux_arm64 bash build.sh
```

Run this command in a Linux x86_64 builder, not directly on macOS or an ARM64
Linux host: Kotlin/Native 2.4.20 publishes no ARM64 Linux host compiler. The
result is an ARM64 ELF executable and runs natively inside an ARM64 `sbx`.
Keep each platform's binary in a separate output location when transferring
it; do not replace the macOS binary with a Linux executable.

```bash
./bg scan /path/to/repository
./bg scan /path/to/repository --json
./bg --help
./bg --version
```

To invoke `bg` from anywhere, add this project's directory to your `PATH`,
or copy the binary to a directory already on your PATH.

The scanner recursively discovers regular `SKILL.md` files and prints a readable
list grouped by top-level directory, with numbered names, paths, and wrapped
descriptions. Terminal output uses colored section headings, aligned skill names,
one-line description previews, and clickable `SKILL.md` links (in terminals
supporting OSC 8). Redirected output is plain text. Set `NO_COLOR=1` to disable
colors. Use `--json` for machine-readable output or JSON report files.
Each entry has a name,
repository-relative location, description, and manifest path. Metadata comes
from literal `name` and `description` front-matter fields, falling back to the
first H1 and its following paragraph; absent descriptions are `null`.
Descriptions are capped at 240 characters. See [the specification](spec/cli.md)
for exclusions and exit codes.

Run the automated tests after building. Python 3 is used only as the test
harness; tests invoke the compiled native binary as a separate process:

```bash
python3 -m unittest discover -s tests -v
python3 tests/run.py
```

## Classification and duplicates

Development skills are grouped by their top-level folder. Test fixtures are
listed separately when a path contains `test`, `tests`, `testData`, `test-data`,
`testdata`, `integration-tests`, or `testFixtures`, or a `src/<sourceSet>Test`
pair (including `src/test`). Names such as `contest` and `test-helper` do not
trigger classification. MPS bundles under
`plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills` are product skills.
Test classification takes precedence; a generic `resources` folder is not
enough to classify a skill as a product resource.

Matching `.agents/skills/<path>` and `.claude/skills/<path>` manifests merge only
when their names and complete contents match after line-ending normalization.
The `.agents` path is canonical and all locations are retained in JSON `sources`
and the terminal's `Also:` lines. Different bodies with the same name and role
remain separate with `conflict: true`. Product and development roles never
merge. JSON entries add `category`, `conflict`, and `sources`; the canonical
`location` and `manifest_path` fields remain available. Reserved section IDs
`@test-fixtures` and `@product` display as `Test fixtures` and `Product skills`.

## Local web interface

Requires Node.js 24 (or newer). No npm dependencies are needed. Build the
scanner first, then run:

```bash
bash web/run.sh
```

Open http://127.0.0.1:4173 in your browser. The server runs on loopback by default.
Use a local repository path or a detected checkout preset, search/filter the
inventory, open a skill to read its manifests, and export JSON. Nothing is
uploaded and repository code is never executed. Stop the server with Ctrl+C.
Use `PORT=4174 bash web/run.sh` for another port, or set `NODE` to a Node.js
executable if it is not on PATH. The launcher detects local Node.js 24 installs
in the Gradle cache as a convenience. See [the web specification](spec/web.md).
Container previews explicitly use `HOST=0.0.0.0` with `PUBLIC_PORT` set to the
host-mapped port. Publish that port only on host loopback; Host/Origin checks
remain enabled.

HTTP tests run with `python3 tests/run.py`. For browser verification only,
install the development dependency and Chromium:

```bash
npm ci --ignore-scripts
npx playwright install chromium --only-shell
npm run test:web
```

Browser checks cover scanning, search, filters, source details, and mobile
layout. Playwright is not required to start the server.

## GitHub Actions

`.github/workflows/ci.yml` runs on pull requests, pushes/merges to `main`, and
manual dispatch. The `build-and-test` matrix uses macOS 15 ARM64 and Ubuntu 24.04 x86_64,
Kotlin/Native 2.4.20, JDK 21, Node.js 24, and Python 3.12. It builds from source, checks the
native binary, runs the complete suite with `python3 tests/run.py`, and fails
on failures, errors, skipped tests, or zero tests. Core corner-case tests use
small checked-in fixtures; CI does not clone the external reference projects.

Download `bg-macos-arm64` or `bg-linux-x64` from the successful run's Artifacts section,
unzip the artifact, and extract its `.tar.gz` with `tar -xzf`. The tar archive
preserves execute permissions. Artifacts expire after 14 days. The repository
owner can make both `build-and-test` matrix checks required branch-protection checks.

Optional verification of read-only real checkouts:

```bash
python3 tests/verify_repositories.py repositories/MPS repositories/koog repositories/android /path/to/kotlin
```

This compares every eligible tracked `SKILL.md` with the scanner's source list
and reports the exact repository revisions and discovery counts.

## Parallel coding-agent containers

See [sandbox setup and lifecycle](sandbox/README.md) and the
[two-task plan](spec/two-agent-sandboxes-plan.md). Each agent receives its own
checkout, branch, cache, result volume, and loopback preview. Agents export
commits; a trusted host publisher creates separate draft PRs. Neither launch
nor publication automatically merges a PR.
