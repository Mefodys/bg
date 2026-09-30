#!/usr/bin/env bash
# Optional Docker Sandboxes launcher: Codex through JetBrains Central, never Claude.
# Run from the repository root: bash sandbox/sbx-codex.sh atlas-filter
set +x
set -euo pipefail

task="${1:-}"
case "$task" in
  atlas-filter) branch=agent/skill-filter ;;
  atlas-similar) branch=agent/skill-similarity ;;
  *) echo 'Usage: bash sandbox/sbx-codex.sh atlas-filter|atlas-similar [Codex task prompt]' >&2; exit 2 ;;
esac
shift
for dependency in sbx git jq python3; do
  command -v "$dependency" >/dev/null || { echo "Missing dependency: $dependency" >&2; exit 1; }
done
central_command="$(command -v central || command -v jbcentral || true)"
[[ -n "$central_command" ]] || { echo 'Install JetBrains Central first.' >&2; exit 1; }
root="$(git rev-parse --show-toplevel)"
cd "$root"
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit the base changes before creating a task workspace.' >&2; exit 1; }
base_ref="${ATLAS_BASE_REF:-main}"
git rev-parse --verify "$base_ref^{commit}" >/dev/null
model="${CENTRAL_CODEX_MODEL:-}"
if [[ -z "$model" && -f "$HOME/.codex/config.toml" ]]; then
  # Only read the selected model, not provider URLs, credentials, or auth.json.
  model="$(sed -n -E "s/^model[[:space:]]*=[[:space:]]*[\"']([^\"']+)[\"'].*/\1/p" "$HOME/.codex/config.toml" | head -n 1)"
fi
[[ "$model" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Set CENTRAL_CODEX_MODEL to a model available through Central.' >&2; exit 1; }
port=19516
if [[ -f "$HOME/.jetbrains-central/config.json" ]]; then
  port="$(jq -r '.proxy_port // 19516' "$HOME/.jetbrains-central/config.json")"
fi
[[ "$port" =~ ^[0-9]+$ && "$port" -ge 1 && "$port" -le 65535 ]] || { echo 'Invalid Central proxy port.' >&2; exit 1; }
worktree="$root/sandbox/.runtime/worktrees/$task"
if [[ -e "$worktree" ]]; then
  [[ "$(git -C "$worktree" branch --show-current)" == "$branch" ]] || { echo 'Existing worktree uses another branch; refusing to overwrite.' >&2; exit 1; }
else
  mkdir -p "$root/sandbox/.runtime/worktrees"
  git worktree add -b "$branch" "$worktree" "$base_ref"
fi
# Central 1.11 has --return-key but not --ensure-updated. Never echo the key.
proxy_key="$("$central_command" proxy start --return-key)"
[[ -n "$proxy_key" ]] || { echo 'Central returned an empty proxy token.' >&2; exit 1; }
export OPENAI_API_KEY="$proxy_key"
export CENTRAL_PROXY_TOKEN="$proxy_key"
export CENTRAL_CODEX_MODEL="$model"
export CENTRAL_CODEX_BASE_URL="http://host.docker.internal:$port/wire/$proxy_key/codex/openai/v1"
export CODEX_HOME="$root/sandbox/.runtime/sbx-codex-home/$task"
unset proxy_key SSH_AUTH_SOCK SSH_AGENT_PID
python3 "$root/sandbox/central-codex-config.py"
unset CENTRAL_CODEX_BASE_URL
prompt="${1:-Read AGENTS.md and sandbox/tasks/$task.md. Implement the assigned task on $branch. Never merge or push main.}"
# --clone provides private .git metadata; do not mount the host's shared .git.
# The bare 'exec' replaces sbx's default approval-bypass startup command.
# Pass secrets by environment-variable NAME, not literal values in argv.
exec sbx run --clone --name "$task" \
  -e OPENAI_API_KEY -e CENTRAL_PROXY_TOKEN -e CODEX_HOME \
  codex "$worktree" "$CODEX_HOME" -- exec --sandbox workspace-write \
  -c 'model_provider="central"' -c 'approval_policy="never"' \
  -c 'sandbox_workspace_write.network_access=true' --model "$model" "$prompt"
