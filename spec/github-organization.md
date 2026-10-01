# Fast GitHub organization scan

Issue: https://github.com/Mefodys/bg/issues/11

## Contract

Node.js 24 coordinates GitHub REST requests and the existing native scanner.
Run `node web/github-cli.mjs scan-org JetBrains [--json] [--refresh]
[--concurrency 1..8] [--no-archived] [--no-forks]`; accept `github.com/JetBrains`
and its HTTPS URL as equivalent. The native `bg scan` remains local-only.
The web interface provides the same options, progress, cancellation, grouped
results, text search, manifest details, and a JSON download.

Only api.github.com HTTPS is used in production, with redirects rejected.
Read credentials from BG_GITHUB_TOKEN (fall back to GH_TOKEN); never accept
tokens from the browser, URLs, or command arguments. The token is only sent to
the configured GitHub API. Public unauthenticated access is supported, subject
to GitHub's lower rate limit. Include archived/fork repositories by default;
empty repositories are successful empty inventories. Scan default branches only,
pinning every tree/blob read to the resolved immutable commit/tree SHA.

## Algorithm and completeness

Paginate organization repositories, then fetch each default-branch head and
recursive Git tree. If truncated, discard the recursive result and traverse
nonrecursive subtrees completely. Do not use capped/index-dependent code search
as proof of complete discovery. Native `--select-manifests` filters regular Git
blob paths with the SAME exclusion set used by `bg scan`. Only selected blobs
are downloaded into a fresh owned sparse temporary directory, then `bg scan`
performs metadata parsing, classification, mirror merging and conflicts.
Never clone histories, download unrelated blobs or run repository code/hooks.
Git submodules and symlinks are not followed. Newline/tab paths are JSON-encoded
in the selector protocol; path traversal and NUL paths fail that repository.

Use a bounded worker pool (default 4) and shared request pacing. Rate-limit
responses honor Retry-After or reset times plus jitter, serialize queued requests
after throttling, and reduce concurrency. Retry only transient/rate-limit failures,
at most three retries. A deadline interrupts waits, requests and native children.
Repository failures continue independently and make the result explicitly partial.
Enumeration failure preserves completed data and also marks partial coverage.

Cache immutable inventories and manifest text by repository ID + commit SHA in
a bounded process cache. Coalesce identical Git blob requests by content SHA
within a scan, with a separate 64 MiB cap; refresh clears that blob cache.
Repeat scans still resolve the current default branch
head, skipping tree/blob/native work for unchanged commits. Refresh bypasses it;
CLI supports a versioned local cache directory for reuse across invocations.
Never return old data as a fresh scan after failure. Rename/transfer updates
current repository labels; deleted/inaccessible repositories are not restored
from cache. Changed branch heads use new keys. Private cache content needs owner
permissions; document removal and do not include it in Git or demo artifacts.

## Limits and APIs

One organization job at a time, up to 10,000 repositories, 250,000 tree entries
per repository, 512 manifests/8 MiB per repository, 1 MiB per manifest, 64 MiB
retained results, 32 MiB per API response, and a 10 minute whole-job deadline.
Every limit reports omissions and partial coverage. Catalogue/session limits for
local scans do not cap remote enumeration. Temporary trees are removed in finally.
Remote results carry full_name, repo URL, commit SHA, inventory, content and
warnings; never expose temporary host paths. Remote results remain separate from
local scan sessions and Similar skills until explicitly supported.

POST /api/github/scans starts a job. GET /api/github/scans/:id returns bounded
progress/results, DELETE cancels it. Retain at most two jobs. Host/Origin, request
size and static-asset restrictions apply to all endpoints. CLI progress streams
to stderr while --json writes one final document to stdout; interrupted/partial
scans return a nonzero exit code and keep their usable partial results.

## Tests, risks and evidence

Deterministic fake GitHub transport/server tests use the rebuilt native binary:
pagination >100 repos; all four existing scanner corner cases; symlink/submodule
and excluded paths; Unicode/newline paths; truncated tree fallback; empty repo;
default-branch changes; cache hits, refresh and rename; archived/fork options;
401/403/404/429/5xx, rate-limit wait/retry; cancellation and deadline; oversized
trees/blobs; malformed input/traversal; token redaction and no redirects/SSRF.
HTTP tests exercise job lifecycle and origin protections. Browser tests exercise
real native discovery with only the remote transport replaced by labelled seeded
API fixtures, plus desktop/mobile, partial warnings, details/search/export/cancel.

Performance report records calls, bytes, elapsed time, peak process memory and
coverage for small/large synthetic organizations. Compare recursive-tree sparse
hydration with a complete-content reference and an unchanged warm scan. Explain
why code search cannot be the complete algorithm and document that live GitHub
latency/rate limits dominate real timing; do not promise an absolute fastest
algorithm from a synthetic benchmark. Add an opt-in live benchmark command.

Record captioned desktop/mobile videos/frames with seeded remote fixtures and the
real scanner. Upload via CI artifacts and link near the top of a separate PR
closing #11. Verify strict/browser checks and exact-head build-and-test plus
visual-regression. No merge is authorized by this specification.
