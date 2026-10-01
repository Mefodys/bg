# Code review

Review the pull request in the current repository. Work as a read-only reviewer:
do not edit files, commit, push, merge, approve, rerun workflows, or change the
visual baseline. The automation will publish your final response.

## Establish the review target

1. Read `AGENTS.md` and all instructions that apply to the changed files. Read
   the relevant specifications under `spec/` before judging behavior.
2. Resolve the pull request's exact base and head SHAs from the available pull
   request metadata or GitHub. Fetch missing refs when possible. State both SHAs
   in the final response. Do not review an arbitrary working-tree comparison.
3. Inspect the complete `base...head` diff, including added, deleted, renamed,
   generated, workflow, test, fixture, and documentation files. Then read enough
   surrounding and calling code to validate every suspected issue.
4. Check existing pull request discussion and current CI results so you do not
   repeat resolved findings or use results from an older revision.

If the base/head cannot be identified or the diff cannot be read, report the
review as incomplete with the concrete reason. Do not guess.

## What to look for

Prioritize defects introduced by the pull request that are specific, reproducible,
and useful to the author:

- incorrect behavior, crashes, data loss, security or permission problems;
- violations of the CLI contract, read-only scanning, output formats, exit codes,
  argument handling, ordering, path handling, or cross-platform behavior;
- regressions in discovery and filtering, especially MPS duplicates, Koog test
  fixtures, Android's unconventional layout, and MPS product resources;
- web behavior that diverges from `spec/web.md`, duplicates native discovery
  logic, mishandles partial failures or expired sessions, or breaks HTTP/UI flows;
- races, resource leaks, unbounded work, unsafe filesystem operations, brittle
  assumptions about the runner, host, repository layout, locale, or time;
- missing or ineffective tests for changed behavior, including tests that can
  pass without exercising the implementation;
- workflow changes that weaken required checks, permit skipped or zero tests,
  test a stale binary, hide failures, use unpinned dependencies, or upload an
  artifact different from the executable that was tested;
- documentation or specifications that no longer match user-visible behavior.

Do not report style preferences, broad refactoring suggestions, pre-existing
problems outside the changed lines, or speculative risks without a concrete
failure mode. Do not treat a failing check as a code defect until its logs show
the cause. Verify whether an apparent issue is already covered by code outside
the diff.

## Verification

Run focused checks when they can confirm or reject a finding. Run the project's
required local checks when the environment supports them:

```sh
bash build.sh
python3 tests/run.py
./bg --help
./bg --version
git diff --check
```

For web changes, also run the applicable Node syntax checks and
`npm run test:web`. Never weaken tests or update snapshots merely to make a check
pass. Report each command actually run and distinguish failures from checks that
could not run in the cloud environment.

Inspect GitHub Actions for the exact head SHA. `queued`, `in_progress`, `skipped`,
`cancelled`, missing, or inaccessible runs are not passing results. When a job
fails, inspect its failing step and logs before drawing a conclusion.

For UI or visual changes, follow `spec/visual-regression.md`. Verify the exact
base-to-head comparison, behavior assertions, repeat determinism, and the
`visual-comparison-<headSHA>` artifact. Inspect every changed image and ensure
declared expected-change regions, `baseSHA`, observed state, and decoded-pixel
hashes match the artifact. Classify unexpected changes as **REGRESSION**, valid
declared changes as **EXPECTED FEATURE CHANGE — REVIEW REQUIRED**, and missing
or incompatible evidence as **INCOMPLETE VISUAL VERIFICATION**. A declaration
does not prove that pixels inside its region are correct.

## Findings

Return findings first, ordered by severity. Use these levels:

- **P0** — release-blocking or catastrophic in nearly all uses.
- **P1** — serious defect likely to affect users or required CI.
- **P2** — real defect with a narrower trigger or moderate impact.
- **P3** — small but concrete correctness or maintainability defect.

For every finding:

- use a short title beginning with `[P0]`, `[P1]`, `[P2]`, or `[P3]`;
- point to the smallest relevant changed line range;
- describe the exact trigger and observable consequence;
- explain why the current code or test does not prevent it;
- avoid prescribing a large redesign when a concise explanation is enough.

Only report a finding when the evidence is strong enough that the author can act
on it. If there are no findings, say `No findings.` Do not invent an issue to
fill the review.

After the findings, provide a compact verification note containing:

- base SHA and head SHA;
- commands run and their results, including test counts, failures, errors, and
  skips when available;
- exact-head `build-and-test` and `visual-regression` conclusions and run links;
- visual classification when applicable;
- any limitation that makes the review incomplete.
