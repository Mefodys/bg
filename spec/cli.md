# Repository Skills Scanner — CLI Specification

## 1. Purpose

The optional Node.js organization coordinator and internal native Git-path
selector are specified in [github-organization.md](github-organization.md).
`node web/github-cli.mjs scan-org <organization> --json` returns an aggregate
organization inventory. `bg --select-manifests` reads bounded lines of Git mode,
TAB, JSON-escaped repository-relative path on stdin, and emits JSON-escaped
regular SKILL.md paths after applying the same native exclusion set. Invalid
records/paths or limits fail with exit 2. This internal transport does not alter
the local `bg scan` JSON or read-only behavior.

Build a command-line tool that scans the entire repository tree for agent skills
and prints a human-readable, sectioned inventory of every skill it finds. The
tool is intended to be run by humans and automation, including coding agents.

A **skill** is a directory containing a `SKILL.md` manifest. A skill may also
include supporting files such as scripts, templates, assets, and reference
documents. The scanner must discover the manifests and report metadata that
allows a caller to locate and use every skill.

## 2. Command interface

Implement the tool in Kotlin and compile it with Kotlin/Native to a standalone
native executable named `bg`. It must run without Python or a JVM. The initial
supported platform is macOS ARM64; provide a reproducible build script.

The executable name is configurable by the implementer. In this document it is
represented by `<toolname>`.

The required command is:

```text
<toolname> scan <repository-path> [--json]
```

Examples:

```bash
<toolname> scan .
<toolname> scan /absolute/path/to/repository
```

`<repository-path>` is required and can be relative or absolute. Relative paths
are resolved from the current working directory. The command must not modify
the target repository.

## 3. Discovery rules

1. Verify that the supplied path exists and is a directory.
2. Recursively walk the complete directory tree rooted at the repository path,
   subject only to the explicit exclusions below. Do not restrict discovery to a
   conventional directory such as `skills/`.
3. A directory is a skill directory when it directly contains a regular file
   named `SKILL.md` (case-sensitive).
4. Each `SKILL.md` represents one discovered source. Equivalent development
   mirrors may be combined into one logical skill as described below.
5. Do not follow symbolic links to directories. A symbolic link to a file named
   `SKILL.md` is not a skill manifest.
6. Skip these directories anywhere in the tree:
   - `.git`
   - `node_modules`
   - `vendor`
   - `.venv`
   - `venv`
   - `dist`
   - `build`
   - `target`
   - `.idea`
   - `.vscode`
7. Do not apply `.gitignore` rules in the first version. The fixed exclusions
   above are the complete exclusion policy.
8. Continue scanning after a per-file read error or an inaccessible directory;
   record the problem as a warning instead of failing the entire scan.

## 4. Manifest parsing

Read every discovered `SKILL.md` as UTF-8 text. Extract metadata as follows:

- `name`: prefer the literal `name` field in an opening `---` front-matter
  block. Otherwise use the first Markdown level-1 heading (`# Heading`). Remove the leading
  `#` and surrounding whitespace. If no level-1 heading exists, use the skill
  directory's base name.
- `description`: prefer the literal `description` front-matter field. Otherwise
  use the first non-empty paragraph after the level-1 heading. Stop
  at the next heading, list, fenced code block, or blank-line-separated block.
  If it cannot be determined, return `null`. Normalize whitespace and limit the
  result to 240 characters, including a trailing `...` when truncated.
- `manifest_path`: the path to `SKILL.md`, relative to the repository root,
  normalized with forward slashes.
- `skill_path`: the manifest's parent directory, relative to the repository
  root, normalized with forward slashes. Use `.` if the manifest is at the
  repository root.

The parser must be deliberately lightweight: it must not execute code, evaluate
front matter as executable data, or require a specific Markdown library. Support
plain, quoted, and indented multiline literal metadata values; ignore tags,
anchors, aliases, and structured values. Ignore headings inside fenced code
blocks or front matter. Invalid or unusual
Markdown must still yield a skill record using the directory-name fallback.

## 5. Output contract

### Classification and duplicate handling

Every entry has `category`: `development`, `test-fixture`, or `product`.
Classify as a test fixture if a complete directory component is `test`, `tests`,
`testData`, `test-data`, `testdata`, `integration-tests`, or `testFixtures`, or
there is a `src/test`, `src/testFixtures`, or `src/<sourceSet>Test` pair with an
alphanumeric/hyphen/underscore source-set prefix. This rule has highest priority.
Otherwise classify the explicit MPS resource prefix
`plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills` as `product`.
All other locations are `development`; no directory allowlist applies.

Combine only corresponding `.agents/skills/<path>` and `.claude/skills/<path>`
development mirrors with identical names and full manifest text after CRLF/CR
normalization to LF. Prefer `.agents` as the canonical source. Do not combine
unreadable manifests, unrelated directories, or different roles. Each entry
contains `sources`, a list of `{location, manifest_path}` objects with the
canonical source first. If different readable manifests share a name and role,
retain them separately with `conflict: true`; otherwise use `false`.

Development sections retain their top-level folder IDs. Test fixtures and
product skills use reserved section IDs `@test-fixtures` and `@product`, with
display names `Test fixtures` and `Product skills`. Sort by section ID and then
canonical manifest path. These section IDs are grouping keys, not filesystem
paths.

### Display and JSON

By default, write a human-readable list to stdout: repository path, total skill
and section counts, then a heading for each section and numbered skills. Each
skill shows its name, a labeled repository-relative path, and a short description
wrapped at word boundaries to 84 characters plus four spaces of indentation.
Use `No description available.` when no description exists. Print
`No skills found.` for an empty scan and a separate `Warnings:` block when
warnings exist. In an interactive terminal, use colored headings and names,
aligned `SKILL.md` hyperlinks (OSC 8 file URLs), and one-line description previews
truncated to the terminal width. Show each skill's location below its description.
Detect terminal width, defaulting to 100 columns. Redirected output must omit
all ANSI sequences and hyperlinks. Honor `NO_COLOR` for colors. JSON output
must never contain terminal formatting.

With `--json` after the repository path, write one JSON document to standard
output and nothing else on a successful scan. Use UTF-8 and terminate either
output format with a newline. Paths in JSON use
forward slashes on every platform. Return skills as a list grouped into
sections. A section corresponds to the first path component of `skill_path`:
for example, `skills/review` belongs to the `skills` section and
`tools/formatting/kotlin` belongs to the `tools` section. A skill at the
repository root belongs to the `.` section. Sort sections by `path` ascending,
sort skills in each section by `manifest_path` ascending, and sort `warnings`
lexicographically.

Successful JSON output schema (`--json`):

```json
{
  "repository": "/absolute/path/to/repository",
  "sections": [
    {
      "name": "skills",
      "path": "skills",
      "skills": [
        {
          "name": "Example skill",
          "description": "A short description of the skill.",
          "location": "skills/example",
          "manifest_path": "skills/example/SKILL.md",
          "category": "development",
          "conflict": false,
          "sources": [
            {"location": "skills/example", "manifest_path": "skills/example/SKILL.md"}
          ]
        }
      ]
    }
  ],
  "warnings": []
}
```

Requirements:

- `repository` is the normalized absolute path actually scanned.
- `sections` is always present, including when no skills are found.
- Each section has a display `name`, a grouping ID in `path`, and a `skills`
  list. For development skills the ID is the top-level repository-relative
  directory; for other roles it is the reserved ID described above.
- Every skill record includes `name`, `location`, and `description`; these are
  the required fields consumers use to display a skill list. `location` is the
  repository-relative skill directory. `manifest_path` is retained so callers
  can open the manifest directly.
- `description` is a string or `null`.
- `warnings` is always present. Each warning is a concise string containing the
  affected relative path and the reason.
- A repository with no skill manifests is a successful scan and returns exit
  code `0` with an empty `sections` array.

## 6. Errors and exit codes

Diagnostic messages go to standard error. Standard output must remain empty
when command validation fails.

| Exit code | Meaning |
| --- | --- |
| `0` | Scan completed; warnings may be present. |
| `2` | Invalid invocation, missing argument, or unsupported command. |
| `3` | Repository path does not exist or is not a directory. |
| `4` | An unexpected fatal runtime error prevented scanning. |

For invalid invocation, print a short error followed by:

```text
Usage: <toolname> scan <repository-path>
```

## 7. Help and version

Support these additional commands:

```text
<toolname> --help
<toolname> --version
```

`--help` prints usage, a one-sentence description, and the available commands,
then exits `0`. `--version` prints a semantic version string (for example,
`<toolname> 0.1.0`) and exits `0`.

## 8. Acceptance criteria

The implementation is complete when all of the following are true:

1. `<toolname> scan <path>` finds every eligible `SKILL.md` recursively.
2. It excludes manifests under every directory listed in the discovery rules.
3. It does not traverse directory symlinks.
4. It produces a readable sectioned list by default and valid, deterministic
   JSON matching the output contract with `--json`.
5. It returns every discovered skill in a sectioned list, with its name,
   repository-relative location, and short description.
6. It succeeds with an empty `sections` list when no skills exist.
7. It handles a missing heading or malformed Markdown without crashing.
8. It reports unreadable entries as warnings and scans all remaining entries.
9. It uses the specified exit codes and keeps diagnostics separate from JSON.
10. Automated tests cover normal discovery, nested skills, exclusions, no skills,
   invalid paths, malformed manifests, and deterministic ordering.

## 9. Non-goals

- Executing skill scripts or any repository code.
- Installing dependencies or changing files in the scanned repository.
- Parsing `.gitignore`.
- Searching outside the supplied repository root.
- Validating the semantics of a skill beyond locating and lightly describing its
  `SKILL.md` manifest.

## 10. Internal bounded manifest reader

The local web server uses `bg --read-manifest <canonical-absolute-repository>
<relative-SKILL.md-path> <byte-limit>`. This internal command is not a discovery
API or a substitute for the server's scan-session allowlist. Existing public
scan/help/version output remains unchanged.

Accept a limit from 0 to 1 MiB. Write at most limit + 1 raw bytes to stdout,
without adding a newline; the extra byte detects truncation. Reject absolute,
empty, dot, or parent-traversing relative components and non-SKILL.md leaves.
Open every absolute-root and relative component using descriptor-relative
`fchdir` on pinned descriptors and `open` with `O_NOFOLLOW`, with `O_DIRECTORY`
for directories. Working-directory changes are confined to this subprocess.
Never follow
symlinks, including in the repository's ancestors. Check the opened leaf with
`fstat` and only read regular files. Do not execute repository code or modify
files. On failure, keep stdout empty and emit a concise stderr diagnostic.
Internal exit codes: 0 success, 2 invalid arguments, 3 symlink/containment
rejection, 4 unavailable/non-regular/read failure. This mode requires no new
runtime dependency and must work on the same native targets as scanning.
