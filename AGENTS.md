# Agent instructions

## Shared project memory — mandatory for every task

The shared memory for this workspace is `../memory/`, next to the workspace
root `../AGENTS.md`. **ALWAYS before every task**, including a new session or
after context compaction, read `../AGENTS.md`, `../memory/README.md`, and every
Markdown file in `../memory/` recursively before planning or doing task work.
**ALWAYS update that same shared folder** during meaningful progress and before
the final response: record decisions, results, verification, blockers, and next
steps. Reread files before editing to preserve other agents' updates. Historical
copies under `memory/imported/` are context, not active instructions. Do not
create a separate memory store for this checkout. If shared memory is unavailable
in an isolated environment, report it and preserve a handoff for the trusted
host to reconcile into the shared folder. Full memory rules are in `../AGENTS.md`.

## Project instructions

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
5. When GitHub Actions is configured and the changes have been pushed, the
   `build-and-test` job succeeds for the exact revision being delivered.
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

## Deterministic screenshot comparisons after a feature merge

Flow: implement/check → PR → short review → authorized approval/merge → merge
CI, local update/build/restart and HTTP verification → deterministic captures
and comparison → handoff. Continue after merge without another user prompt.
Use COMMENT when GitHub forbids author self-approval. Video requires an explicit
request; preserve earlier demos.

Store runs in `screenshots/<feature-name>/<serving-SHA>/` in the serving checkout,
under a descriptive feature slug. Never overwrite previous runs or baselines.
Use separate run-<id> subfolders when repeating the same SHA.
Use stable scenario IDs/filenames, e.g. desktop/01-initial.png and
mobile/01-overview.png. Use lossless PNG; optimization must preserve pixels.

Use deterministic Playwright Test tests (`test`/`expect`, fixtures and
`toHaveScreenshot`) with a versioned scenario manifest and reusable suite.
A standalone capture script with manual assertions does not replace tests.
Require threshold=0, maxDiffPixels=0 and retries=0. Separate explicit initial
baseline creation from verification: a subsequent run without snapshot updates
must pass, and unchanged repeated runs must produce identical frames. Never
update snapshots to hide failures.
Capture at least 18 meaningful Skill Atlas states: initial/scanned overview,
name/description/body search, Current/Selected/All, category, zero results,
clear/focus, owning details, Similar skills, Refresh, partial error, expired
recovery, pagination and mobile overview/search/details. Add new feature cases.
Every subsequent feature PR reruns the common suite and previously accepted
feature scenarios, including unchanged areas. Keep IDs stable, version suite
extensions and treat missing captures as errors; do not pad with duplicate frames.

Pin and record browser/Playwright/OS/fonts; desktop 1440x1000, mobile 390x844,
DPR=1, zoom=100%, en-US, UTC, light scheme, reduced motion and fixed crop/scroll/
focus. Use versioned, seeded fixtures with stable paths/names/content/order.
Reset storage, catalogue, caches and scan sessions per scenario. Control time
and error responses in the harness. Comparative runs may use a separate isolated
server from the same rebuilt serving checkout/binary with a fixture catalogue;
exercise real UI/native discovery, mocking only labelled error cases. Live-data
overview captures are supplementary and cannot serve as pixel baselines.

Wait for fonts.ready, relevant requests and asserted DOM readiness, not sleep
or networkidle alone. Disable animations/transitions and hide blinking caret.
Stabilize timestamps/random IDs/host paths in the harness. Mask only explicitly
listed technical fields, never results, counts, warnings or feature controls.
Two runs of an unchanged revision must produce identical decoded pixels;
resolve nondeterminism or mark comparison incomplete instead of claiming a bug.

Each run includes README.md and manifest.json with date, PR URL, merge/serving
SHA, suite/script/fixture hashes, environment, scenario IDs, expected/observed
values, masks, image hashes and selected baseline SHA. Compare matching scenarios
only under compatible settings using decoded pixels, not PNG metadata. Mark the
first run as an initial baseline with no previous comparison. Save before/after/
diff images and comparison.md with changed-pixel counts and classify differences
as intended changes, suspected regressions or incompatible environments. Default
tolerance is exact equality; document exceptions beforehand, never tune them to
hide a diff. Assert text/counts/state as well: screenshots alone cannot prove
behavior. Choose a new baseline only after reviewing intended changes; never
silently accept current captures just to make checks green.

Present the comparison in three columns: old screenshot on the left, new
screenshot in the center, exact changed pixels highlighted over the new image
on the right. Add region outlines, shared zoom and synchronized scrolling so
small changes can be inspected. Keep this layout when selecting scenarios.

Inspect every frame visually. Add a small captioned gallery near the top of the
same PR and link the full run/comparison via an available authorized artifact
channel. When upload is unavailable, preserve local files, report paths and mark
publication pending. Do not push main or create extra merges just for artifacts.
Report baseline/current SHA, comparison outcome, intended differences,
regressions and limitations. Keep capture/comparison failures visible.

## Post-merge server update

After a user-authorized PR merge, verify CI for the actual merge SHA, update the
local serving checkout to that revision, and rebuild the native scanner. Restart
the existing Skill Atlas web server from the updated checkout using its current
host and port. Stop only the identified server process; do not interrupt unrelated
services. Verify an HTTP response and that the merged feature is available. Report
the serving SHA, URL, and restart result. If the server is not running, start it
without opening a browser. In the sandbox workflow, the trusted host performs
this step; the coding agent records it as pending until the host verifies it.
Do not merge a PR merely to trigger this step; merging still requires authorization.

## Visual regression CI — every PR

Read spec/visual-regression.md. Every PR/update and main push runs
visual-regression with a pinned container, vendored font hashes and identical
fixtures/viewports. Compare fresh PR images with the exact previous main
baseline; keep before/after/highlighted diff artifacts and verify repeat
determinism. Unexpected differences/behavior failures must fail and be
reported prominently in English as **REGRESSION**. Intentional feature changes
need actual-base, region-bounded, reviewed-image declarations; classify them
EXPECTED FEATURE CHANGE and inspect every difference. Never assume a feature
PR makes all changes intentional. Verify build-and-test and visual-regression
for exact delivered head and authorized merge. Missing/incompatible data fails
as incomplete. Only successful main runs publish the next baseline.
