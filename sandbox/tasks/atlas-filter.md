Implement the Filter feature in this isolated checkout on agent/skill-filter.
Read AGENTS.md, spec/parallel-forms-ui.md, and section 5 of
spec/two-agent-sandboxes-plan.md. Use the supplied UI reference image.

Improve the existing search instead of adding a duplicate input. Search the
full readable SKILL.md as well as name/description/source paths. Add safe yellow
highlights, contextual snippets, a count pill, clear action, category
intersection, and keyboard/mobile behavior. Cache a bounded index through an
allowlisted server API. Keep similarity implementation out of this PR.
Preserve scan, details, export, classification and mirror handling.

No new runtime dependencies or external services. Dependencies needed for tests
are installed already. Run bash build.sh, python3 tests/run.py, node syntax
checks, npm run test:web, and git diff --check. Do not weaken existing tests.
Add meaningful regression/browser checks and update the feature specification.

You are authorized to modify this checkout and commit only to the assigned
branch. Do not push, merge, or try to obtain credentials. The trusted host
publisher creates the PR and provides CI failure logs for follow-up repairs.
Write /results/pr-body.md, /results/final.md, and commit all intended changes.
Include local verification details and explicitly state that hosted CI is
pending publication. Do not claim CI passed before it runs for your exact SHA.
