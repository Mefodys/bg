# Skill tags — serving merge4bcac39

PR: https://github.com/Mefodys/bg/pull/9 . Serving/mergeSHA:4bcac3937e6af91874b8939c5f94997384d8d79f. Local URL http://127.0.0.1:4173, PID32301, restarted2026-10-01 after fresh build and checks. Native58tests0failures/0errors/0skips; all4browser suites pass. Realserver43tags/89reviewed logical records/130sources/zero unknown; querytest49results→8Testing. Live capture is supplementary, not a pixel baseline.

## Reproducible local post-merge runs

`run-postmerge-common-001` explicitly generates a separate initial self-reference; `run-postmerge-common-002` verifies it without updates, retries or tolerance. 23/23 pass each; decodedpixels/DOM23/23exact in `postmerge-common-determinism`.
`run-postmerge-tags-001/002` similarly capture and verify12tagstates, decodedpixels/DOM12/12exact in `postmerge-tags-determinism`.
Real native discovery/UI execute against versioned fixtures on isolated servers from the rebuilt serving checkout. Only designated error scenarios are mocked. All metadata/hashes/assertions/environment and masks are in individual manifests. Local macOS captures do not compare to Linux pixels.

## Exact Linux main evidence

`run-ci-36842410859` retains all base/head images, before/after/diff, interactive gallery and exact repeat reports for actual mergeSHA. Previous accepted main baselineb911ff2b7392d8b69c9642048f5bcef9821a6265 reproduces23/23exact. Current23common+12tag repeats are exact. Cross-main18states differ onlyscrollY in observations; otherfields unchanged. Mainafterpixelhashes23/23equal finalreviewedPRhead3d74d69.

Original main visualCI failedREGRESSION because differences were undeclared; no mainbaseline was published. User explicitly authorised merge after published comparisons; decisioncomment5928790109. Historical reviewed declarations reanalysis is saved separately; it does not change failedCI. FollowupPR17 records exact reviewed base/image/region and scroll state, without runtime/harness/tolerance changes. Successful actualmain CI still needed for next acceptedmainbaseline. Prior evidence never overwritten.
