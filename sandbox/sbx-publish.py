"""Controlled in-sandbox commits and SSH push; no personal host credentials."""
import argparse
from pathlib import Path, PurePosixPath
import re
import subprocess

TASKS = {"atlas-filter": "agent/skill-filter", "atlas-similar": "agent/skill-similarity"}
REMOTE = "git@github.com:Mefodys/bg.git"


def allowed_file(file):
    path = PurePosixPath(file)
    if path.is_absolute() or any(part in {".", ".."} for part in file.split("/")):
        return False
    if any(ord(char) < 32 for char in file):
        return False
    return file in {"README.md", "package.json", "package-lock.json"} or file.startswith(("web/", "tests/", "spec/"))


def require_sha(value):
    if not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ValueError("Expected a full commit SHA")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task", choices=list(TASKS))
    parser.add_argument("--base", required=True, type=require_sha)
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--push", action="store_true")
    parser.add_argument("--verified-sha", type=require_sha)
    args = parser.parse_args()
    if args.commit and args.push:
        parser.error("Commit, verify the exact final revision, then push in a separate step")
    if args.push and not args.verified_sha:
        parser.error("Push requires the exact SHA whose final build/tests were verified")
    repo = Path("/workspace/repo")
    branch = TASKS[args.task]

    def git(*arguments):
        return subprocess.check_output(["git", "-c", "core.hooksPath=/dev/null",
            "-C", str(repo), *arguments], text=True).strip()

    if git("branch", "--show-current") != branch:
        raise SystemExit("Wrong assigned branch; refusing publication")
    git("merge-base", "--is-ancestor", args.base, "HEAD")
    dirty_files = set(git("diff", "--name-only", "-z", "HEAD").split("\0"))
    dirty_files.update(git("ls-files", "--others", "--exclude-standard", "-z").split("\0"))
    dirty_files.discard("")
    if any(not allowed_file(file) for file in dirty_files):
        raise SystemExit("Working diff changes files outside the feature scope")
    git("diff", "--check")
    git("diff", "--cached", "--check")
    if args.commit:
        if not dirty_files:
            raise SystemExit("No feature changes to commit")
        git("add", "--all", "--", *sorted(dirty_files))
        git("commit", "-m", "Implement " + ("skill filtering" if args.task == "atlas-filter" else "cross-repository skill similarity"))
    head = git("rev-parse", "HEAD")
    files = set(git("diff", "--name-only", "-z", args.base, head).split("\0")) - {""}
    if not files or any(not allowed_file(file) for file in files):
        raise SystemExit("Committed result is empty or outside feature scope")
    git("diff", "--check", args.base, head)
    if git("status", "--porcelain"):
        raise SystemExit("Result must be clean before export or push")
    print("Reviewed feature head: " + head, flush=True)
    if not args.push:
        return
    if head != args.verified_sha:
        raise SystemExit("HEAD differs from the verified final revision; refusing push")
    key = Path("/home/agent/.ssh") / (args.task + "_ed25519")
    hosts = Path("/home/agent/.ssh/github_known_hosts")
    if not key.is_file() or key.is_symlink() or not hosts.is_file():
        raise SystemExit("Provision this task's own deploy key and verified GitHub host key")
    ssh = f"ssh -i {key} -o IdentitiesOnly=yes -o IdentityAgent=none -o BatchMode=yes -o UserKnownHostsFile={hosts} -o StrictHostKeyChecking=yes"
    print("Pushing from sandbox to " + branch + " (no force, no main)", flush=True)
    git("-c", "core.sshCommand=" + ssh, "push", REMOTE, head + ":refs/heads/" + branch)
    remote_head = git("-c", "core.sshCommand=" + ssh, "ls-remote", REMOTE, "refs/heads/" + branch).split()[0]
    if remote_head != head:
        raise SystemExit("Remote verification failed")
    print("Remote head verified: " + head, flush=True)


if __name__ == "__main__":
    main()
