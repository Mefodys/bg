# Agent instructions

This project is a Kotlin/Native CLI called `bg`. Read `spec/cli.md` for behavior
and `spec/ci.md` for the GitHub Actions implementation task. The native binary
is generated and ignored by Git. Python is used only for the test harness.
Read `spec/web.md` for the local Node.js web interface. The web server wraps
the native scanner; it must not duplicate discovery logic. Include HTTP tests
in the strict suite and run Node syntax checks when changing web code.
Run `npm run test:web` after UI changes; CI installs the development-only
Playwright dependency and headless Chromium for the same browser checks.
Read `spec/scan-corner-cases.md` for required coverage of MPS duplicates, Koog
test fixtures, Android's unconventional layout, and MPS product resources.

## Definition of done: all tests passed

An implementation task is complete only when:

1. The current source successfully builds using `bash build.sh`.
2. The full suite runs against that newly built binary using
   `python3 tests/run.py` (the strict runner rejects skips and zero tests).
3. At least one test is discovered and every discovered test passes. Failures,
   errors, skipped tests, or tests that were not run do not count as success.
4. `./bg --help`, `./bg --version`, and `git diff --check` succeed.
5. When GitHub Actions is configured and the changes have been pushed,
   every `build-and-test` matrix job (macOS ARM64 and Linux x86_64) succeeds for
   the exact revision being delivered.
   After a merge, verify the `main` push run for the actual merge commit as well.

Rebuild and rerun the relevant complete checks after the final code change.
Do not reuse results from an older binary or commit. Do not disable, remove,
or weaken tests to obtain a passing result.

In the final handoff, report the build result, number of tests run, failures,
errors, skips, and CI status. Distinguish local verification from hosted CI.
If a required check cannot run, report the concrete blocker and mark verification
as incomplete; do not claim that all tests passed.

The agent must connect to GitHub to verify CI and inspect failing job logs.
Follow the verification/repair loop in `spec/ci.md`: diagnose failures, fix the
root cause, run local tests, and verify CI for the corrected commit. All four
corner cases must be covered by deterministic CI tests. Include the workflow
run URL and verified SHA in the handoff. CI verification and test repair belong
to the coding agent, not to the bg CLI. Commit and push only within the user's
authorization; request missing access when it is required to finish.

Preserve the read-only scan behavior. Changes to output formats or arguments
must include corresponding updates to tests and the CLI specification.

For container-agent tasks, read `sandbox/README.md`, the assigned task prompt,
and `spec/parallel-forms-ui.md`. Work only on the assigned branch. Export a
clean committed result for the trusted host publisher; do not push, merge,
access host credentials, or modify sandbox/workflow security controls.
