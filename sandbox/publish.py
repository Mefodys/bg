"""Trusted host publisher: imports commits but never executes proposed code."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "sandbox/.runtime"
TASKS = {"atlas-filter": ("agent/skill-filter", "Improve skill filtering"),
         "atlas-similar": ("agent/skill-similarity", "Compare skills across repositories")}


def validate_metadata(data, task):
    if data.get("task") != task or data.get("branch") != TASKS[task][0]:
        raise ValueError("Task/branch mismatch")
    for name in ("base_sha", "head_sha"):
        if not re.fullmatch(r"[0-9a-f]{40}", data.get(name, "")):
            raise ValueError("Invalid commit SHA")


def allowed_file(file):
    return file in {"README.md", "package.json", "package-lock.json"} or file.startswith(("web/", "tests/", "spec/"))


def regular(file, limit):
    if file.is_symlink() or not file.is_file() or file.stat().st_size > limit:
        raise ValueError("Invalid publication artifact: " + file.name)
    return file


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("task", choices=list(TASKS))
    parser.add_argument("--publish", action="store_true", help="Push assigned branch and open draft PR")
    args = parser.parse_args()
    directory = RUNTIME / "results" / args.task
    data = json.loads(regular(directory / "publication.json", 16384).read_text())
    validate_metadata(data, args.task)
    config = dict(line.split("=", 1) for line in (RUNTIME / "environment").read_text().splitlines() if "=" in line)
    if data["base_sha"] != config.get("ATLAS_BASE_SHA"):
        raise SystemExit("Result does not match the prepared base SHA")
    bundle = regular(directory / "changes.bundle", 100 * 1024 * 1024)
    body = regular(directory / "pr-body.md", 1024 * 1024)
    repo = RUNTIME / "publisher" / args.task
    repo.parent.mkdir(parents=True, exist_ok=True)
    def git(*arguments, capture=False):
        return subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "-C", str(repo), *arguments],
                              check=True, capture_output=capture, text=True).stdout
    if not (repo / ".git").exists():
        subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "clone", "https://github.com/Mefodys/bg.git", str(repo)], check=True)
    if git("status", "--porcelain", capture=True).strip():
        raise SystemExit("Publisher checkout is dirty; inspect it before proceeding")
    git("fetch", str(bundle), "refs/heads/" + data["branch"])
    if git("rev-parse", "FETCH_HEAD", capture=True).strip() != data["head_sha"]:
        raise SystemExit("Bundle head mismatch")
    git("merge-base", "--is-ancestor", data["base_sha"], data["head_sha"])
    files = git("diff", "--name-only", data["base_sha"], data["head_sha"], capture=True).splitlines()
    if not files or any(not allowed_file(file) for file in files):
        raise SystemExit("Result changes files outside the feature scope")
    git("diff", "--check", data["base_sha"], data["head_sha"])
    print("Reviewed file scope for " + data["head_sha"] + ":\n" + "\n".join(files))
    if not args.publish:
        print("Dry run only. Use --publish to push and create the draft PR.")
        return
    if not shutil.which("gh"):
        raise SystemExit("Install and authenticate GitHub CLI on the trusted host first")
    git("push", "git@github.com:Mefodys/bg.git", data["head_sha"] + ":refs/heads/" + data["branch"])
    existing = subprocess.run(["gh", "pr", "view", data["branch"], "--repo", "Mefodys/bg", "--json", "url"], capture_output=True, text=True)
    if existing.returncode == 0:
        print(json.loads(existing.stdout)["url"])
    else:
        subprocess.run(["gh", "pr", "create", "--repo", "Mefodys/bg", "--draft", "--base", "main",
                        "--head", data["branch"], "--title", TASKS[args.task][1], "--body-file", str(body)], check=True)


if __name__ == "__main__":
    main()
