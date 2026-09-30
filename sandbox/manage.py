"""Host orchestrator. Does not expose host credentials to agent containers."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "sandbox/.runtime"
TASKS = {"atlas-filter": "agent-filter", "atlas-similar": "agent-similarity"}


def run(args, **kwargs):
    return subprocess.run(args, check=True, cwd=ROOT, **kwargs)


def compose(*args, **kwargs):
    return run(["docker", "compose", "--env-file", str(RUNTIME / "environment"),
                "-f", "sandbox/compose.yml", *args], **kwargs)


def prepare():
    environment = RUNTIME / "environment"
    if not environment.exists():
        raise SystemExit("Configure model/credentials first: python3 sandbox/configure.py")
    dirty = subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip()
    if dirty:
        raise SystemExit("Commit infrastructure before creating a reproducible base snapshot")
    base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    model_lines = [line for line in environment.read_text().splitlines() if line.startswith("ATLAS_MODEL=")]
    if len(model_lines) != 1:
        raise SystemExit("Invalid model configuration")
    existing = [line.split("=", 1)[1] for line in environment.read_text().splitlines() if line.startswith("ATLAS_BASE_SHA=")]
    if existing and existing != [base]:
        raise SystemExit("Snapshot already belongs to another SHA; preserve existing task volumes and start a new batch explicitly")
    source = RUNTIME / "input"
    source.mkdir(parents=True, exist_ok=True)
    run(["git", "bundle", "create", str(source / "base.bundle"), "main"])
    environment.write_text(model_lines[0] + "\nATLAS_BASE_SHA=" + base + "\n")
    environment.chmod(0o600)
    print("Prepared identical base for both tasks: " + base)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["prepare", "build", "launch", "status", "logs", "stop", "export", "repair"])
    parser.add_argument("task", nargs="?", choices=list(TASKS))
    args = parser.parse_args()
    if args.action == "prepare":
        prepare()
        return
    if not (RUNTIME / "environment").exists():
        raise SystemExit("Run python3 sandbox/configure.py first")
    if args.action == "build":
        compose("build", "agent-filter", "gateway-filter")
        return
    if args.action == "status":
        compose("ps", *([TASKS[args.task]] if args.task else []))
        return
    if not args.task:
        parser.error("This action requires exactly one task")
    service = TASKS[args.task]
    gateway = "gateway-filter" if args.task == "atlas-filter" else "gateway-similarity"
    if args.action == "launch":
        if not (RUNTIME / "input/base.bundle").exists():
            raise SystemExit("Prepare base first: python3 sandbox/manage.py prepare")
        compose("up", "-d", "--no-build", service)
        print("Launched " + args.task + "; existing workspaces will never be overwritten")
    elif args.action == "logs":
        compose("logs", "--tail", "100", service, gateway)
    elif args.action == "stop":
        compose("stop", service, gateway)
        print("Stopped without deleting volumes")
    elif args.action == "export":
        destination = RUNTIME / "results" / args.task
        destination.mkdir(parents=True, exist_ok=True)
        compose("cp", service + ":/results/.", str(destination))
        print("Exported results to " + str(destination))
    elif args.action == "repair":
        log = RUNTIME / "results" / args.task / "ci-failure.log"
        if not log.is_file() or log.is_symlink():
            raise SystemExit("Place failed CI logs in the task's ci-failure.log first")
        compose("cp", str(log), service + ":/results/ci-failure.log")
        compose("exec", "-T", service, "python3", "/opt/entrypoint.py", "repair")


if __name__ == "__main__":
    main()
