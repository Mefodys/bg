# GitHub Actions CI — Agent Implementation Specification

## Objective

Add continuous integration to this repository using GitHub Actions. Every pull
request and push to `main` must build the Kotlin/Native CLI from source and run
the complete automated test suite against the newly built executable.

Read `AGENTS.md`, `README.md`, `build.sh`, and `tests/test_cli.py` before making
changes. Implement the workflow; do not stop after proposing a configuration.
Also implement and test every scenario in `spec/scan-corner-cases.md`. Those
tests must run in the same required `build-and-test` job on PRs and after merges.

## Required implementation

Create `.github/workflows/ci.yml` with:

- Triggers for `pull_request`, pushes to `main`, and `workflow_dispatch`.
- A job named `build-and-test` on a GitHub-hosted macOS ARM64 runner. Verify the
  selected runner label currently provides ARM64; the implementation uses macOS
  POSIX APIs and is not a Linux or Windows build.
- Read-only repository permissions (`contents: read`). Do not require secrets.
- A reasonable timeout and concurrency settings that cancel superseded runs
  for the same pull request or branch.

The job must perform these steps in order:

1. Check out the repository.
2. Set up a JDK compatible with the selected Kotlin/Native compiler and Python
   3 for the integration-test harness. Python is not a runtime dependency of bg.
3. Install a pinned, publicly released Kotlin/Native distribution for macOS
   ARM64 from the official JetBrains Kotlin GitHub releases. Prefer version
   `2.4.20` to match the local build, but verify the release and archive exist;
   if unavailable, use a supported published release and document that choice.
   Never use an unpinned `latest` download.
4. Cache reusable Kotlin/Native compiler dependencies under `~/.konan`, using
   a cache key that includes runner OS, architecture, and compiler version.
   Do not cache the compiled project binary as a substitute for building it.
5. Set `KONANC` to the installed compiler and run `bash build.sh`. The workflow
   must work on a clean runner without the developer's local directory layout.
6. Verify `./bg` is an executable ARM64 Mach-O binary, then run `./bg --version`
   and `./bg --help` as smoke checks.
7. Run the full suite:

   ```bash
   python3 tests/run.py
   ```

8. Verify `git diff --check` succeeds.
9. Upload `bg` as a downloadable artifact named `bg-macos-arm64` only after the
   build and tests succeed. Set a bounded artifact retention period.

Use supported versions of GitHub Actions. Do not suppress failed commands or
use `continue-on-error` for build, tests, or smoke checks. Keep the full test
output visible in the job log. The CI job must fail if no tests are discovered
or any test is skipped; the current non-root macOS runner should run every test.
Add an explicit check or test runner wrapper for these conditions if necessary.

## Documentation and agent rules

Update `README.md` with the CI triggers, the build/test commands, and how to
download the native executable artifact. Keep `AGENTS.md` aligned with the
actual workflow and its job name. Branch protection is outside this task:
document that `build-and-test` can be made a required check, but do not change
repository settings.

## Validation and acceptance criteria

- The workflow is valid GitHub Actions YAML and uses a compatible runner and
  compiler distribution.
- A clean checkout builds successfully and all discovered tests pass without
  skips; do not hardcode the current test count
  as the suite grows.
- Test failures, skipped tests, zero discovered tests, and compiler failures
  result in a failed job.
- CI does not depend on `/Users/anton.mefodichev`, the local Kotlin checkout,
  or any private credentials. Integration tests create their own repositories.
- The artifact is the executable that was built and tested in that job.
- The scanner's CLI and output contracts remain unchanged.

Run the local build and complete tests after implementation. If the agent has
authority to push, validate a real Actions run for that revision. Otherwise
report local results and state that the hosted CI run is pending. Never claim
GitHub Actions passed merely because the YAML was created or local tests passed.

## Hosted CI verification and failure-repair loop

The coding agent must inspect GitHub Actions for `Mefodys/bg`, using an
authenticated GitHub CLI, available GitHub connector, or the GitHub API.
This is agent tooling, not a feature of the scanner executable.

1. Build locally and run the complete suite, including the four corner cases.
2. Commit and push only when authorized by the user. If the user pushes manually,
   inspect CI once that revision exists remotely. Missing push authority is not
   permission to publish changes; report the concrete remaining action.
3. Resolve the exact delivered commit SHA and find its `ci.yml` workflow run.
   Check both the PR run, when applicable, and the `main` push run after merge.
   A pre-merge green run does not prove that a different merge commit is green.
4. Wait for the relevant run to finish. `queued`, `in_progress`, `cancelled`,
   `skipped`, a missing run, and an API/authentication error are not success.
   Do not use an unrelated older green run as evidence.
5. If the run fails, fetch the failing job/step logs, identify the actual cause,
   and distinguish a scanner/test defect from workflow/toolchain/environment
   or infrastructure problems. Report the cause with log evidence.
6. Fix the underlying problem within this project's scope, preserve regression
   coverage, rebuild, and run all tests again. Do not weaken assertions, ignore
   errors, skip failing cases, or simply rerun a deterministic failure.
7. Push the correction when authorized and repeat verification for its new SHA
   until all required jobs pass. For a transient infrastructure failure, use a
   justified retry and confirm the result rather than claiming success early.
8. If authentication, runner availability, push authority, or repository settings
   prevent progress, report the blocker and leave hosted verification pending.

Useful GitHub CLI commands (adapt workflow and branch names as needed):

```bash
gh run list --repo Mefodys/bg --workflow ci.yml --commit <commit-sha>
gh run watch <run-id> --repo Mefodys/bg --exit-status
gh run view <run-id> --repo Mefodys/bg --log-failed
```

The final report must include the verified commit SHA, workflow run URL, job
conclusions, local test count and results, and any fixes made after CI failures.
