"""Generate a dedicated sbx Codex home; never copy personal auth or config."""
import json
import os
from pathlib import Path


def main():
    home = Path(os.environ["CODEX_HOME"])
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    home.chmod(0o700)
    model = os.environ["CENTRAL_CODEX_MODEL"]
    endpoint = os.environ["CENTRAL_CODEX_BASE_URL"]
    config = home / "config.toml"
    if config.is_symlink():
        raise SystemExit("Refusing a symlinked Codex config")
    config.write_text(
        "model = " + json.dumps(model) + '\nmodel_provider = "central"\n'
        'approval_policy = "never"\nsandbox_mode = "workspace-write"\n'
        '[sandbox_workspace_write]\nnetwork_access = true\n'
        '[model_providers.central]\nname = "JetBrains Central"\n'
        "base_url = " + json.dumps(endpoint) + '\nwire_api = "responses"\n'
        'env_key = "CENTRAL_PROXY_TOKEN"\n'
    )
    config.chmod(0o600)


if __name__ == "__main__":
    main()
