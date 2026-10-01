# Organization scanner performance evidence

Measured on 2026-10-01 with Node 24.13.0, Kotlin/Native 2.4.20, Ubuntu 24.04 x64.
Run `node tests/github-benchmark.mjs` after a fresh `bash build.sh` to reproduce
the synthetic comparison. Every repository has 106 regular files: six manifests
(five logical skills including a mirror) and 100 unrelated 17.6 KiB source files.
Both approaches use four workers, the same native scanner, and seeded fake GitHub
data with 1 ms request latency. The full-content reference omits head/tree setup,
which favors it. It downloads all fixture blobs before native scanning; this is
a reference workload, not a realistic optimized archive-download benchmark.

| Repositories | Strategy | API/blob calls | Response bytes | Wall time | Peak process RSS |
| --- | --- | ---: | ---: | ---: | ---: |
| 3 | Sparse manifests, cold | 25 | 43,433 | 73 ms | 67.0 MB |
| 3 | Immutable cache, warm | 4 | 638 | 2 ms | 67.1 MB |
| 3 | Full-content reference | 318 blob calls | 7,393,581 | 246 ms | 81.5 MB |
| 30 | Sparse manifests, cold | 241 | 434,380 | 374 ms | 89.9 MB |
| 30 | Immutable cache, warm | 31 | 6,430 | 15 ms | 90.4 MB |
| 30 | Full-content reference | 3,180 blob calls | 73,935,810 | 1,870 ms | 102.6 MB |

All sparse cold/warm scans reported complete coverage.

After adding content-addressed blob coalescing, the same workload measured:

| Repositories | Cold calls / bytes / time | Warm calls / bytes / time | Coalesced blob reads |
| --- | --- | --- | ---: |
| 3 | 11 / 40,337 / 63 ms | 4 / 638 / 3 ms | 14 |
| 30 | 65 / 395,455 / 366 ms | 31 / 6,430 / 16 ms | 176 |

Identical fixtures deliberately model mirrors/forks; unrelated real repositories
will share fewer blobs. Full-content reference measured 244 / 1,874 ms in that
repeat. Peak RSS was 67.3 / 82.8 MB for the sparse runs and 80.9 / 100.9 MB for
the references. Timing is illustrative; correctness assertions remain independent.

Exact inventory equivalence
with materialized local fixtures is independently asserted in tests/github.mjs.
RSS includes the shared benchmark process, cached results and allocator history;
it is not per-repository incremental memory. These numbers are observations, not
CI timing thresholds or a universal fastest-algorithm claim.

## Strategy decision and risks

- **GitHub code search** may locate candidates quickly, but indexing/result caps
  cannot prove complete default-branch coverage. It is not the completeness gate.
- **Recursive Git trees plus sparse blobs** avoid all unrelated content/history.
  GitHub documents a recursive cap of 100,000 entries / 7 MB. A truncated answer
  triggers full nonrecursive subtree traversal; failure/limits mark partial coverage.
- **Partial/shallow clone** still requires Git negotiation/tree traversal and
  filtered blob reads; it introduces a Git runtime and potential configuration/hooks
  surface. No measured evidence here shows it improves sparse-manifest workloads.
- **Archive download/full checkout** has fewer network round trips and can win on
  tiny repositories or repositories containing many manifests, but transfers unrelated
  data and requires safe archive extraction. The reference above demonstrates the
  bytes saved on sparse data; it does not establish archive wall-clock performance.

Select the tree/blob approach for bounded sparse discovery and exact native
semantics. Identical blobs are now coalesced within a scan, including mirrors and
forks; the table above records pre-coalescing measurements. Remaining optimization
opportunities include GraphQL batching of head/tree metadata. Concurrency
is configurable up to eight; after throttling, requests are paced at most one per
second and rate-limit/reset waits interrupt on cancellation/deadline. Authenticated
visibility depends on token rights; public access uses GitHub's lower quota.

For opt-in real organization measurements, run
`node web/github-cli.mjs scan-org JetBrains --json --cache-dir <private-cache>`
twice and inspect metrics.requests/bytes/cache_hits/native_scans/elapsed_ms/
peak_rss_bytes. Do not put a token on the command line or check private cache data
into Git. Real organization performance is affected by latency, tree sizes and
GitHub rate limits; deterministic CI does not contact GitHub.

Primary API contract inspected via the official GitHub REST OpenAPI description:
https://github.com/github/rest-api-description/blob/main/descriptions/api.github.com/api.github.com.json

## Live transport smoke check

The actual GitHub API was read for `Mefodys/bg` at
`b911ff2b7392d8b69c9642048f5bcef9821a6265`: 8 requests, 54,263 response bytes,
one native scan, five logical skills, and complete coverage. This small repository
check used the pre-coalescing implementation and `NODE_USE_ENV_PROXY=1` in the
restricted host. It verifies transport/native integration, not large-organization
performance; no repository code was executed or repository files modified.
