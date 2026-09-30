# Filter and Similar Skills — UI Specification

## Visual reference

Use [the supplied reference](assets/two-sandbox-ui-reference.png) as the visual
target for the two features in `two-agent-sandboxes-plan.md`.

The two large cards are application panels, not a slide to render as a bitmap.
Build real, accessible HTML controls. Preserve the site's existing repository
scan flow and navigation. Render panels side by side on wide screens and stack
them on narrow screens. Each panel must also work independently in its assigned
sandbox preview before both PRs are merged.

## Shared visual language

- Warm off-white background, white cards, thin neutral borders, generous
  padding, rounded corners, and subtle shadows.
- Dark near-black titles, muted grey metadata, indigo accents.
- Panel titles: `Filter` and `Similar skills`, each next to a simple outlined
  icon in a pale indigo rounded square. Use inline SVG, not emoji or screenshots.
- Monospace skill names and repository labels, readable sans-serif controls.
- Inner result areas with a very light neutral background and rounded border.
- Visible keyboard focus, sufficient contrast, and reduced-motion support.
- Workspace labels may be `atlas-filter` and `atlas-similar` in sandbox previews.
  They are context labels, not fixed host filesystem paths.
- Do not reproduce the slide heading `One task per sandbox` as a required
  product heading. It describes the workflow, not a scanning feature.

## Panel 1: Filter

Place a large search field at the top of the inner result area. Show a search
icon, the current query, a clear action, and an indigo count pill such as
`5 of 41` on the right. The denominator is the number of logical skills in the
current category scope before text filtering; the numerator is the matches.
Mirrored manifests must not inflate either count.

Below the input, display compact rows with the skill name and a contextual
snippet containing the match. Highlight all query occurrences in visible names
and snippets with a pale yellow mark, including partial word matches and mixed
case (`test`, `tests`, `Test`, and `teSt`). Preserve the original case.

Search the full readable `SKILL.md`, name, description, and every source path.
The example matches `WhenConcreteStatement` even if that text is beyond the
short inventory description. A name-only or short-description-only match is
therefore insufficient. Obtain manifest text through validated server APIs,
cache a bounded search index per scan, and avoid fetching all manifests on every
keystroke. Expose index loading and any unreadable/truncated sources explicitly.

Choose a snippet around the first match, preferring name then description then
body then path. Include ellipses when surrounding text is omitted. Use DOM
text nodes and `<mark>`; treat both manifest text and the search query as data,
including HTML and regex metacharacters. Never interpolate them into HTML.

Rows are keyboard-accessible and open the existing skill details. Empty query,
clear action, category intersection, zero results, Unicode, and mobile layouts
must behave as defined in the sandbox plan.

## Panel 2: Similar skills

At the top, show the selected skill in a bordered selection field: document
icon, skill name, and repository identifier (for example `JetBrains/MPS`).
Support selecting/replacing this skill from the inventory. Repository choices
and Compare can be placed in an expandable settings area to keep the main
panel as compact as the reference.

Use a small `SIMILAR` label above the ranked results. Each row shows:

- Skill name on the first line, repository identifier below it.
- An indigo horizontal progress bar over a pale track.
- A clearly aligned percentage on the right (e.g. `62%`).
- The repository path and relative skill path via accessible details/expansion,
  with a working action to view the manifest. Do not expose paths only on hover.

The bar width and printed percentage come from the actual similarity score.
The screenshot's 62%, 12%, and 10% are illustrative; never hardcode them as data.
Label the method `Text similarity · TF-IDF cosine` and explain that it measures
text overlap, not a probability of equivalent functionality.

Show loading, empty results, partial target failures, and expired source scans.
Render categories, mirror sources, and conflict states without losing the
compact layout. Long names and paths must not cause horizontal page overflow.

The reference includes a result from the source repository. The product request
is cross-repository comparison, so default to other repositories. A same-repo
comparison may be added as an explicit unchecked option; always exclude the
selected source skill itself. Realpath aliases do not count as other repos.

## Required browser acceptance checks

- Filter `test` matches a fixture whose body contains `WhenConcreteStatement`
  but whose name and short description contain no `test`.
- Matching names/snippets use safe `<mark>` elements; query `<script>` or `.*`
  remains literal data and never executes or behaves as a regular expression.
- Count changes live, clears correctly, and respects category scope.
- Similarity results show true scores, bar widths, repo identity, and paths;
  results stay stable for the same corpus.
- Both panels work with keyboard and at a 390px viewport without horizontal
  overflow; capture desktop/mobile screenshots for review.
- The two separate PRs and their combined integration preserve the existing
  scan, manifest viewer, JSON export, and corner-case coverage.
