"""Interactive host provisioning; never send a key in chat or a shell argument."""
import getpass
import os
from pathlib import Path
import secrets

ROOT = Path(__file__).resolve().parent


def main():
    runtime = ROOT / ".runtime"
    directory = runtime / "secrets"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    model = input("OpenAI API model name for both agents: ").strip()
    if not model or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for c in model):
        raise SystemExit("Invalid model name")
    keyfile = directory / "openai-key"
    if not keyfile.exists():
        key = getpass.getpass("OpenAI API key (hidden, stored outside agent containers): ").strip()
        if not key:
            raise SystemExit("API key is required")
        keyfile.write_text(key + "\n")
    # World-readable inside the explicit secret mounts, protected by a 0700
    # parent directory on the host. Agents never mount the upstream key file.
    keyfile.chmod(0o444)
    for name in ("filter-token", "similarity-token"):
        file = directory / name
        if not file.exists():
            file.write_text(secrets.token_urlsafe(32) + "\n")
        file.chmod(0o444)
    env = runtime / "environment"
    env.write_text("ATLAS_MODEL=" + model + "\n")
    env.chmod(0o600)
    print("Configured. No credentials were written to Git or an image.")


if __name__ == "__main__":
    main()
