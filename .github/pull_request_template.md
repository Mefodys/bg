## Change

<!-- Describe the problem and the resulting behavior. Include a short before/after example when helpful. -->


## Verification

<!-- Report checks for the exact PR head. For documentation-only changes, mark application checks as not applicable. Do not reuse results from an older revision. -->

- Verified commit: `...`
- Fresh native build: ...
- Strict tests: ... run; ... failures; ... errors; ... skips.
- CLI help/version and `git diff --check`: ...
- JavaScript syntax and browser checks, if applicable: ...
- CI run and result (`build-and-test` and `visual-regression`): ...
- CI visual artifact (old / new / highlighted changes): ...
- Exact previous main SHA → current PR SHA: ...
- Classification: UNCHANGED / EXPECTED FEATURE CHANGE / REGRESSION / INCOMPLETE.
- Reviewed expected-change regions and afterPixelSHA256, if applicable: ...
- Desktop/mobile screenshots, if applicable: ...
- Post-merge screenshot folder: `screenshots/<feature-name>/<serving-SHA>/`
- Versioned scenario suite, fixture/script hashes and pinned capture environment: ...
- Baseline SHA → current serving SHA; comparison report and before/after/diff: ...
- Intended differences / suspected regressions / incomparable scenarios: ...
- Screenshot README and manifest.json with scenario IDs, expected/observed values, date, merge/serving SHA and environment: ...
- Visible screenshot previews near the top of this PR after application restart: ...

## Limitations

<!-- Describe any remaining issues or checks that could not run, including the concrete reason. Write "None" if there are none. -->


## After publication

- [ ] Complete a short review and verify exact-head CI.
- [ ] Record the review outcome; merge only within the user's authorization.

## After merge

<!-- Complete after an authorized merge; these items do not authorize merging. Documentation-only changes do not require an application rebuild or server restart. -->

- [ ] Verify CI for the actual merge commit.
- [ ] Update the local serving checkout to that commit.
- [ ] Rebuild the scanner and restart the identified application server on its existing host/port, if applicable.
- [ ] Verify HTTP availability and the merged behavior; report the serving SHA and URL.
- [ ] Replay the fixed suite (at least 18 meaningful desktop/mobile states) and prior accepted feature scenarios; save lossless captures without overwriting earlier runs.
- [ ] Verify deterministic capture on the same revision and compare against a compatible reviewed baseline; save before/after/diff and comparison.md.
- [ ] Add README.md and manifest.json with scenario IDs, behavioral assertions, hashes, masks, environment, baseline/current SHA, PR URL and date.
- [ ] Explain expected changes and investigate suspected regressions; do not silently replace the baseline.
- [ ] Add visible captioned previews near the top of this PR through an authorized attachment/artifact channel, or report local paths and publication pending.

<!-- Screenshot capture is triggered after a feature merge and successful local restart. Video is only required on an explicit request. -->
