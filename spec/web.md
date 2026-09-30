# Local Skill Atlas Web Interface — Implementation Specification

## Purpose and architecture

Build a modern local web interface for the existing Kotlin/Native scanner.
The scanner remains the source of truth: the server invokes `bg scan <path>
--json` and renders that inventory. Do not reimplement discovery in JavaScript.
Use Node.js 24 built-in HTTP APIs and dependency-free HTML/CSS/JavaScript.
Playwright is permitted as a development-only dependency for browser tests;
it must not be required to run the server.
No cloud service, database, account, or external fonts/assets are required.

## Launch

`bash web/run.sh` starts the server on `http://127.0.0.1:4173`. Allow an optional
`PORT` environment variable. Bind only to loopback. Print the actual URL and
an actionable error if the binary is missing or the port is occupied. Do not
automatically open a browser. Relative repository paths resolve from the
project root. The CLI continues to work independently.

## User interface

Use an English-language, responsive Skill Atlas interface: a dark navy sidebar,
a light workspace, violet/teal accents, generous spacing, clear typography,
summary counters, and skill cards. Support narrow screens and keyboard use.

- A repository-path input and Scan button, with loading and error states.
- Quick choices for locally available MPS, Koog, Android, and Kotlin checkouts.
  Missing repositories must not be offered as working choices.
- Counters for logical skills, physical sources, mirrored skills, and conflicts.
- Text search over names, descriptions, and every source location.
- Category filters for all, development, test fixtures, and product resources.
- Skills grouped in the scanner's sections, with names, descriptions, paths,
  category badges, mirror counts, and visible conflict warnings.
- Selecting a skill opens a detail panel with all source locations and the
  chosen SKILL.md text. Render manifest text as escaped plain text, not HTML.
- Download the latest inventory as JSON. Surface scanner warnings separately.
- Empty repository and zero-search-results states must be distinct. A failed
  scan must not relabel a previous inventory as belonging to the failed path.

## Server API

- `GET /api/repositories`: added checkouts (opaque `repository_id`, name,
  canonical absolute path and `available`); presets plus successful manual scans.
- `POST /api/scan`: JSON `{ "path": "..." }`; on success return
  `{ "scan_id": "...", "inventory": <scanner JSON>, "repository": <catalogue entry>, "scanned_at": <ISO timestamp> }`.
- `POST /api/repositories/<repository_id>/search-snapshot`: JSON
  `{ "refresh": false, "budget_ms": 120000 }`; reuse or refresh a live scan
  and full-manifest index, returning repository, scan_id, scanned_at, inventory,
  index and partial coverage. See the multi-repository specification below.
- `GET /api/scans/<scan_id>/manifest?path=<relative-manifest-path>`: return
  JSON `{ "path": "...", "content": "..." }` for a source present in that scan.

Serve only explicitly listed static assets. Reject malformed input with useful
JSON errors and appropriate HTTP status codes. Never execute a shell or any
repository code. Bound body sizes, subprocess output, execution time, stored
scan sessions, and manifest reads. Validate Host and Origin to prevent other
sites using the local server. Do not enable CORS. Manifest requests must be
allowlisted against a scan's source paths and remain within that repository
after real-path resolution. Do not expose arbitrary file reads.

Containment must also hold when directories change between validation and read.
Use the scanner's internal bounded `--read-manifest` primitive: it pins directory
descriptors and opens every component with `O_NOFOLLOW`, including
the absolute repository ancestors. Do not substitute a later pathname open or
only protect the final file. Symlinked components are rejected even if they
point inside the repository. Read at most the configured limit plus one byte
to detect truncation; reject non-regular files without blocking. Both manifest
viewing and the full-text search index use this same reader. Add deterministic
tests that swap the leaf, skill directory, repository, and repository ancestor
to outside symlinks immediately after realpath validation. The single-purpose
native subprocess uses `fchdir` on each pinned descriptor before opening the
next component; this never changes the server's working directory.

## Testing and completion

Add deterministic HTTP integration tests that start the local server on a free
port and scan temporary fixture repositories with the real native binary.
Cover scan success and invalid input, classification/mirrors, manifest access,
unknown/traversing paths, untrusted origins, and static asset serving. Run them
with the existing strict test runner. Add Node.js setup to GitHub Actions.
Verify frontend JavaScript syntax and the complete local suite. Update README
and AGENTS.md, then follow the existing CI verification/repair loop for the
delivered revision. Report the local URL, test results, and hosted CI status.

## Filter and full-manifest search

The existing Search skills control lives in a panel titled **Filter1**, with an outlined
filter icon, compact accessible result buttons, a clear button, and a live
`matches of category-total` pill. The denominator counts logical skills in the
selected category before text filtering, so mirrors count once. Changing the
category intersects it with the query; clearing (button or Escape in the input)
keeps the category and returns focus to the input. Empty queries restore that
category. Empty sections disappear; an empty repository differs from no matches.

Search trims outer whitespace and performs literal, case-insensitive substring
matching across names, descriptions, every source location/manifest path, and
readable full manifest text. Unicode case folding preserves original text
positions; HTML and regex syntax are data. Names and contextual snippets use
text nodes and pale yellow `<mark>` elements. Snippets prefer the first match in
name, description, source bodies in scanner order, then paths, with ellipses
where surrounding text is omitted. Result buttons open the existing details;
source selection, classification, conflicts, and JSON export remain available.

`GET /api/scans/<scan_id>/search-index` returns
`{ "sources": [{ "path": "...", "content": "...", "truncated": false }] }`.
Only source paths from that scan are read, under the same repository containment
and Host/Origin checks as manifest viewing. Reads allocate at most 1 MiB per
source, 8 MiB total, and visit at most 512 sources. Truncated sources are flagged;
omitted or unreadable sources carry `error` and empty content. All source statuses
are returned, including mirror sources. The index promise is cached for the
scan lifetime (at most eight stored scans); simultaneous callers share it.
Index text reflects the first request; rescan to refresh changed manifests.
The browser replaces its index on each successful scan and fetches once per
scan, never per keystroke. Loading, partial limits/read errors, expired scans,
and index request failures are explicit; metadata search remains usable while
body indexing is unavailable. Partial search counts describe indexed matches,
not a claim that all repository text was searchable.

Browser acceptance includes deep body matches such as `WhenConcreteStatement`
for `test`, mixed case and partial words, mirror paths, Unicode, literal HTML and
regex characters, category counts, clear/Escape and Enter on results, index
loading/partial/failure, details/export preservation, and 390px overflow checks.
Desktop/mobile review screenshots are captured by the browser suite.

### Search across added repositories

Implemented contract: [multi-repository-filter.md](multi-repository-filter.md).
Filter supports Current repository, Selected repositories and All added
repositories. The catalogue is process-local, deduplicated by realpath, and
limited to 64 entries. Search scopes contain at most eight repositories.
Results group by repository/section and retain owning scan identities for
details and Similar skills. Focused statistics/export remain single-repository.
Pages contain at most 100 rows; the counts include all pages and label partial
coverage. Errors during Refresh retain explicitly stale previous results.

The scan, search-index/snapshot and comparison preparation APIs share one
worker and eight server sessions. Same-repository snapshot requests coalesce;
incompatible concurrent work receives 409. Indices/snapshots enforce the
remaining 120-second job budget in each native subprocess. Snapshots have a
64 MiB serialized response bound. The browser retains at most eight search
snapshots plus its focused snapshot, and folds source text once per snapshot
(at most 8 Mi UTF-16 units per index). Changing query, category or page does
not submit any native work. Explicit refresh regenerates selected indices.
Expired detail sessions offer a refresh action and validate the skill again.

## Similar skills

The Similar skills panel sits beside Filter on wide screens and stacks on narrow
screens. Selecting a detail result also selects it for comparison; the selected
skill dropdown can replace it independently. Scan success resets selection and
results; failed scans preserve the current inventory. Comparison settings accept
one to eight local repository paths, one per line. Reference checkout presets
prefill these paths. By default only matching categories are compared. An explicit
unchecked option includes other roles. Source-repository candidates are always
excluded, including realpath aliases; repeated target aliases are scanned once.

`POST /api/similarity` accepts `{scan_id, manifest_path, targets: [path],
include_roles?: boolean}`. The selected path must belong to a logical skill in
that live scan session (an additional mirror path selects the canonical source).
An expired scan returns 404, an unallowlisted source 403, invalid input 400,
an oversized source 413, and concurrent scan/comparison 409. Host/Origin/body
validation is shared with other APIs. Discovery, classification, conflicts, and
mirror grouping come from `bg scan`; no JavaScript filesystem discovery exists.
Full canonical manifests use the same native pinned bounded reader as Filter.
Unreadable selected text fails the request. Target scan/read failures produce
explicit warnings and `partial: true`; truncated/omitted targets receive no score.

Responses contain `{method, results, warnings, partial}`. Each result has
`repository` (realpath), `repository_name` (directory basename), the scanner's
`skill` record with its role/conflict/sources, canonical `content`, and numeric
`score` on 0–100. Results sort by descending score, then canonical absolute repo
path and canonical relative manifest path in code-unit lexical order. Paths,
description, sources, and escaped plain manifest text are accessible through
expandable details, without requiring hover. Progress bars use numeric scores;
percentages show one decimal. Empty, loading, partial, and expired/error states
are explicit. This measures text overlap, not the probability of equivalent
functionality. There is no AI, embedding, network inference, or runtime dependency.

### Deterministic scoring and limits

The corpus is the selected manifest plus every successfully read eligible logical
candidate (mirrors contribute once). Normalize complete manifest text with Unicode
NFKC and JavaScript Unicode lowercase. Tokens are maximal sequences of Unicode
letters or numbers (`[\p{L}\p{N}]+`); punctuation and whitespace separate tokens.
Do not strip front matter, headings, code, or body text. No stemming/stopwords.
For term count `c`, TF is `1 + ln(c)`. For document frequency `df` and corpus
size `N`, IDF is `1 + ln((N + 1)/(df + 1))`. Multiply TF by IDF and compute
cosine with L2 norms. Multiply by 100 and clamp to [0,100]; floating point values
within 1e-10 of 100 are snapped to 100. Zero vectors score 0, including two empty
texts. Identical nonempty vectors score 100. Candidate selection changes IDF;
scores are relative to this comparison corpus, not global ratings.

Allow at most eight input repositories, 512 visited eligible candidates, 1 MiB
per manifest, and 8 MiB total read text including the selected source. Each scan
has at most 16 MiB output. Target operations share a 120-second deadline; native
reads have a 10-second timeout and the source read precedes that deadline. One
comparison may run at a time and scans cannot overlap it. Each full manifest
is read once for that comparison; comparison results are not stored server-side.
Source and target read limits yield explicit omissions rather than prefix scores.
The existing Filter implementation and its scan-lifetime index stay independent.

Tests include formula/Unicode/full-body scoring, empty/identical/disjoint/partial
texts, stable corpus order/ties, canonical mirror aliases, roles/product boundaries,
realpath aliases, source allowlists/expiry/symlinks, missing target sources,
invalid paths, count/byte limits, and API/keyboard/browser/mobile states.
