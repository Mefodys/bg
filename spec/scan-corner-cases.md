# Skill Discovery Corner Cases — Agent Implementation Specification

## Objective

Extend the scanner and its automated tests to handle duplicate agent skills,
test fixtures, unconventional directories, and skills shipped as product
resources. Implement and validate these behaviors together with `spec/ci.md`.
GitHub CI inspection and failure repair are the coding agent's responsibility;
do not add GitHub authentication, CI monitoring, or automatic code repair to bg.

## Reference repositories

Use these public repositories:

| Repository | Cases |
| --- | --- |
| https://github.com/JetBrains/MPS | `.claude` / `.agents` duplicates; product resources |
| https://github.com/JetBrains/koog | Skills stored as test data |
| https://github.com/JetBrains/android | Unconventional `agent/skills` directory |
| https://github.com/JetBrains/kotlin | Existing baseline scan |

Local MPS, Koog, and Android checkouts are under `repositories/`. That directory
is intentionally ignored by Git. Kotlin may already be available locally.
Treat these repositories as read-only evidence; never run their skill scripts.
Record the Git revision used for each verification. Do not assume the contents
of a moving default branch remain constant.

## Required behaviors and tests

### 1. Duplicate skills in MPS

MPS has corresponding manifests under `.agents/skills/<skill>/SKILL.md` and
`.claude/skills/<skill>/SKILL.md`.

- Detect equivalent mirrored skills and show a single logical skill with all
  source locations retained. Prefer `.agents` as the canonical location for
  this specific mirror pair; ordering must be deterministic.
- Do not deduplicate by name alone. Skills with the same name but different
  contents must remain separate and be identified as conflicting variants.
- Define and document equivalence conservatively (same normalized name and
  full manifest content after line-ending normalization). Do not merge based
  only on matching short descriptions.
- Test equivalent mirrors, differing manifests with identical names, and
  stable ordering regardless of filesystem traversal order.

### 2. Test data in Koog

Reference paths include:

```text
integration-tests/src/jvmTest/resources/skills/arithmetic-evaluator/SKILL.md
integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md
```

- Discover these manifests, but label them as test fixtures and place them in
  a clearly separate section from repository-development skills.
- Do not silently discard them: scanning still covers the whole repository.
- Base classification on explicit test-directory path components, not vague
  substring matching. Document the rule and avoid classifying directories such
  as `contest` or skills named `test-helper` as test data without path evidence.
- Test fixture discovery, classification, and ordinary development skills in
  the same repository.

### 3. Unconventional directories in Android

Discover skills under `agent/skills/<skill>/SKILL.md`. Do not restrict discovery
to `.claude`, `.agents`, or any other directory allowlist. Add an automated test
using this layout and assert names, descriptions, and locations are preserved.

### 4. Product resources in MPS

Reference layout:

```text
plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/<skill>/SKILL.md
```

- Discover product-bundled skills and display them in a separate product-skills
  section. Preserve their exact locations and usable manifest links.
- A product resource must not disappear when its manifest matches a development
  skill: keep the development and product roles distinct. Deduplication must
  not cross these role boundaries.
- Define explicit, documented path rules; do not classify every `resources`
  folder as a product skill (Koog's test resources must remain test fixtures).
- Test a development skill and matching product resource together, plus the
  precedence of test-fixture classification over product-resource rules.

## Implementation and validation

Update `spec/cli.md` and `README.md` to describe classification, canonical and
additional locations, conflict handling, and any JSON fields added. Keep the
default terminal output readable and preserve `--json`.

Create small, checked-in fixtures representing all four cases. The automated
suite must exercise the compiled Kotlin/Native binary with those fixtures on
every CI run, without downloading entire external repositories. Include both
positive and negative assertions for classification and deduplication.

Also scan the real reference checkouts locally and compare their relevant
manifests with the resulting inventory. Record repository revisions, findings,
and any discrepancies in a report under `reports/`. If CI also runs real-repo
checks, pin revisions and keep them separate from the deterministic core tests;
network failures must be reported honestly, not disguised as passing tests.

Finish by following the hosted-CI verification and repair loop in `spec/ci.md`.
Do not declare the task complete with only local test results.
