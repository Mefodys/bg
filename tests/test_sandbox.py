"""Deterministic sandbox control-plane tests; no Docker/API credentials needed."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "sandbox" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gateway = load("gateway")
publisher = load("publish")
sbx_publisher = load("sbx-publish")


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.quota = gateway.Quota(2, 60)
        self.server = gateway.ThreadingHTTPServer(("127.0.0.1", 0),
                        gateway.proxy_handler("test-upstream-key", "session-token", "test-model", self.quota))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def request(self, endpoint, data=None, token="session-token"):
        request = Request(self.url + endpoint, data=json.dumps(data).encode() if data is not None else None,
                          headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def test_health_and_limited_model_catalog(self):
        self.assertEqual(self.request("/health")[0], 200)
        status, data = self.request("/v1/models")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in data["data"]], ["test-model"])
        self.assertNotIn("test-upstream-key", json.dumps(data))

    def test_invalid_tokens_and_unsupported_routes(self):
        self.assertEqual(self.request("/v1/models", token="wrong")[0], 403)
        self.assertEqual(self.request("/v1/responses", {"model": "test-model"}, token="wrong")[0], 401)
        self.assertEqual(self.request("/v1/files", {"x": 1})[0], 404)

    def test_model_and_time_budget(self):
        self.assertEqual(self.request("/v1/responses", {"model": "unapproved"})[0], 403)
        self.quota.deadline = 0
        self.assertEqual(self.request("/v1/responses", {"model": "test-model"})[0], 429)

    def test_request_quota(self):
        self.assertTrue(self.quota.take())
        self.assertTrue(self.quota.take())
        self.assertFalse(self.quota.take())

    def test_upstream_key_only_in_gateway_and_output_limit(self):
        with patch.object(gateway, "HTTPSConnection") as connection:
            upstream = connection.return_value
            response = upstream.getresponse.return_value
            response.status = 200
            response.getheader.return_value = "application/json"
            response.read1.side_effect = [b'{"ok":true}', b'']
            status, data = self.request("/v1/responses", {"model": "test-model", "max_output_tokens": 999999})
            self.assertEqual(status, 200)
            self.assertTrue(data["ok"])
            args = upstream.request.call_args.args
            self.assertEqual(args[3]["Authorization"], "Bearer test-upstream-key")
            self.assertEqual(json.loads(args[2])["max_output_tokens"], 16384)
            self.assertNotIn("test-upstream-key", json.dumps(data))


class PublisherTests(unittest.TestCase):
    def test_sbx_publisher_scope_and_exact_revision(self):
        for file in ["web/filter.js", "tests/test_filter.py", "spec/filter.md", "README.md"]:
            self.assertTrue(sbx_publisher.allowed_file(file))
        for file in ["web/../.github/ci.yml", "/web/file.js", "web/evil\nname.js", "sandbox/tool.py"]:
            self.assertFalse(sbx_publisher.allowed_file(file))
        self.assertEqual(sbx_publisher.require_sha("a" * 40), "a" * 40)
        for value in ["HEAD", "main", "a" * 39, "a" * 40 + ";push"]:
            with self.assertRaises(ValueError):
                sbx_publisher.require_sha(value)

    def test_valid_assigned_branch(self):
        publisher.validate_metadata({"task": "atlas-filter", "branch": "agent/skill-filter",
                                     "base_sha": "a" * 40, "head_sha": "b" * 40}, "atlas-filter")

    def test_main_or_other_task_branch_is_rejected(self):
        for branch in ["main", "agent/skill-similarity", "main; echo injected"]:
            with self.assertRaises(ValueError):
                publisher.validate_metadata({"task": "atlas-filter", "branch": branch,
                                             "base_sha": "a" * 40, "head_sha": "b" * 40}, "atlas-filter")

    def test_feature_scope_excludes_credentials_and_workflows(self):
        for file in ["web/filter.js", "tests/test_filter.py", "spec/filter.md"]:
            self.assertTrue(publisher.allowed_file(file))
        for file in [".github/workflows/ci.yml", ".codex/auth.json", "sandbox/gateway.py"]:
            self.assertFalse(publisher.allowed_file(file))


class CodexLauncherTests(unittest.TestCase):
    def test_central_launcher_is_codex_only_with_independent_git(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "sandbox").mkdir()
            shutil.copyfile(ROOT / "sandbox/central-codex-config.py", root / "sandbox/central-codex-config.py")
            binary_dir = root / "bin"
            binary_dir.mkdir()
            home = root / "home"
            (home / ".codex").mkdir(parents=True)
            (home / ".codex/config.toml").write_text("model = 'test-model'\n")
            (home / ".jetbrains-central").mkdir()
            (home / ".jetbrains-central/config.json").write_text('{"proxy_port": 19516}')
            programs = {
                "git": """#!/usr/bin/env python3
import os, sys
args = sys.argv[1:]
if args == ['rev-parse', '--show-toplevel']: print(os.environ['MOCK_ROOT'])
elif args[:2] == ['rev-parse', '--verify']: print('a' * 40)
elif args == ['status', '--porcelain']: pass
elif args[:2] == ['worktree', 'add']:
    os.makedirs(args[-2])
else: raise SystemExit('Unexpected git invocation')
""",
                "central": """#!/usr/bin/env python3
import sys
assert sys.argv[1:] == ['proxy', 'start', '--return-key']
print('test-proxy-token')
""",
                "sbx": """#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
config = (Path(os.environ['CODEX_HOME']) / 'config.toml').read_text()
print(json.dumps({'args': sys.argv[1:],
 'api_key_set': os.environ['OPENAI_API_KEY'] == 'test-proxy-token',
 'exec_key_set': os.environ['CENTRAL_PROXY_TOKEN'] == 'test-proxy-token',
 'correct_endpoint': 'http://host.docker.internal:19516/wire/test-proxy-token/codex/openai/v1' in config,
 'custom_provider': 'model_provider = "central"' in config and 'wire_api = "responses"' in config,
 'ssh_forwarded': 'SSH_AUTH_SOCK' in os.environ}))
""",
            }
            for name, source in programs.items():
                file = binary_dir / name
                file.write_text(source)
                file.chmod(0o755)
            environment = dict(os.environ, PATH=str(binary_dir) + os.pathsep + os.environ["PATH"],
                               HOME=str(home), MOCK_ROOT=str(root), SSH_AUTH_SOCK="test-socket")
            environment.pop("CENTRAL_CODEX_MODEL", None)
            for task, branch in [("atlas-filter", "agent/skill-filter"), ("atlas-similar", "agent/skill-similarity")]:
                result = subprocess.run(["bash", str(ROOT / "sandbox/sbx-codex.sh"), task],
                    cwd=root, env=environment, text=True, capture_output=True, check=True)
                report = json.loads(result.stdout)
                self.assertTrue(report["api_key_set"])
                self.assertTrue(report["exec_key_set"])
                self.assertTrue(report["correct_endpoint"])
                self.assertTrue(report["custom_provider"])
                self.assertFalse(report["ssh_forwarded"])
                self.assertIn("--clone", report["args"])
                self.assertIn("codex", report["args"])
                self.assertIn("exec", report["args"])
                self.assertIn("workspace-write", report["args"])
                self.assertIn(branch, report["args"][-1])
                self.assertNotIn("claude", report["args"])
                self.assertNotIn(str(root / ".git"), report["args"])
                self.assertNotIn("test-proxy-token", result.stdout + result.stderr)
