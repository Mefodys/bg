# Filter — Search Across Added Repositories

Status: implemented contract; delivery verification is reported separately.
Date: 2026-09-30.

## Goal and current behavior

Extend Filter so one query can find skills in several local repositories already
available to the server. For example, searching `test` across MPS, Koog, and
Kotlin should show matches from all three, with their repository identities.

Before this feature, `GET /api/repositories` returned available MPS, Koog, Android, and
Kotlin presets. A successful manual scan created a temporary scan session, but
did not add that path to the repository list. Filter owned one manifest index
and searched the currently scanned inventory only. See [web.md](web.md) for
the existing literal matching, snippets, categories, and manifest reader.

This feature extends that search and its repository selection. Repository
cloning, remote search, new inference services, and changes to TF-IDF scoring
are outside this feature.

## Added repositories

An added repository is a local directory in the server's repository catalogue:

- An available preset returned by the existing repository endpoint.
- A directory successfully scanned through the existing repository-path form
  during the current server process. Failed scans do not register directories.

Maintain this catalogue in memory. Presets are discovered again after restart;
manually added directories must be scanned again to register them. Persistence
and a separate add/remove repository screen are not required in this version.

Assign an opaque `repository_id` to each canonical `realpath`. Aliases and
repeated additions of the same checkout share one entry, scan cache, and search
count. Distinct checkouts remain separate even when names and contents match.
Display the name and canonical absolute path so equal basenames are distinguishable.
Do not require a Git checkout for paths accepted by the existing scanner.

Retain known entries when a directory becomes unavailable; mark their status
explicitly. A missing preset at startup is not offered as an available choice.
Bound the catalogue to 64 entries. Registering another new directory at this
limit returns an actionable error before scanning; existing entries can be rescanned.

## User flow and search scope

Add a labelled `Search in` control inside Filter with these modes:

| Mode | Repositories searched |
| --- | --- |
| `Current repository` | The currently focused, successfully scanned directory. Initial default. |
| `Selected repositories` | The entries checked by the user, including or excluding the current directory. |
| `All added repositories` | All catalogue entries at the time this scope is selected or refreshed. |

The selector lists repository names, accessible absolute paths, checkboxes, and
preparation/error status. It supports keyboard use and the 390px layout. Keep
the existing Search skills field, category controls, clear action, and visual style.

1. The user opens an existing repository or uses an available preset.
2. They keep the current scope, choose several repositories, or select all.
3. Missing inventories and full-text indices are prepared once. Show progress
   by repository; ready repositories can already contribute results.
4. Typing filters the prepared snapshots immediately, without requiring Enter.
5. A result identifies its repository and opens that repository's manifest.
6. `Refresh search repositories` rescans the selected directories and rebuilds
   their indices. Show when each successfully loaded snapshot was scanned.

Permit at most eight distinct repositories in one scope, including the current
repository when selected. If All would exceed eight, explain the limit and
offer explicit selection; do not silently search only the first eight.

Switching scope preserves the query and category. Clear/Escape removes only
the query and returns focus to the input. An empty query lists the logical
skills in the selected repositories/category. Selecting no repositories shows
`Choose at least one repository`, with no scan request.

Changing the focused repository updates Current mode. Selected mode keeps its
checked IDs. All mode adds a newly registered repository after catalogue reload,
subject to the eight-repository limit. A failed focus scan preserves the previous
focused inventory, selection, query, and results.

## Matching, identity, and presentation

Preserve the existing trimmed, case-insensitive, literal substring search over
the name, description, full readable source manifests, and every source path.
For example, `test` still matches `WhenConcreteStatement` beyond a shortened
description. Treat HTML and regex metacharacters as text; preserve Unicode
offsets and original case in highlights. Use the existing snippet precedence.

Group results by repository, then by the scanner's existing sections. Use a
stable repository order by canonical path and retain native section/skill order.
Every result shows its name, repository name, skill path, contextual snippet,
category, mirror information, and conflict state. Absolute repository paths
must be available through accessible details, rather than only hover text.

Use `(repository_id, scan_id, canonical manifest_path)` as result identity.
Key source text by repository/scan and source path. A relative path alone is
insufficient: `skills/test/SKILL.md` can exist in several checkouts.

Mirror grouping and classification come from `bg` within each repository.
Identical skills in different repositories remain separate results. Product,
development, and test-fixture roles retain their native boundaries; the category
filter intersects every selected inventory. Conflict variants remain separate.

The count pill is `matched logical skills of category-total` across the selected,
loaded inventories. Mirrors count once per repository. The same skill in two
distinct repositories contributes two. Counts cover all matches, including those
on other result pages. Render at most 100 result rows per page; pagination uses
the prepared data and does not rescan or reread manifests.

While repositories are pending, failed, or have incomplete body indices, label
the counts as partial and show coverage, for example `5 of 30 · 2/3 repositories
loaded · Partial search`. The denominator includes only loaded inventories;
it must not imply that an unavailable repository contains zero skills. Existing
metadata remains searchable when some source text is unavailable or truncated.

Distinguish no added repositories, no selected repositories, preparation,
empty inventories, no matches in complete data, and no matches in partial data.
Show target errors by repository and index issues by source path, without
replacing successful repositories' results with a generic failure screen.

## Details, export, and Similar skills

Opening a result must carry its owning scan into the detail viewer. The source
selector includes that logical skill's mirror sources; manifest requests use
that owning scan's allowlist. Switching results while reads are pending ignores
responses for the previous result. Closing the dialog keeps the Filter scope.

Selecting a multi-repository result for Similar skills must pass the owning
scan and skill together. Its source repository label and comparison exclusion
must use that repository. Preserve the existing comparison algorithm and API.

Keep the focused scan as a separate state object. The top inventory statistics
and existing JSON export describe that focused repository and retain the native
single-repository format. Label that context clearly. Filter has its own scoped
count. Viewing a search result does not change which inventory is exported.
Exporting combined search results is outside this version.

## API and caching contract

Extend `GET /api/repositories` entries with `repository_id` and `available`,
while preserving existing `name` and `path` fields. Reload this list after a
successful manual scan. IDs are valid for the current server process.

Add `POST /api/repositories/<repository_id>/search-snapshot`:

```json
{ "refresh": false, "budget_ms": 120000 }
```

`refresh` defaults to false; `budget_ms` must be an integer from 1 through
120000. Requests accept catalogue IDs; this endpoint does not accept arbitrary
filesystem paths. Return:

```json
{
  "repository": { "repository_id": "opaque-id", "name": "MPS", "path": "/local/MPS" },
  "scan_id": "opaque-scan-id",
  "scanned_at": "2026-09-30T12:00:00Z",
  "inventory": { "repository": "/local/MPS", "sections": [], "warnings": [] },
  "index": { "sources": [] },
  "partial": false
}
```

Inventory is the existing native JSON. Index sources use the existing
`{path, content, truncated?, error?}` records. `partial` covers scanner warnings
and index omissions/read failures. An empty inventory can be a complete success.

Reuse a live scan/index for that canonical directory when refresh is false.
Include the current focused scan in that reuse. Coalesce concurrent preparation
of the same snapshot; use the shared worker for scans, indexing, and comparison
preparation. The browser prepares selected repositories sequentially, rather
than starting a native scan for each repository in parallel.

The browser retains each returned snapshot while searching and paging. Query,
category, clear, and pagination changes make no scan/index request. Re-selecting
a loaded repository reuses its snapshot. Refresh atomically replaces a
repository's snapshot only after successful preparation. On refresh failure,
keep its prior results with an explicit stale/error label.

Preserve the eight-session server limit and share the existing index cache,
instead of creating an unbounded second cache. A client snapshot can outlive
its server scan session. If manifest viewing returns expired-scan 404, show
`Refresh this repository to view the manifest`; refresh must validate that the
chosen skill still exists before reopening it. Do not substitute the focused scan.

Unknown catalogue IDs return 404; invalid request fields return 400; oversized
bodies/responses return 413; incompatible busy preparation returns 409; an
unavailable registered directory returns 410; failure before inventory creation
returns an actionable error, including 504 for timeout. The UI collects each
repository's outcome and preserves successful data from other repositories.
Server restart invalidates IDs; reload the catalogue and reselect by canonical
path, without automatically adding or scanning unknown paths.

## Bounds and safe reads

Preserve existing Host/Origin checks, no CORS, the 16 KiB request-body bound,
and read-only behavior. Discovery uses `bg scan`; source reads use the pinned
native `--read-manifest` primitive and scan allowlists. Retain rejection of
symlink swaps, traversal, non-regular files, and reads outside the repository.
Do not execute repository code, download checkouts, or add runtime dependencies.

| Resource | Limit |
| --- | --- |
| Repositories in one scope | 8 distinct realpaths |
| Stored scan/index sessions | 8, shared with the existing APIs |
| Native scan output | 16 MiB per repository |
| Manifest text | 1 MiB per source, 8 MiB per repository |
| Indexed sources | 512 per repository, including mirror sources |
| Aggregate indexed text in the browser's selected scope | 64 MiB |
| Serialized search-snapshot response | 64 MiB |
| One scope preparation/refresh | 120 seconds overall |
| One manifest subprocess | At most 10 seconds, also bounded by remaining job time |

The client passes the remaining scope budget to each preparation request and
stops submitting jobs once it expires. Server jobs enforce their budget across
scan and reads, kill their subprocess on expiry, and mark unread sources as
omitted if an inventory is already available. A shared job can continue only
within its original bounded budget. Browser timeouts alone are insufficient.
No limit may silently turn an incomplete body search into a complete result.
Cap normalized-text caches too; avoid repeatedly folding whole manifests on
every keystroke. Large scopes must keep typing, focus, and progress responsive.

## Required acceptance checks

Use small local fixtures and the real scanner/reader; no external checkouts or
model calls are needed for deterministic CI.

1. A body-only match in another selected repository is found; an unselected
   repository contributes no results. Current mode retains the existing Filter.
2. Selected and All modes include the intended repository set. A successful
   manual scan registers a new entry; failure does not. Restart behavior is clear.
3. Realpath aliases and repeated selection do not inflate scans or counts.
   Distinct repositories with equal names, relative paths, and texts stay separate.
4. A same-path fixture in two repositories opens the correct manifest and mirrors
   in each case. Similar skills receives the owning source scan; export keeps
   the focused native inventory. Delayed responses cannot overwrite new selections.
5. Mirror, conflict, product, and fixture cases retain their boundaries and counts.
   Category + query, empty query, clear/Escape, whitespace, Unicode, mixed case,
   partial-word matches, and literal HTML/regex queries work across scopes.
6. Repository grouping and pagination are stable; counts include all matching
   pages. Loading progress and incomplete counts reflect actual coverage.
7. Typing, clearing, category changes, and paging do not repeat discovery or reads.
   Cached selection and concurrent preparation reuse the same scan/index promise.
   Refresh observes changed files; failed refresh preserves labelled old results.
8. Missing directories, source read failures, truncation, expired scans, catalogue
   limits, selection limits, and deadlines remain explicit. One failed repository
   leaves successful repositories usable; no-result partial searches say so.
9. Unknown IDs, invalid inputs, untrusted Host/Origin, and deterministic symlink
   swaps remain rejected. Resource-limit tests exercise the actual boundaries.
10. Keyboard selection, detail viewing, 390px layout, and no horizontal overflow
    pass browser checks. Capture desktop/mobile screenshots of a multi-repo result.
11. The existing scan flow, single-repository Filter, Similar skills, manifest
    viewer, JSON export, and corner-case suites still pass.

## Implementation and delivery

Keep catalogue/cache preparation in a separate server module and reuse the
existing scanner and manifest-index helpers. Extend Filter's scope state and
result ownership without replacing the Similar skills implementation. Update
[web.md](web.md), README, and API/browser tests when the feature is implemented.

Implementation requires a fresh native build, strict Python suite, JavaScript
syntax checks, both existing browser suites plus the new acceptance scenarios,
CLI smoke checks, and `git diff --check`. Report counts and limitations for the
exact feature SHA; verify hosted CI for that SHA. After an authorized merge,
verify main CI, update and rebuild the serving checkout, restart its server,
and check HTTP and a real cross-repository search. Follow the current AGENTS.md
and scoped publication workflow. Writing this specification alone does not
implement the feature or require rebuilding/restarting the application.
