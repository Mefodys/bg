# Skill tags v1 — classification audit

Date: 2026-10-01. Atlas base: `b911ff2b7392d8b69c9642048f5bcef9821a6265`.

## Coverage and reproducible evidence

All 89 native logical records are classified: 73 MPS, 4 Koog, 6 Android, 6 Kotlin; 130 physical sources. Roles: 55 development, 32 product, 2 fixtures. Mirrors count once; product copies retain independent role/path identities. Complete canonical reads: 834,024 bytes; no warnings, truncation, unclassified records or absent/changed assignments. Source repositories were not modified.

[Machine-readable audit](../web/data/skill-tags-audit.json) records each identity, complete byte-normalized SHA-256, native aliases, source revision, active decision, all 3,916 unordered pair scores (including zero), and stable top-12 neighbours. Texts are read by the pinned native bounded reader. Manifests are data, not executable instructions.

| Repository | Native revision | Logical | Physical |
| --- | --- | ---: | ---: |
| mps | `49d37b63488a0a8e42eb0130cb867fd508f398ac` | 73 | 114 |
| koog | `16d83270f8a7f25358ae0165466f14e70416c428` | 4 | 4 |
| android | `4f0a5e1cb653c29f81c6b77eff885a6e81622cf4` | 6 | 6 |
| kotlin | `05d11b0de5a843d9a9ce78d0a38955147bea0563` | 6 | 6 |

```sh
node tools/skill-tags.mjs --check
node tools/skill-tags.mjs --verify /tmp/tags-verification.json
node tools/skill-tags.mjs --prepare /tmp/tags-preparation.json
```

`--check` validates the committed identity/hash/classification ledger, vocabulary and complete pair set without external checkouts. `--verify` rescans all four local reference roots and checks current coverage. `--prepare` emits review evidence without writing assignments; unknown/changed records require explicit semantic review and a versioned catalogue edit. Optional third argument is a trusted JSON root configuration (four `reference_key`/absolute `path` entries). Failed reads, missing roots, limits and deadlines produce incomplete evidence and a nonzero exit. Never run preparation as part of a search keystroke.

## Taxonomy and semantic decisions

43 used semantic tags: 15 Task, 21 Focus, 7 Platform. Every record has one primary Task, at most two secondary Tasks. Definitions and applicability guidance live in [taxonomy](../web/data/skill-tag-taxonomy.json); per-record reasons live in [catalogue](../web/data/skill-tags.json). No synonym tags or general Other bucket. Counts below are assignments, not additive result totals.

Invocation purpose determines the task. Complete bounded text feeds fixed-corpus scoring; declaration descriptions and workflow sections determine the classification. Shared boilerplate, companion references and incidental validation commands are not evidence for tag propagation. Similarity is a review aid; there is no threshold or transitive inheritance.

Specific reviewed boundaries:

- `mps-aspect-actions` defines node factories and copy/paste handlers in a language aspect: Language design, Models & AST, Editor behaviour. It is distinct from IntelliJ `actions` (IDE integration).
- `mps-aspect-typesystem` remains Language design despite test-related words such as WhenConcreteStatement. `mps-tests` is Testing because it authors/runs test cases.
- Gradle wrapper and compile API upgrades are Build & CI. The integration-test matrix skill also receives secondary Testing and Integration tests; it does not modify the wrapper.
- `write-evals` is Testing / Agent evaluations. `skill-optimization-study` is Performance analysis / Agent evaluations because its invocation measures hotspots and remedies rather than authoring ordinary tests.
- Android general development explicitly covers builds and testing: both secondary tasks are supported. Lint-check authoring and internal API visibility remain Code quality even though tests support their workflows.
- `mps-run-configurations` is Project setup with secondary Testing because launching MPS test roots is explicitly supported.
- XML model authoring is Model & AST work with secondary Code generation for explicitly documented generator templates.
- TeamCity applicability is TeamCity, not MPS merely because of storage. Jewel applies to Compose / Jewel and IntelliJ; it is not automatically Android Studio specific.
- Arithmetic and weather fixtures receive their actual task domains, preserving the separate native fixture role.
- All 32 product copies were separately checked against development hashes, with identical normalized bytes. Copy-reviewed assignments retain separate identities; future hash divergence invalidates only the changed record.

Similarity evidence (scores depend on this exact corpus): Jewel UI / Swing interop 48.82; Gradle wrapper / integration-test matrix 37.41; write-evals / Android development 22.30; write-evals / optimisation study 14.37. The latter two share supported tasks/subjects despite modest overlap. MPS dev/product exact copies score 100. MPS tests / aspects overview 31.56 does not justify propagating Testing to the overview.

## Tag counts

| Group | Tag | Assigned logical records |
| --- | --- | ---: |
| task | Testing (`task:testing`) | 8 |
| task | Debugging (`task:debugging`) | 3 |
| task | Build & CI (`task:build-ci`) | 10 |
| task | Version control & release (`task:version-control-release`) | 2 |
| task | Documentation & knowledge (`task:documentation-knowledge`) | 3 |
| task | Code quality (`task:code-quality`) | 4 |
| task | Language design (`task:language-design`) | 20 |
| task | Code generation (`task:code-generation`) | 8 |
| task | Model & AST work (`task:model-editing`) | 16 |
| task | Editor & UI (`task:editor-ui`) | 8 |
| task | IDE integration (`task:ide-integration`) | 5 |
| task | Project setup & dependencies (`task:project-setup`) | 7 |
| task | Performance analysis (`task:performance-analysis`) | 1 |
| task | Calculations (`task:calculations`) | 1 |
| task | Weather (`task:weather`) | 1 |
| focus | Unit tests (`focus:unit-tests`) | 2 |
| focus | Integration tests (`focus:integration-tests`) | 1 |
| focus | Agent evaluations (`focus:agent-evals`) | 2 |
| focus | Compiler diagnostics (`focus:compiler-diagnostics`) | 4 |
| focus | Type system (`focus:typesystem`) | 2 |
| focus | Constraints & scopes (`focus:constraints-scopes`) | 2 |
| focus | Dataflow (`focus:dataflow`) | 2 |
| focus | Generators (`focus:generators`) | 10 |
| focus | Models & AST (`focus:models-ast`) | 28 |
| focus | Language composition (`focus:language-composition`) | 4 |
| focus | Migrations (`focus:migrations`) | 4 |
| focus | Editor behaviour (`focus:editor-behaviour`) | 10 |
| focus | Desktop UI (`focus:desktop-ui`) | 2 |
| focus | IDE plugins (`focus:ide-plugins`) | 5 |
| focus | Gradle (`focus:gradle`) | 3 |
| focus | CI (`focus:ci`) | 2 |
| focus | Dependencies (`focus:dependencies`) | 11 |
| focus | API design (`focus:api-design`) | 1 |
| focus | Documentation (`focus:documentation`) | 3 |
| focus | Release tracking (`focus:release-tracking`) | 1 |
| focus | Performance (`focus:performance`) | 2 |
| platform | MPS (`platform:mps`) | 66 |
| platform | IntelliJ Platform (`platform:intellij`) | 13 |
| platform | Android Studio (`platform:android-studio`) | 4 |
| platform | Kotlin (`platform:kotlin`) | 8 |
| platform | Kotlin Multiplatform (`platform:kotlin-multiplatform`) | 1 |
| platform | Compose / Jewel (`platform:compose-jewel`) | 2 |
| platform | TeamCity (`platform:teamcity`) | 2 |

## Independent records

Each row is an independent native logical identity, including product copies. Full hashes and aliases are in the linked catalogue/ledger.

| Repository | Role | Canonical manifest | Primary task |
| --- | --- | --- | --- |
| android | development | `agent/skills/android-studio-development/SKILL.md` | `task:ide-integration` |
| android | development | `agent/skills/android-studio-diagnostics-analysis/SKILL.md` | `task:debugging` |
| android | development | `agent/skills/android-studio-evals/SKILL.md` | `task:testing` |
| android | development | `agent/skills/jewel-swing-interop/SKILL.md` | `task:editor-ui` |
| android | development | `agent/skills/jewel-ui/SKILL.md` | `task:editor-ui` |
| android | development | `agent/skills/writing-lint-checks/SKILL.md` | `task:code-quality` |
| koog | development | `.claude/skills/add-java-code-snippets-in-docs/SKILL.md` | `task:documentation-knowledge` |
| koog | development | `.claude/skills/split-jvm-nonjvm/SKILL.md` | `task:project-setup` |
| koog | test-fixture | `integration-tests/src/jvmTest/resources/skills/arithmetic-evaluator/SKILL.md` | `task:calculations` |
| koog | test-fixture | `integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md` | `task:weather` |
| kotlin | development | `.claude/skills/analysis-api-create-cherry-pick-issue/SKILL.md` | `task:version-control-release` |
| kotlin | development | `.claude/skills/analysis-api-mark-internal-apis/SKILL.md` | `task:code-quality` |
| kotlin | development | `.claude/skills/build-bump-gradle-version/SKILL.md` | `task:build-ci` |
| kotlin | development | `.claude/skills/build-tools-bump-gradle-api/SKILL.md` | `task:build-ci` |
| kotlin | development | `.claude/skills/build-tools-bump-gradle-in-tests/SKILL.md` | `task:build-ci` |
| kotlin | development | `.claude/skills/minimize-repro-for-diagnostic-test/SKILL.md` | `task:testing` |
| mps | development | `.agents/skills/actions/SKILL.md` | `task:ide-integration` |
| mps | development | `.agents/skills/bugfix-workflow/SKILL.md` | `task:debugging` |
| mps | development | `.agents/skills/code-style/SKILL.md` | `task:code-quality` |
| mps | development | `.agents/skills/commits/SKILL.md` | `task:version-control-release` |
| mps | development | `.agents/skills/debugging/SKILL.md` | `task:debugging` |
| mps | development | `.agents/skills/mps-aspect-accessories/SKILL.md` | `task:project-setup` |
| mps | development | `.agents/skills/mps-aspect-actions/SKILL.md` | `task:language-design` |
| mps | development | `.agents/skills/mps-aspect-behavior/SKILL.md` | `task:language-design` |
| mps | development | `.agents/skills/mps-aspect-constraints/SKILL.md` | `task:language-design` |
| mps | development | `.agents/skills/mps-aspect-dataflow/SKILL.md` | `task:language-design` |
| mps | development | `.agents/skills/mps-aspect-editor-menus-and-keymaps/SKILL.md` | `task:editor-ui` |
| mps | development | `.agents/skills/mps-aspect-editor/SKILL.md` | `task:editor-ui` |
| mps | development | `.agents/skills/mps-aspect-generation-plan/SKILL.md` | `task:code-generation` |
| mps | development | `.agents/skills/mps-aspect-generator/SKILL.md` | `task:code-generation` |
| mps | development | `.agents/skills/mps-aspect-intentions/SKILL.md` | `task:editor-ui` |
| mps | development | `.agents/skills/mps-aspect-migrations/SKILL.md` | `task:model-editing` |
| mps | development | `.agents/skills/mps-aspect-structure-concepts/SKILL.md` | `task:language-design` |
| mps | development | `.agents/skills/mps-aspect-textgen/SKILL.md` | `task:code-generation` |
| mps | development | `.agents/skills/mps-aspect-typesystem/SKILL.md` | `task:language-design` |
| mps | development | `.agents/skills/mps-baselanguage/SKILL.md` | `task:model-editing` |
| mps | development | `.agents/skills/mps-build-language/SKILL.md` | `task:build-ci` |
| mps | development | `.agents/skills/mps-console/SKILL.md` | `task:model-editing` |
| mps | development | `.agents/skills/mps-distribution-build/SKILL.md` | `task:build-ci` |
| mps | development | `.agents/skills/mps-dsl-memory/SKILL.md` | `task:documentation-knowledge` |
| mps | development | `.agents/skills/mps-ide-plugin/SKILL.md` | `task:ide-integration` |
| mps | development | `.agents/skills/mps-lang-core-xml/SKILL.md` | `task:model-editing` |
| mps | development | `.agents/skills/mps-language-analysis/SKILL.md` | `task:language-design` |
| mps | development | `.agents/skills/mps-language-aspects-overview/SKILL.md` | `task:language-design` |
| mps | development | `.agents/skills/mps-language-inheritance/SKILL.md` | `task:language-design` |
| mps | development | `.agents/skills/mps-language-modularity/SKILL.md` | `task:language-design` |
| mps | development | `.agents/skills/mps-mcp-workflow/SKILL.md` | `task:model-editing` |
| mps | development | `.agents/skills/mps-model-manipulation/SKILL.md` | `task:model-editing` |
| mps | development | `.agents/skills/mps-node-editing/SKILL.md` | `task:model-editing` |
| mps | development | `.agents/skills/mps-project-management/SKILL.md` | `task:project-setup` |
| mps | development | `.agents/skills/mps-quotations/SKILL.md` | `task:model-editing` |
| mps | development | `.agents/skills/mps-run-configurations/SKILL.md` | `task:project-setup` |
| mps | development | `.agents/skills/mps-tests/SKILL.md` | `task:testing` |
| mps | development | `.agents/skills/registry/SKILL.md` | `task:ide-integration` |
| mps | development | `.agents/skills/skill-optimization-study/SKILL.md` | `task:performance-analysis` |
| mps | development | `.agents/skills/ssr/SKILL.md` | `task:code-quality` |
| mps | development | `.agents/skills/teamcity-cli/SKILL.md` | `task:build-ci` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-accessories/SKILL.md` | `task:project-setup` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-actions/SKILL.md` | `task:language-design` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-behavior/SKILL.md` | `task:language-design` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-constraints/SKILL.md` | `task:language-design` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-dataflow/SKILL.md` | `task:language-design` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-editor-menus-and-keymaps/SKILL.md` | `task:editor-ui` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-editor/SKILL.md` | `task:editor-ui` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-generation-plan/SKILL.md` | `task:code-generation` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-generator/SKILL.md` | `task:code-generation` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-intentions/SKILL.md` | `task:editor-ui` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-migrations/SKILL.md` | `task:model-editing` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-structure-concepts/SKILL.md` | `task:language-design` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-textgen/SKILL.md` | `task:code-generation` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-aspect-typesystem/SKILL.md` | `task:language-design` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-baselanguage/SKILL.md` | `task:model-editing` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-build-language/SKILL.md` | `task:build-ci` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-console/SKILL.md` | `task:model-editing` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-distribution-build/SKILL.md` | `task:build-ci` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-dsl-memory/SKILL.md` | `task:documentation-knowledge` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-ide-plugin/SKILL.md` | `task:ide-integration` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-lang-core-xml/SKILL.md` | `task:model-editing` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-language-analysis/SKILL.md` | `task:language-design` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-language-aspects-overview/SKILL.md` | `task:language-design` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-language-inheritance/SKILL.md` | `task:language-design` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-language-modularity/SKILL.md` | `task:language-design` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-mcp-workflow/SKILL.md` | `task:model-editing` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-model-manipulation/SKILL.md` | `task:model-editing` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-node-editing/SKILL.md` | `task:model-editing` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-project-management/SKILL.md` | `task:project-setup` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-quotations/SKILL.md` | `task:model-editing` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-run-configurations/SKILL.md` | `task:project-setup` |
| mps | product | `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/mps-tests/SKILL.md` | `task:testing` |

## Verification boundaries

Local native/source audit and deterministic fixture CI are separate gates. The 90 → 12 → 3 example is fixture data (Testing + Agent evaluations), not advertised as live reference counts. Runtime has no model/network-inference dependency. Exact-head build/browser/visual/Claude/CI results are recorded in the implementation PR; this audit does not assert future source or CI success.
