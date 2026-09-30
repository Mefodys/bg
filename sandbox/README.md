# Skill Atlas agent sandboxes

Two independent Linux agent containers use separate branches and volumes.
Two small trusted gateway services hold the upstream API key; workspaces receive
only their own bounded session token. Agents have no direct Internet egress,
host credentials, Docker socket, or automatic permission to push/merge.

## Optional sbx launcher: Codex through JetBrains Central

`sbx-codex.sh` adapts the supplied Claude/Central example for **Codex only**.
It uses `/wire/<token>/codex/openai/v1`, passes the token by environment-variable
name (not literal argv), and runs `codex exec --sandbox workspace-write`.
It generates an isolated user-level Responses provider configuration in each
task's ignored `CODEX_HOME`; it does not rely on `OPENAI_BASE_URL`, which the
tested Codex 0.159.2 binary ignored. Only that per-task config/session directory
is additionally mounted, never the host's personal `~/.codex`.
The bare `exec` command replaces sbx's default approval-bypass startup flags.
It detects the current model from the host Codex configuration; override it
with `CENTRAL_CODEX_MODEL` if needed. It never copies `auth.json`.

Docker Desktop does not install the separate `sbx` CLI. On macOS:

```bash
brew trust docker/tap
brew install docker/tap/sbx
sbx login
```

`sbx login` opens Docker's login flow: run it yourself. Once the base changes
are committed, run these in separate terminals:

```bash
bash sandbox/sbx-codex.sh atlas-filter
bash sandbox/sbx-codex.sh atlas-similar
```

To share a locally committed infrastructure base without pushing `main`, set
`ATLAS_BASE_REF=agent/sandbox-base` for both launches. Each feature PR will
include that same preparatory commit until it becomes part of `main` through
an explicitly approved merge. Never merge automatically.

Each task has a host worktree under ignored `sandbox/.runtime/worktrees`, then
`--clone` creates independent Git metadata inside its own sandbox. Do not add
the shared host `.git` as a second writable workspace. The Central session
token is available inside this alternative sandbox; it is not the upstream
account credential, but it still authorizes model use. Never log it or enable
shell tracing. Both jobs share the Central account quota. GitHub and YouTrack
tokens are not passed by this launcher; use the trusted host for publication.

This is an alternative to the Compose lifecycle below, not a drop-in template
for its preinstalled Linux toolchain, gateway budgets, or bundle exporter.
The sbx template must have compatible build/browser tools before feature work
can be accepted. Verify model connectivity, nested sandbox permissions, and
complete tests on the actual installed sbx version; syntax checks alone do not
prove a running agent or PR. A central proxy listening only on host loopback
also needs to be reachable through sbx's host networking.

References: [Docker Codex](https://docs.docker.com/ai/sandboxes/agents/codex/),
[sbx run](https://docs.docker.com/reference/cli/sbx/run/),
[Git isolation](https://docs.docker.com/ai/sandboxes/workflows/git/).

## Prerequisites

Docker Engine/Desktop must be running. The image uses linux/amd64, including on
Apple Silicon via emulation. Install/authenticate GitHub CLI on the host for PR
publication. Choose an OpenAI Responses API model available to your API project;
API billing is separate from a ChatGPT subscription. Do not send API keys in chat.

```bash
python3 sandbox/configure.py
```

This prompts locally for the model and a hidden API key. It generates per-task
session tokens under ignored `sandbox/.runtime/secrets`. Their host parent is
0700; the upstream key mounts only into trusted gateway services. Request/time
limits are session safeguards, not a guarantee of a monetary spending ceiling.
Configure spending controls in the API project as well.

## Prepare and run

Commit the infrastructure and start from a clean `main` checkout:

```bash
python3 sandbox/manage.py prepare
python3 sandbox/manage.py build
bash sandbox/launch-all.sh
```

Or start just one task:

```bash
bash sandbox/launch-agent.sh atlas-filter
bash sandbox/launch-agent.sh atlas-similar
```

Preview: http://127.0.0.1:4174 and http://127.0.0.1:4175. Preview becomes available
after each workspace has built its scanner and passed baseline tests. Agents
then read their separate prompts and produce committed changes plus PR bodies.
Logs and output remain in per-task named volumes. Model access uses Codex's
workspace-write sandbox and a dedicated gateway, not the macOS application's
personal auth.json. If the nested sandbox fails under Docker, report the error;
do not automatically disable seccomp or grant privileged access.

```bash
python3 sandbox/manage.py status
python3 sandbox/manage.py logs atlas-filter
python3 sandbox/manage.py export atlas-filter
bash sandbox/publish-pr.sh atlas-filter
bash sandbox/publish-pr.sh atlas-filter --publish
```

The publisher's first invocation is a dry run. It checks task/branch/SHA/file
scope and imports the commit bundle in its own checkout. It never runs submitted
scripts while holding GitHub credentials. `--publish` pushes only the assigned
feature branch and creates a draft PR. It does not merge or force push.

## CI repair and stopping

Inspect the PR's exact head SHA and all required checks with `gh` on the host.
Download failed logs into the exported task directory as `ci-failure.log`.

```bash
python3 sandbox/manage.py repair atlas-filter
python3 sandbox/manage.py export atlas-filter
bash sandbox/publish-pr.sh atlas-filter --publish
python3 sandbox/manage.py stop atlas-filter
python3 sandbox/manage.py stop atlas-similar
```

Repair starts a new agent turn in the existing branch and must produce a clean
committed correction. Do not run it concurrently with the original coding turn.
The current implementation provides explicit lifecycle commands; automatic
multi-cycle CI polling/repair and final merge are later orchestration steps.
Stopping preserves all volumes. Never use `docker compose down -v` without an
explicit request to delete the workspaces.
