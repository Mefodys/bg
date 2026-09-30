Implement Similar skills in this isolated checkout on agent/skill-similarity.
Read AGENTS.md, spec/parallel-forms-ui.md, and section 6 of
spec/two-agent-sandboxes-plan.md. Use the supplied UI reference image.

Add a selected-skill form and cross-repository comparison through the native
scanner. Use deterministic local TF-IDF cosine similarity of full manifests;
no AI/embeddings/external inference for the product's scores. Show real
percentages, progress bars, repo identity/path, skill name/path, and manifest
details. Default to other realpath-distinct repositories and matching roles.
Preserve mirrors/product/fixture boundaries, errors and resource bounds.
Keep feature logic in separate modules; do not replace the Filter implementation.

No new runtime dependencies or external services. Run bash build.sh, python3
tests/run.py, node syntax checks, npm run test:web, and git diff --check.
Add meaningful similarity API/browser tests, including identical/empty/partial
texts, stable ties, aliases, allowlists and invalid paths. Update specifications.

You are authorized to modify this checkout and commit only to the assigned
branch. Do not push, merge, or try to obtain credentials. The trusted host
publisher creates the PR and provides CI failure logs for follow-up repairs.
Write /results/pr-body.md, /results/final.md, and commit all intended changes.
Include local verification details and explicitly state that hosted CI is
pending publication. Do not claim CI passed before it runs for your exact SHA.
