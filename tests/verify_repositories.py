"""Optional real-repository validation; no repository code is executed.

Usage: python3 tests/verify_repositories.py /path/to/repo [...]
Print a JSON report to stdout. Core CI tests use checked-in fixtures instead.
"""
import collections
import json
from pathlib import Path
import subprocess
import sys

CLI = Path(__file__).resolve().parents[1] / "bg"
EXCLUDED = {".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", "target", ".idea", ".vscode"}


def verify(path):
    root = Path(path).resolve()
    revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    remote = subprocess.check_output(["git", "-C", str(root), "remote", "get-url", "origin"], text=True).strip()
    tracked = subprocess.check_output(["git", "-c", "core.fsmonitor=false", "-C", str(root), "ls-files", "-z"]).decode().split("\0")
    expected = {p for p in tracked if p.split("/")[-1] == "SKILL.md"
                and not EXCLUDED.intersection(p.split("/")[:-1])
                and not (root / p).is_symlink()}
    output = subprocess.check_output([str(CLI), "scan", str(root), "--json"], text=True)
    data = json.loads(output)
    skills = [s for section in data["sections"] for s in section["skills"]]
    actual = [source["manifest_path"] for skill in skills for source in skill["sources"]]
    assert set(actual) == expected, f"Missing: {expected - set(actual)}; unexpected: {set(actual) - expected}"
    assert len(actual) == len(set(actual)), "A manifest belongs to multiple logical skills"
    assert not data["warnings"], data["warnings"]
    return {"repository": remote, "revision": revision, "manifest_count": len(expected),
            "logical_skill_count": len(skills), "categories": dict(collections.Counter(s["category"] for s in skills)),
            "mirrored_skills": sum(len(s["sources"]) > 1 for s in skills),
            "conflicting_variants": sum(s["conflict"] for s in skills), "warnings": data["warnings"],
            "coverage": "Every eligible tracked manifest appears exactly once in sources"}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: python3 tests/verify_repositories.py <repository-path> [...]")
    print(json.dumps([verify(path) for path in sys.argv[1:]], indent=2))
