# Skill Atlas — Similarity-Assisted Tags and Faceted Search

Status: implemented contract; delivery verification is reported in the implementation PR.
Initial classification evidence: [skill-tags-audit.md](skill-tags-audit.md).
Date: 2026-09-30.
Atlas source inspected: `74730e8cf740d7ceb6787b4744d35c66ad1bf465`.

## 1. Goal

Classify every logical skill in the four reference repositories with a shared,
useful vocabulary. Use the existing Similar skills scoring to discover related
skills and help review their classifications. Let users narrow a broad text
search with those tags, without losing repository identity or role information.

Example: searching `test` returns many skills because the word occurs in their
instructions. Selecting the task tag `Testing` narrows this to skills whose
purpose includes testing. Selecting the focus tag `Agent evaluations` narrows
it further to evaluation-related skills. The example of 90 matches is an
illustration, not a promised count for the current checkouts.

This task includes both feature implementation and a reviewed, complete initial
tag catalogue for MPS, Koog, Android and Kotlin. Shipping empty tagging
infrastructure or tagging only development skills does not satisfy the task.

## 2. Evidence and current boundaries

Native scans of the locally available reference checkouts produced:

| Repository key | Git HEAD inspected | Logical skills | Physical sources | Roles |
| --- | --- | ---: | ---: | --- |
| `mps` | `49d37b63488a0a8e42eb0130cb867fd508f398ac` | 73 | 114 | 41 development, 32 product |
| `koog` | `16d83270f8a7f25358ae0165466f14e70416c428` | 4 | 4 | 2 development, 2 test-fixture |
| `android` | `4f0a5e1cb653c29f81c6b77eff885a6e81622cf4` | 6 | 6 | 6 development |
| `kotlin` | `05d11b0de5a843d9a9ce78d0a38955147bea0563` | 6 | 6 | 6 development |
| Total | | 89 | 130 | 55 development, 32 product, 2 test-fixture |

Scans returned no warnings. All 89 canonical manifests were read with the
existing bounded native reader, without truncation or errors: 834,024 UTF-8
bytes in total, maximum 22,365 bytes per manifest. Git HEAD is contextual;
actual manifest hashes must identify the evidence, including any local edits.

See [web.md](web.md), [multi-repository-filter.md](multi-repository-filter.md),
[cli.md](cli.md) and [scan-corner-cases.md](scan-corner-cases.md).

- The native scanner owns discovery, roles, mirror grouping and conflicts.
- Filter already searches names, descriptions, source paths and full manifests
  across Current / Selected / All added repositories, with 100-row pagination.
- Similar skills uses deterministic full-text TF-IDF cosine, without runtime
  inference. Its public comparison excludes the source repository and normally
  compares only the selected role. Scores depend on the comparison corpus.
- Existing categories describe the role/location of a skill, not its purpose.
  A weather skill used as a fixture is about weather; its role remains fixture.

A probe reusing `web/similarity.mjs` over all 89 canonical texts found:
Jewel UI / Swing interop 48.82; debugging / Android diagnostics 14.77;
Gradle wrapper / integration-test matrix 37.41; exact MPS development/product
copies 100. Scores are evidence about text overlap, not semantic certainty.
One high universal threshold would miss useful groups. Shared boilerplate can
also produce similarity between skills with different purposes.

## 3. Taxonomy v1

Store tags in a versioned controlled vocabulary. Use stable namespaced ASCII
IDs, English UI labels, a description, inclusion/exclusion guidance and examples.
Do not create synonyms such as separate `test`, `tests` and `testing` tags.
Do not generate a unique tag for every skill or reuse repository names as tasks.

### Task group — what the skill helps someone do

Every fully classified skill has exactly one primary task tag. Up to two
additional task tags are allowed for distinct, explicitly supported workflows.
Choose the primary tag from the main invocation purpose, not word frequency.

| ID | Label | Inclusion and boundary | Corpus examples |
| --- | --- | --- | --- |
| `task:testing` | Testing | Create/run tests, repro tests, or agent evaluations; incidental test commands alone are insufficient. | mps-tests, write-evals, minimize-repro-for-diagnostic-test |
| `task:debugging` | Debugging | Diagnose failures, inspect logs/dumps, or execute a bugfix investigation workflow. | debugging, android-studio-diagnostics-analysis, bugfix-workflow |
| `task:build-ci` | Build & CI | Build systems, packaging, build-tool upgrades and CI operations. | teamcity-cli, mps-distribution-build, three Gradle upgrade skills |
| `task:version-control-release` | Version control & release | Commits, cherry-picks and release tracking. | commits, analysis-api-create-cherry-pick-issue |
| `task:documentation-knowledge` | Documentation & knowledge | Documentation examples or reusable knowledge/skill maintenance. | add-java-code-snippets-in-docs, mps-dsl-memory |
| `task:code-quality` | Code quality | Style, inspections, visibility/API hygiene, structural search. | code-style, ssr, writing-lint-checks, analysis-api-mark-internal-apis |
| `task:language-design` | Language design | Concepts, semantics, constraints, type systems, language analysis/composition. | mps-aspect-structure-concepts, mps-aspect-typesystem |
| `task:code-generation` | Code generation | Generators, generation plans and textual output generation. | mps-aspect-generator, mps-aspect-generation-plan, mps-aspect-textgen |
| `task:model-editing` | Model & AST work | Construct, query, modify or migrate models/nodes/ASTs. | mps-node-editing, mps-console, mps-quotations |
| `task:editor-ui` | Editor & UI | Editor behaviour/layout, intentions, Compose/Swing interfaces. | mps-aspect-editor, jewel-ui, jewel-swing-interop |
| `task:ide-integration` | IDE integration | Plugins, host IDE actions and platform extension mechanisms. | actions, registry, mps-ide-plugin, android-studio-development |
| `task:project-setup` | Project setup & dependencies | Projects, module dependencies, source sets and run configurations. | mps-project-management, mps-aspect-accessories, split-jvm-nonjvm |
| `task:performance-analysis` | Performance analysis | Measurements, profiling, efficiency studies and optimisation experiments. | skill-optimization-study |
| `task:calculations` | Calculations | Evaluate numeric expressions. | arithmetic-evaluator |
| `task:weather` | Weather | Retrieve weather/forecast information. | weather-retrieval |

Avoid a generic `Other` category in the initial corpus: all 89 must receive a
specific reviewed task. Do not tag every MPS skill as testing just because it
ends with validation instructions. For a multi-purpose skill, assign a secondary
task only if its invocation conditions explicitly support that workflow.
Calculations, Weather and Performance analysis have few initial members but
describe reusable task domains rather than skill-specific names. Retain them
to classify actual fixture functionality and the performance workflow.

### Focus group — the narrower subject

Optional multiple selection. Initial IDs and labels:

| IDs | Labels |
| --- | --- |
| `focus:unit-tests`, `focus:integration-tests`, `focus:agent-evals` | Unit tests; Integration tests; Agent evaluations |
| `focus:compiler-diagnostics`, `focus:typesystem`, `focus:constraints-scopes`, `focus:dataflow` | Compiler diagnostics; Type system; Constraints & scopes; Dataflow |
| `focus:generators`, `focus:models-ast`, `focus:language-composition`, `focus:migrations` | Generators; Models & AST; Language composition; Migrations |
| `focus:editor-behaviour`, `focus:desktop-ui`, `focus:ide-plugins` | Editor behaviour; Desktop UI; IDE plugins |
| `focus:gradle`, `focus:ci`, `focus:dependencies`, `focus:api-design` | Gradle; CI; Dependencies; API design |
| `focus:documentation`, `focus:release-tracking`, `focus:performance` | Documentation; Release tracking; Performance |

Focus tags identify workflows/topics actually covered, not every technology
mentioned in an example. A skill whose purpose is testing may have generators
or editor-behaviour focus; a generator skill does not automatically gain Testing.
Do not require a focus tag when the vocabulary does not add useful information.
Task describes the action; Focus describes its subject/subtype. Integration
tests can refine Testing or identify the subject of a Build & CI upgrade.
Explain these group meanings beside their controls.

### Platform group — applicability, not storage repository

Optional multiple selection: `platform:mps` (MPS),
`platform:intellij` (IntelliJ Platform), `platform:android-studio` (Android Studio),
`platform:kotlin` (Kotlin), `platform:kotlin-multiplatform` (Kotlin Multiplatform),
`platform:compose-jewel` (Compose / Jewel), `platform:teamcity` (TeamCity).

Assign based on manifest applicability. Being stored in MPS does not make a
general TeamCity skill MPS-specific. Repository and existing role remain separate
filters/badges. Version numbers, absolute paths and skill names are not tags.

The tables are a concrete starting vocabulary supported by the inspected corpus.
During implementation, review complete manifests, produce the exact per-skill
assignment and label/count report, and revise unused/ambiguous tags before
freezing taxonomy v1. Any new tag requires a definition and corpus example;
record taxonomy changes rather than silently changing existing ID meanings.
Every semantic tag shipped in v1 must have at least one reviewed assignment;
remove unused candidates from the final taxonomy.

## 4. Similarity-assisted classification of the whole corpus

Provide a developer-operated batch preparation command inside the Atlas repo.
It is a maintenance tool, not an operation triggered by typing in Filter.
It reads the four configured local reference roots using `bg scan --json` and
the same allowlisted, pinned native manifest reader. Do not run skill scripts or
obey manifest instructions: manifests are classification data in this workflow.

1. Capture native inventories, source revisions, canonical paths, roles,
   mirror aliases, full manifest hashes and all discovery/read warnings.
2. Prepare one stable, complete corpus in repository-key/category/path order,
   including development, product and fixture roles and same-repository pairs.
3. Reuse/refactor the existing normalisation, tokens, TF/IDF and cosine into a
   shared scorer; compute vectors once. Score every unordered pair once against
   this fixed corpus. With 89 records there are 3,916 pairs. Keep all pair scores
   in the review artifact, including zero-score pairs; do not claim universal
   semantic similarity from this enumeration.
4. Show each skill's nearest neighbours and exact-content relations as review
   aids. A compact top-12 view may be used, with the full pair list available.
   No similarity threshold automatically assigns tags or determines coverage.
   If a threshold is later used for display, record it in the versioned report.
5. Use invocation purpose, description and complete body to propose task,
   focus and platform tags. Group semantically related skills even when their
   text score is low. Do not propagate all tags along transitive graph edges.
6. Review assignments for all skills, with explicit reasoning for ambiguous
   cases. Similarity suggests candidates; the reviewed assignment is authoritative.
7. Emit the catalogue, evidence/coverage report and reproducible validation.

Preserve logical identities throughout. Mirrors count once. Identical
development and product texts are separate records with potentially equal
semantic tags and different roles. Cross-repository copies remain separate.
Name conflicts receive independent assignments; name-only joining is forbidden.

Default pair corpus includes each native logical record exactly once, including
identical records in different roles. Record that policy because duplicates
affect IDF. Never compare scores from this full-corpus batch with unrelated
interactive comparison scores as if they were on an absolute semantic scale.
The existing public Similar skills API keeps its present source-repository,
role and response semantics. Internal batch capabilities extend the shared
scorer; they do not silently change the existing panel contract.

Bounds: at most 512 logical records, 1 MiB per complete canonical manifest,
8 MiB total text, 16 MiB per native scan output and 120 seconds per preparation.
With more data or failed reads, return explicit incomplete coverage and the
omitted identities; do not score prefixes or publish a complete catalogue.
Use the server's shared worker if preparation is invoked while the server runs;
otherwise run the maintenance tool as a separate offline process. Runtime
search never recomputes the matrix or launches a model.

## 5. Persistent catalogue and identity

Ship reviewed data with the feature, under proposed files:

- `web/data/skill-tag-taxonomy.json`: schema/taxonomy version and tag definitions.
- `web/data/skill-tags.json`: reviewed assignments for all four reference repos.
- `spec/skill-tags-audit.md`: revisions, hashes, taxonomy rationale, coverage,
  ambiguous decisions and similarity evidence, without full copied transcripts.
- A maintenance command and fixtures/tests for validation and regeneration.

These are Atlas-owned metadata. Do not edit the four repositories' SKILL.md
files or write tags into their checkouts. No runtime model/API/database is
required. Commit the reviewed catalogue in the feature branch during the later
implementation task; temporary scan IDs, roots and timestamps are not its keys.

Persistent identity is `(reference_repository_key, category,
canonical_manifest_path)`, plus a reviewed canonical-content hash. Repository
keys are explicitly bound to the four presets' resolved realpaths; aliases of
one preset share a binding. Never bind by basename alone. A separate checkout
or arbitrary added directory is unbound unless explicitly configured as the
same reference repository. A mismatch must not attach another repo's tags.
Add a stable key field to preset configuration: MPS → mps, koog → koog,
android → android, kotlin → kotlin. Retain their current availability rules.
Define those bindings in trusted server configuration, not request-supplied
filesystem paths or inferred Git remotes. Preserve non-Git manual scan support.

Store source aliases and the inventory revision as evidence, not name-only keys.
Hash complete raw bytes with byte-level CRLF/CR-to-LF normalisation using
SHA-256, before decoding. Include any UTF-8 BOM; do not merge invalid UTF-8
through replacement decoding. Extend the bounded reader result with this
digest computed before its existing TextDecoder, preserving display/scoring.
Read full canonical content through the pinned native reader to validate a hash;
metadata, truncated text or the 240-character description cannot confirm it.

An assignment has primary_task, tag_ids (including the primary), source hash,
taxonomy version, reviewed/proposed status, concise evidence/reason, and origin
(`reviewed`, `exact-content-copy-reviewed`, or `manual-override`). Similarity
neighbours/scores belong to the audit evidence and are not tag IDs.

Example record (hash placeholder is illustrative, not a usable assignment):

```json
{
  "repository_key": "android",
  "category": "development",
  "manifest_path": "agent/skills/android-studio-evals/SKILL.md",
  "manifest_sha256": "<64 lowercase hexadecimal characters>",
  "taxonomy_version": 1,
  "primary_task": "task:testing",
  "tag_ids": ["task:testing", "focus:agent-evals", "platform:android-studio"],
  "status": "reviewed",
  "origin": "reviewed",
  "reason": "Creates agent evaluation scenarios and verification logic."
}
```

Canonical paths changing outside the stored source alias set invalidate the
binding. A surviving mirror alias retains tags only when repository, role
and complete hash match and the assignment remains unique. Never silently
follow an arbitrary rename or copy tags to a same-name manifest. Deleted
records remain in the historical audit and no longer contribute live counts.
New/changed/unreadable/unbound records have the system state/tag
`status:needs-classification` (Needs classification) and a reason. This is
visible and filterable but is not a substitute for an initial semantic task.
All initial readable reference records must have reviewed semantic tags;
initial needs-classification count must be zero. The system state permits
future unknown skills to remain visible instead of disappearing from search.

On source/hash or taxonomy mismatch, retain the old assignment as audit history,
not an active filter value. Reclassify through the maintenance workflow; compare
changes and review them before replacing data. Refresh/rescan must preserve
still-valid tags and invalidate stale ones. Restart reloads the catalogue.
Do not keep tags solely in browser localStorage or ephemeral scan sessions.
Overrides use the same versioned catalogue, not a new writable UI in v1.

## 6. Runtime integration and API

Keep the native CLI inventory/export contract intact. Atlas joins tags to
native records in an additive enrichment layer; it does not reimplement scanning.
Both focused scans and multi-repository snapshots receive identical enrichment.

`GET /api/tags` returns versioned groups/definitions. Extend scan and
search-snapshot responses with a top-level `tagging` field:

- schema version, taxonomy version and immutable catalogue digest;
- assignments keyed by canonical manifest path within that owning response,
  containing primary task, active tag IDs and classification status/reason;
- coverage: total logical records, reviewed records, needs-classification
  records and specific warnings. No full source text is added to this field.

Repository/scan ownership already present in the envelope supplies runtime
identity. Never join results from different owning snapshots by relative path
alone. Mirror source selection resolves to the same logical assignment.
Focused scans, snapshots and details reuse this ownership, including recovery
and conflicts. Similarity targets currently have no response scan session.
Join each target's bound preset key from canonical realpath, category and
manifest path against the complete digest computed during that comparison's
bounded read. Add per-result tagging metadata; do not manufacture a scan ID
or copy the source's tags. Unbound targets show Needs classification.
Omitted candidates retain existing partial/warnings and have no scored result.

API schema/taxonomy/catalogue validation rejects duplicate IDs, unknown tags,
wrong-group primary tasks, path traversal, duplicate assignments and invalid
hashes. Treat catalogue JSON as data, never executable instructions. Preserve
Host/Origin checks, loopback, byte/time limits and scanner warning behaviour.

If the catalogue is missing/invalid or a hash cannot be validated, preserve text
search and label tagging unavailable/incomplete; do not present an empty tag
list as a successfully classified inventory. A catalogue validation failure
produces a structured warning and Needs classification records; the tag
definitions endpoint returns an actionable error for invalid definitions.

Reuse complete canonical reads from the search index for hashes; reread only
if the cached index cannot confirm a complete canonical source. Share the
result/promise to avoid duplicate concurrent reads.
Cache full-source/hash validation with scan lifetime; perform it on preparation
and refresh, never per keystroke or tag click. The existing index budgets still
apply. If the full-text index is truncated, canonical hash validation may use a
separate bounded complete canonical read within the same worker/job budget.
Any remaining budget/read failure yields explicit unconfirmed classification.
Eviction and expiry invalidate the associated enrichment cache as well.
Catalogue changes are loaded on server restart in v1; a browser receiving a new
digest must rebuild tag state with those definitions and reload owned snapshots.

Keep the existing Download inventory JSON unchanged; add `Download tagged
inventory` for the focused repository. It exports the native inventory plus
tagging envelope/version/digest without claiming to export all search scopes.

## 7. Search and UI contract

Add a `Tags` area inside Filter below the query/scope controls, with labelled
Task, Focus and Platform groups. Include a separate Needs classification filter
only when present, and a concise tagging-coverage warning when incomplete.
Use checkbox multi-selection and removable selected-tag chips; make the tag
list collapsible on mobile. All text is English, escaped and keyboard accessible.

Filtering is an intersection of scope, role category, literal text query and
tag facets. Within each group selected tags use OR; between groups use AND.
An empty selection in a group imposes no restriction. Secondary task tags also
match Task selection. Needs classification is an Unclassified only mode that
retains but suspends semantic selections, explains that suspension and applies
scope/category/query to unclassified records. Turning it off restores the
semantic facets. Thus Testing OR Debugging, plus Gradle, means
`(Testing OR Debugging) AND Gradle`, not three mandatory tags.

Do not make tag labels part of the full-manifest text query: `test` retains its
existing literal matching. Tags provide an additional semantic filter and do
not silently change snippets, highlights, substring/Unicode behaviour or ranks.
Preserve repository/section/skill order; selecting tags narrows the list rather
than sorting by similarity or hiding duplicate cross-repository entries.

Define counts with logical skill sets over all pages:

- `C`: loaded logical records after scope and category, before query/tags.
- `Q`: subset of C matching the query, before tags.
- `R`: subset of Q matching semantic facets, or unclassified records in Q
  when Unclassified only is enabled.
- Result pill: `R of C`; when tags are selected, show `Q text matches before tags`.
- Each tag count is the number in Q matching that tag and all selected groups
  other than its own in normal mode. Disable semantic controls/counts while
  Unclassified only is enabled. Its count is the unclassified subset of Q,
  independent of suspended semantic selections.
  Counts are availability of a facet value, not a sum to be added to R.

Update counts whenever query/category/scope/tag selections change. Mirrors
count once; separate roles/repos count independently. Counts include hidden
pages and carry existing pending/partial/stale warnings. Do not invent missing
repository counts. Classification coverage and body-search coverage are separate:
one may be complete while the other is partial.

Keep checked tags visible even when their count becomes zero. Unchecked
zero-count tags can be disabled; selected zero-count values remain removable.
Changing query/category/scope preserves tag selection and resets to page 1.
Clear/Escape in the query clears only text and returns focus; `Clear tags`
clears only tags/status and resets page 1; neither clears category/scope.
Provide no ambiguous
single clear action that unexpectedly discards all filters.

Each search row shows its primary task and compact remaining tag chips, with
an accessible expansion for the full set. Clicking a semantic chip selects that
facet value and resets pagination without opening the details. Result activation
still opens the owning manifest; implement separate accessible controls rather
than nesting tag buttons inside an existing result button.
Details and Similar skills results show the complete tags and classification
status for the right owner. Unknown targets in Similar skills remain visible
with Needs classification; do not mislabel them by the selected source's tags.

Refresh regenerates indices/enrichment and preserves valid selected IDs.
If a taxonomy change removes a selected ID, remove it with an explicit message.
Expired-detail recovery revalidates the current assignment before rendering.
Zero results explain active query/tags and provide Clear tags; empty repository,
no selected repository, tagging unavailable and zero matches remain distinct.

No classification/model calls, reads, rescans or new network requests occur per
query keystroke, tag selection or pagination after snapshots are prepared.
Support desktop 1440x1000 and mobile 390x844 without horizontal overflow,
visible focus, checkbox labels, readable chips and live result announcements.

## 8. Initial primary-task coverage plan

The following covers all 57 distinct skill names in the inspected inventories.
For MPS's 32 corresponding product records, start from the same proposed primary
task as the development record, then confirm complete content and preserve
separate identities. This yields 73 MPS records and 89 records overall.
This is a proposed semantic mapping, not a claim that runtime tagging exists.
Implementation must fill per-record hashes, secondary/focus/platform tags,
evidence and review status. Different-content conflicts must not inherit by name.

All 32 inspected product manifests have byte-identical SHA-256 matches with
their development counterpart. Their names are:
mps-aspect-accessories; mps-aspect-actions; mps-aspect-behavior; mps-aspect-constraints; mps-aspect-dataflow; mps-aspect-editor-menus-and-keymaps; mps-aspect-editor; mps-aspect-generation-plan; mps-aspect-generator; mps-aspect-intentions; mps-aspect-migrations; mps-aspect-structure-concepts; mps-aspect-textgen; mps-aspect-typesystem; mps-baselanguage; mps-build-language; mps-console; mps-distribution-build; mps-dsl-memory; mps-ide-plugin; mps-lang-core-xml; mps-language-analysis; mps-language-aspects-overview; mps-language-inheritance; mps-language-modularity; mps-mcp-workflow; mps-model-manipulation; mps-node-editing; mps-project-management; mps-quotations; mps-run-configurations; mps-tests.
The implementation audit must enumerate their independent role/path/hash
records and fail inherited assignments without a matching hash or separate review.

| Repository | Proposed primary task | Skill names |
| --- | --- | --- |
| MPS | Ide integration | actions; registry; mps-ide-plugin |
| MPS | Debugging | debugging; bugfix-workflow |
| MPS | Code quality | code-style; ssr |
| MPS | Version control & release | commits |
| MPS | Project setup & dependencies | mps-aspect-accessories; mps-project-management; mps-run-configurations |
| MPS | Language design | mps-aspect-actions; mps-aspect-behavior; mps-aspect-constraints; mps-aspect-dataflow; mps-aspect-structure-concepts; mps-aspect-typesystem; mps-language-analysis; mps-language-aspects-overview; mps-language-inheritance; mps-language-modularity |
| MPS | Editor & UI | mps-aspect-editor; mps-aspect-editor-menus-and-keymaps; mps-aspect-intentions |
| MPS | Code generation | mps-aspect-generator; mps-aspect-generation-plan; mps-aspect-textgen |
| MPS | Model & AST work | mps-aspect-migrations; mps-baselanguage; mps-console; mps-lang-core-xml; mps-mcp-workflow; mps-model-manipulation; mps-node-editing; mps-quotations |
| MPS | Build & CI | mps-build-language; mps-distribution-build; teamcity-cli |
| MPS | Documentation & knowledge | mps-dsl-memory |
| MPS | Testing | mps-tests |
| MPS | Performance analysis | skill-optimization-study |
| Koog | Documentation & knowledge | add-java-code-snippets-in-docs |
| Koog | Project setup & dependencies | split-jvm-nonjvm |
| Koog | Calculations | arithmetic-evaluator |
| Koog | Weather | weather-retrieval |
| Android | Ide integration | android-studio-development |
| Android | Debugging | android-studio-diagnostics-analysis |
| Android | Testing | write-evals (directory android-studio-evals) |
| Android | Editor & UI | jewel-ui; jewel-swing-interop |
| Android | Code quality | writing-lint-checks |
| Kotlin | Version control & release | analysis-api-create-cherry-pick-issue |
| Kotlin | Code quality | analysis-api-mark-internal-apis |
| Kotlin | Build & CI | build-bump-gradle-version; build-tools-bump-gradle-api; build-tools-bump-gradle-in-tests |
| Kotlin | Testing | minimize-repro-for-diagnostic-test |

Required secondary/focus review examples: Gradle integration-test matrix has
primary Build & CI plus Testing/Integration tests/Gradle; Android general
development may add Testing and Build & CI if invocation guidance supports
them; mps-tests may include type system/editor/generator/migration focuses;
skill-optimization-study may include Agent evaluations/Performance. Do not
copy every focus mentioned in another skill's companion list.
Primary Testing covers four logical records in this plan (MPS development
and product, Android evaluations, Kotlin repro). Secondary Testing is expected
where explicit invocation workflows support it, not for incidental test words.
Distinguish node-factory mps-aspect-actions from IntelliJ platform actions.

## 9. Implementation sequence and two-agent review

1. Capture a pinned audit corpus and similarity report. Review/finalise taxonomy,
   classify all records and validate full initial coverage before UI delivery.
2. Implement shared scoring preparation and validated persistent catalogue;
   add owning-snapshot enrichment, hash lifecycle and coverage errors.
3. Implement facets/counts/chips/clear actions and details/Similar skills tags,
   preserving Filter and native discovery contracts.
4. Codex provides the exact diff/catalogue and requirements to Claude Code
   (`--model sonnet --effort medium`) through the existing Central route.
   Claude independently reviews taxonomy/ambiguous cases, all coverage,
   identity/lifecycle/filter semantics and implementation/test gaps.
5. Codex reproduces or checks each finding, fixes confirmed problems and asks
   Claude to review changed areas. Record actual model if CLI reports it.
6. Execute final project checks, publish feature PR within current permissions
   and follow authorised merge/CI/rebuild/restart/HTTP/screenshot workflow.

Implementation was authorised on 2026-10-01. Source checkouts remain read-only;
merge still requires separate authorisation.
Model assistance is a development/review workflow, not a runtime dependency.

## 10. Acceptance and verification

- Initial corpus has 89 reviewed assignments at the recorded evidence state,
  no unclassified readable records, unknown IDs or name-only joins. If source
  repos move, regenerate the pinned report and account for every changed count.
- A machine-readable coverage assertion checks set equality with native logical
  identities, one primary task per record, mirror aliases, independent roles,
  distinct conflicts and valid hashes. A sampling check is insufficient.
  This is a local maintainer gate against pinned real checkouts, recorded with
  date/revisions/hashes in the audit. CI checks the committed inventory identity
  ledger/catalogue consistency and fixture-native lifecycle behaviour; it does
  not download the four live repositories. Audit tag counts must match data.
- Exact-corpus pair scoring reuses the current formula and has deterministic
  order/scores, same-repo/role pairs, explicit limits and incomplete-read output.
  Existing interactive Similar skills behaviour/formula tests still pass.
- Fixtures distinguish a true testing skill from a typesystem skill mentioning
  `WhenConcreteStatement`/tests, a Gradle integration-test workflow, an agent
  evaluation skill, a generic IDE skill and fixture weather/calculation skills.
- A deterministic example has 90 query matches, 12 Testing matches and 3
  Testing + Agent evaluations matches. Assert these exact fixture values,
  all-page counts, group OR/cross-group AND and no duplicate mirror counting.
  These fixture numbers must not be advertised as live reference counts.
- Verify empty query, query clear/Escape/focus, Clear tags, selection persistence,
  disabled/selected zero-count tags, chip activation vs details activation,
  category/scopes, pagination reset, correct owning details and Similar skills.
- Verify catalogue restart persistence, root aliases, duplicate basenames,
  unbound manual directories, mirrors/conflicts/roles, deleted/renamed/changed
  manifests, taxonomy digest changes, unreadable/truncated canonical reads,
  invalid/missing catalogue, partial repositories, refresh and expired recovery.
  Include BOM, CRLF/CR and invalid UTF-8 byte/hash fixtures. Proposed assignments
  belong to preparation artifacts and count as Needs classification if exposed;
  only reviewed initial data is shipped.
- HTTP tests enforce safe joins/reads and no new per-keystroke native/model work;
  focused/snapshot/export schemas are validated. Deterministic tests use local
  fixtures, real native discovery and fixed assignments without Central access.
- UI checks cover keyboard/screen-reader labels, focus, English errors and
  390px overflow. Add deterministic Playwright Test screenshots for tag groups,
  query+tags, multiple facets, zero results/clear, details, Similar skills,
  classification/partial errors and mobile. Repeat all accepted shared scenarios.
- Run the project's fresh build, full strict test suite, browser suites, CLI
  smoke and whitespace checks after the final application change. Verify exact
  PR/merge CI where applicable. After authorised merge, continue serving update,
  rebuild/restart/HTTP checks and screenshot comparison as required by AGENTS.
  Use exact pixel tolerance and unchanged-repeat verification; review expected
  changes separately from REGRESSION and never auto-update baseline to pass.

## 11. Non-goals for v1

Runtime LLM/embeddings, remote repository crawling, editing source SKILL.md,
executing their workflows, Git remote inference, a tag-editing/admin UI,
free-form user tags, similarity-based result ranking and cross-repo deduplication
are not required. Support future reclassification through versioned metadata
and the maintenance workflow, rather than silently guessing stale assignments.
