# Visual regression on every PR

The `visual-regression` workflow runs every PR creation/update/reopen, main push,
and manual dispatch. It complements the existing macOS native `build-and-test`.
Both checks can be made required in branch protection; settings are unchanged.

## Fixed rendering and data

CI uses the official Playwright1.63.0 Ubuntu Noble amd64 image pinned by SHA256,
Node24.9.0, locked Playwright, and bundled Noto Sans/Mono/CJK fonts verified by
SHA256. Fonts load locally through the test harness; no network font requests.
Fixtures/scenarios fix paths/content/order/time/storage/sessions. Desktop1440×1000,
mobile390×844, DPR1, en-US/UTC/light/reduced motion, no animation/caret.
Fonts are capture-only overrides shared by both revisions; production unchanged.
Actual UI and native scan/search/details/similarity execute. Screenshot stability
and full repaint prevent incremental edge-raster differences.

CI builds exact PR base and head checkouts, retrieves accepted screenshots from
a successful main run for the exact base SHA, and runs each revision twice with
23 Playwright Test tests. First run creates an isolated ephemeral self-reference;
second verifies it without snapshot updates/retries, using threshold0/maxDiffPixels0.
The separate previous/current comparison always remains required, so generating
a per-revision self-reference cannot hide a regression. Retained base images are
also compared with fresh base images. If no artifact remains (90-day retention or
initial bootstrap), the previous exact revision is reconstructed in the pinned
container; baseline-source.txt explicitly records this fallback. Never use an
unrelated older commit. Missing/incompatible/nondeterministic captures fail.

The Linux build compiles each revision's unchanged `src/Main.kt` with the same
versioned `linux-posix-compat.kt` binding adapters. These map historical macOS
`__error()` and integer `ioctl` signatures to their Linux POSIX equivalents;
they contain no discovery/search logic. Current source uses portable `set_posix_errno`
and request conversion directly. Linux also runs the strict native/HTTP suite
as the image's unprivileged `pwuser`, so permission tests execute without skips.
Setup/build failures report INCOMPLETE VISUAL VERIFICATION rather than claiming
a screenshot comparison occurred or accepting a baseline.

Existing fixtures/scenarios/viewports/font versions cannot change in an ordinary
PR; CI blocks such changes pending an explicit visual-contract migration. This
prevents removing tests or changing data to hide differences.

## Classification and review

Undeclared differences fail with **REGRESSION** in a large job summary heading
and an error annotation. Failed behavior assertions always block, regardless of
visual expectations. Capture incompatibility is INCOMPLETE, not a claimed bug.

After inspecting the failed artifact, describe intentional changes in
`tests/visual/expected-changes.json`:

```json
{
  "baseSHA": "exact PR base SHA",
  "changes": [{
    "scenario": "desktop/03-name",
    "reason": "The search field uses the requested feature color",
    "afterPixelSHA256": "reviewed decoded-pixel SHA256 from comparison.json",
    "regions": [{"x":336,"y":635,"width":452,"height":62}]
  }]
}
```

All changed pixels must lie in the declared regions; exact reviewed after-image
hash and actual base SHA must match. Unexpected pixels outside the feature area,
a different image or undeclared observed-state change remain REGRESSION. For an
intentional DOM-state change, include full `observedAfter` from the scenario record.
Expected differences are **EXPECTED FEATURE CHANGE — REVIEW REQUIRED**. A feature
label never automatically permits differences; pixel declarations do not infer
semantics. Defects inside a declared region still need reviewer analysis.

## Artifacts and baseline

Every run uploads `visual-comparison-<headSHA>` with before/after/diff PNGs,
comparison.json/.md, three-column gallery.html with synchronized zoom/scroll,
Playwright results/traces and repeat-determinism reports. All labels are English.
Download/unzip and open comparison/gallery.html; inline PR uploads are not claimed.
Only a successful main push publishes `visual-baseline-<mergeSHA>` for the next PR.
A green PR result does not replace checking the actual merge SHA.

Local verification (macOS rendering is not comparable to Linux CI rendering):

```sh
npm ci --ignore-scripts
bash build.sh
python3 tests/visual/test_analysis.py
python3 tests/visual/ci.py /previous-checkout . /new/artifact-directory
```

Playwright Test is JavaScript. Python is only the pixel-analysis/report harness
and the existing native test runner. Use the pinned CI container for identical
CI rendering; never raise tolerance to compare incompatible platforms.

## Additive tag feature scenarios

`playwright.tags.config.mjs` runs twelve additional deterministic Playwright Test
states against native fixture scans and a fixed reviewed fixture catalogue. It
covers query90 → Testing12 → Testing+Agent evaluations3, unclassified suspension,
changed hashes, owning details and mobile facets/details. The common 23 scenario
IDs, fixtures and previous/current exact comparison remain unchanged. CI captures
the feature suite twice: explicit self-reference generation then verification
without snapshot updates, with zero tolerance/retries. Its images/results are
inside `tags-head-1`, `tags-head-2`, `tags-head-snapshots` in the same comparison artifact.
This additive suite proves feature behavior and repeat determinism; it does not
replace or waive the existing baseline-to-head visual comparison.

The inherited comparison runs before the additive suite, so a tag failure cannot
hide its old/new/diff evidence. Versioned tag scenario/fixture/font contracts,
README and manifests record environment, revisions, image and code hashes,
assertions and observations. CI requires the exact scenario/PNG/JSON set and
compares decoded pixels plus DOM on the repeat. When the base has tag support,
it also replays that exact revision and compares with the retained main tag
baseline (`head-2/tags`), or explicitly reconstructed base captures. Missing
accepted scenarios fail as incomplete. Initial self-reference is never a main
acceptance; only an actual successful main run publishes the next baseline.
Tag expectations require the same exact-base/pixel/region review in
`tests/visual/tag-expected-changes.json`; they cannot waive behaviour failures.

## Additive feature scenarios

`tests/visual/features.py` renders every established feature spec twice at the
exact base revision, then verifies the head revision against those base locator
snapshots twice with zero tolerance and no retries. A newly added spec is an
explicit initial candidate: it creates a self-reference once and immediately
verifies an ordinary second run. After that spec reaches main, its stable path
is part of the reconstructed exact-base comparison for every later PR. Removing
an established feature spec is incompatible and fails. This gate supplements
the common and tag comparisons and preserves traces, videos and snapshots in
the visual comparison artifact.
