"""One container, one branch. Agents export bundles; only the host publishes."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import fcntl

TASKS = {"atlas-filter": "agent/skill-filter", "atlas-similar": "agent/skill-similarity"}


def command(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def main():
    task = os.environ["ATLAS_TASK"]
    branch = TASKS[task]
    base = os.environ["ATLAS_BASE_SHA"]
    repo = Path("/workspace/repo")
    results = Path("/results")
    repair = sys.argv[1:] == ["repair"]
    lock = Path("/workspace/agent.lock").open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("An agent is already working in this checkout")
    if not repair:
        if (repo / ".git").exists():
            raise SystemExit("Existing workspace: use repair/export; initialization never overwrites it")
        command(["git", "clone", "/input/base.bundle", str(repo)])
        os.chdir(repo)
        command(["git", "switch", "-c", branch, base])
        command(["git", "remote", "set-url", "origin", "https://github.com/Mefodys/bg.git"])
        command(["git", "config", "remote.origin.pushurl", "disabled://host-publisher-only"])
        command(["git", "config", "user.name", "Skill Atlas agent"])
        command(["git", "config", "user.email", "skill-atlas-agent@users.noreply.github.com"])
        command(["git", "config", "core.hooksPath", "/dev/null"])
        command(["npm", "ci", "--offline", "--ignore-scripts"])
        command(["bash", "build.sh"])
        command(["python3", "tests/run.py"])
    else:
        os.chdir(repo)
        if subprocess.check_output(["git", "branch", "--show-current"], text=True).strip() != branch:
            raise SystemExit("Wrong branch; repair refused")
    (results / "publication.json").unlink(missing_ok=True)
    config = Path("/home/agent/.codex/config.toml")
    model = os.environ["ATLAS_MODEL"]
    gateway = os.environ["ATLAS_GATEWAY_URL"]
    config.write_text(
        'model = ' + json.dumps(model) + '\nmodel_provider = "atlas"\n'
        'approval_policy = "never"\nsandbox_mode = "workspace-write"\n'
        '[sandbox_workspace_write]\nnetwork_access = true\n'
        '[model_providers.atlas]\nname = "Sandbox Responses gateway"\n'
        'base_url = ' + json.dumps(gateway) + '\nwire_api = "responses"\nenv_key = "ATLAS_SESSION_TOKEN"\n'
    )
    env = dict(os.environ)
    env["ATLAS_SESSION_TOKEN"] = Path("/run/secrets/gateway-token").read_text().strip()
    web = None if repair else subprocess.Popen(["node", "web/server.mjs"], env=dict(os.environ, HOST="0.0.0.0", PORT="4173"))
    prompt = (repo / "sandbox/tasks" / (task + ".md")).read_text()
    if repair:
        prompt += "\nRepair the existing implementation based on CI logs in /results/ci-failure.log. Diagnose the actual cause, preserve test coverage, and commit corrections on the same branch.\n"
    (results / "state.json").write_text(json.dumps({"task": task, "phase": "coding", "base_sha": base}))
    with (results / "events.jsonl").open("a") as events, (results / "agent.log").open("a") as log:
        process = subprocess.run([
            "codex", "exec", "--json", "--sandbox", "workspace-write",
            "--add-dir", "/home/agent/.konan", "--add-dir", "/home/agent/.npm",
            "--add-dir", "/results", "-o", "/results/final.md", "-",
        ], input=prompt, text=True, stdout=events, stderr=log, env=env)
    (results / "exit.json").write_text(json.dumps({"task": task, "exit_code": process.returncode, "base_sha": base}))
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "status", "--porcelain"], text=True).strip()
    if process.returncode == 0 and not dirty and head != base:
        command(["git", "bundle", "create", "/results/changes.bundle", branch, "^" + base])
        (results / "publication.json").write_text(json.dumps({"task": task, "branch": branch, "base_sha": base, "head_sha": head}))
        print("Task ready for host publication: " + task, flush=True)
        (results / "state.json").write_text(json.dumps({"task": task, "phase": "ready-for-publication", "head_sha": head}))
    else:
        print("Agent did not produce a clean committed result. Inspect /results logs.", flush=True)
        (results / "state.json").write_text(json.dumps({"task": task, "phase": "needs-attention"}))
    fcntl.flock(lock, fcntl.LOCK_UN)
    lock.close()
    if repair:
        return
    # Keep preview/workspace alive for review; stop never deletes named volumes.
    while True:
        if web.poll() is not None:
            print("Preview stopped; restart with docker compose exec if needed", flush=True)
            web = subprocess.Popen(["node", "web/server.mjs"], env=dict(os.environ, HOST="0.0.0.0", PORT="4173"))
        time.sleep(10)


if __name__ == "__main__":
    main()
