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

- `GET /api/repositories`: available reference checkouts (name and absolute path).
- `POST /api/scan`: JSON `{ "path": "..." }`; on success return
  `{ "scan_id": "...", "inventory": <scanner JSON> }`.
- `GET /api/scans/<scan_id>/manifest?path=<relative-manifest-path>`: return
  JSON `{ "path": "...", "content": "..." }` for a source present in that scan.

Serve only explicitly listed static assets. Reject malformed input with useful
JSON errors and appropriate HTTP status codes. Never execute a shell or any
repository code. Bound body sizes, subprocess output, execution time, stored
scan sessions, and manifest reads. Validate Host and Origin to prevent other
sites using the local server. Do not enable CORS. Manifest requests must be
allowlisted against a scan's source paths and remain within that repository
after real-path resolution. Do not expose arbitrary file reads.

## Testing and completion

Add deterministic HTTP integration tests that start the local server on a free
port and scan temporary fixture repositories with the real native binary.
Cover scan success and invalid input, classification/mirrors, manifest access,
unknown/traversing paths, untrusted origins, and static asset serving. Run them
with the existing strict test runner. Add Node.js setup to GitHub Actions.
Verify frontend JavaScript syntax and the complete local suite. Update README
and AGENTS.md, then follow the existing CI verification/repair loop for the
delivered revision. Report the local URL, test results, and hosted CI status.
