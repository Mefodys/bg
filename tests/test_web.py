"""HTTP integration tests against the local server and real native scanner."""
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


class WebTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = subprocess.Popen(["bash", "web/run.sh"], cwd=ROOT,
                                      env=dict(os.environ, PORT="0"),
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if not select.select([cls.server.stdout], [], [], 15)[0]:
            cls.server.terminate()
            cls.server.wait(timeout=5)
            raise RuntimeError("Web server did not start")
        line = cls.server.stdout.readline().strip()
        if not line.startswith("Skill Atlas: http://127.0.0.1:"):
            cls.server.terminate()
            cls.server.wait(timeout=5)
            raise RuntimeError("Web server failed: " + line + cls.server.stderr.read())
        cls.url = line.removeprefix("Skill Atlas: ")

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=5)
        cls.server.stdout.close()
        cls.server.stderr.close()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repository = Path(self.temp.name).resolve()

    def request(self, endpoint, data=None, headers=None, raw=None):
        payload = json.dumps(data).encode() if data is not None else raw
        request = Request(self.url + endpoint, data=payload,
                          headers={"Content-Type": "application/json", **(headers or {})})
        try:
            response = urlopen(request, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            body = response.read().decode()
            return response.status, json.loads(body) if response.headers.get_content_type() == "application/json" else body

    def scan(self):
        status, result = self.request("/api/scan", {"path": str(self.repository)})
        self.assertEqual(status, 200, result)
        return result

    def test_static_interface_and_asset_allowlist(self):
        for asset in ["/", "/style.css", "/app.js", "/filter.js", "/filter.css"]:
            status, body = self.request(asset)
            self.assertEqual(status, 200)
            self.assertTrue(body)
        self.assertIn("Your skills, mapped.", self.request("/")[1])
        self.assertEqual(self.request("/server.mjs")[0], 404)
        self.assertEqual(self.request("/../AGENTS.md")[0], 404)

    def test_reference_presets_exist(self):
        status, data = self.request("/api/repositories")
        self.assertEqual(status, 200)
        for repository in data:
            self.assertTrue(Path(repository["path"]).is_dir())

    def test_empty_repository(self):
        result = self.scan()
        self.assertEqual(result["inventory"]["sections"], [])

    def test_corner_cases_inventory_and_manifest_access(self):
        shutil.copytree(ROOT / "tests/fixtures/corner-cases", self.repository, dirs_exist_ok=True)
        result = self.scan()
        skills = [s for section in result["inventory"]["sections"] for s in section["skills"]]
        self.assertEqual(len(skills), 4)
        self.assertEqual({s["category"] for s in skills}, {"development", "product", "test-fixture"})
        mirrored = next(s for s in skills if len(s["sources"]) > 1)
        for source in mirrored["sources"]:
            status, manifest = self.request(f'/api/scans/{result["scan_id"]}/manifest?path={quote(source["manifest_path"])}')
            self.assertEqual(status, 200)
            self.assertIn("name: shared-skill", manifest["content"])

    def test_invalid_input(self):
        for data in [{}, {"path": 123}, {"path": ""}, {"path": str(self.repository / "missing")}, None]:
            status, _ = self.request("/api/scan", data, raw=b"{invalid" if data is None else None)
            self.assertEqual(status, 400)
        self.assertEqual(self.request("/api/scan", {"path": "."}, headers={"Content-Type": "text/plain"})[0], 415)

    def test_rejects_untrusted_origin_and_host(self):
        self.assertEqual(self.request("/api/scan", {"path": str(self.repository)}, headers={"Origin": "https://example.com"})[0], 403)
        self.assertEqual(self.request("/", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.request("/", headers={"Sec-Fetch-Site": "cross-site"})[0], 403)

    def test_rejects_oversized_request(self):
        status, _ = self.request("/api/scan", {"path": "x" * 20000})
        self.assertEqual(status, 413)

    def test_manifest_allowlist_and_unknown_session(self):
        result = self.scan()
        self.assertEqual(self.request(f'/api/scans/{result["scan_id"]}/manifest?path=../../AGENTS.md')[0], 403)
        self.assertEqual(self.request('/api/scans/00000000-0000-0000-0000-000000000000/manifest?path=SKILL.md')[0], 404)

    def test_changed_manifest_cannot_escape_repository(self):
        manifest = self.repository / "SKILL.md"
        manifest.write_text("# Safe\n\nDescription.")
        result = self.scan()
        manifest.unlink()
        manifest.symlink_to(ROOT / "AGENTS.md")
        status, _ = self.request(f'/api/scans/{result["scan_id"]}/manifest?path=SKILL.md')
        self.assertEqual(status, 403)

    def test_manifest_html_is_returned_as_text_data(self):
        content = "# Skill\n\n<script>alert('bad')</script>"
        (self.repository / "SKILL.md").write_text(content)
        result = self.scan()
        status, data = self.request(f'/api/scans/{result["scan_id"]}/manifest?path=SKILL.md')
        self.assertEqual(status, 200)
        self.assertEqual(data["content"], content)

    def test_search_index_full_text_mirrors_and_cache(self):
        shutil.copytree(ROOT / "tests/fixtures/corner-cases", self.repository, dirs_exist_ok=True)
        body = "# Context\n\nShort summary.\n\n" + "padding " * 100 + "WhenConcreteStatement <script> .* 世界"
        (self.repository / "SKILL.md").write_text(body)
        result = self.scan()
        endpoint = f'/api/scans/{result["scan_id"]}/search-index'
        status, index = self.request(endpoint)
        self.assertEqual(status, 200)
        sources = {source["path"]: source for source in index["sources"]}
        self.assertEqual(sources["SKILL.md"]["content"], body)
        self.assertIn(".claude/skills/shared/SKILL.md", sources)
        self.assertIn(".agents/skills/shared/SKILL.md", sources)
        (self.repository / "SKILL.md").unlink()
        self.assertEqual(self.request(endpoint)[1], index, "Index must be cached per scan")
        self.assertEqual(self.request(endpoint, headers={"Origin": "https://example.com"})[0], 403)
        self.assertEqual(self.request('/api/scans/00000000-0000-0000-0000-000000000000/search-index')[0], 404)

    def test_search_index_reports_missing_escaped_and_truncated_sources(self):
        for name in ["missing", "escape", "large"]:
            folder = self.repository / name
            folder.mkdir()
            (folder / "SKILL.md").write_text("# " + name)
        result = self.scan()
        (self.repository / "missing/SKILL.md").unlink()
        (self.repository / "escape/SKILL.md").unlink()
        (self.repository / "escape/SKILL.md").symlink_to(ROOT / "AGENTS.md")
        (self.repository / "large/SKILL.md").write_text("a" * (1024 * 1024 + 10))
        status, index = self.request(f'/api/scans/{result["scan_id"]}/search-index')
        self.assertEqual(status, 200)
        sources = {source["path"]: source for source in index["sources"]}
        self.assertIn("no longer available", sources["missing/SKILL.md"]["error"])
        self.assertIn("outside", sources["escape/SKILL.md"]["error"])
        self.assertEqual(sources["escape/SKILL.md"]["content"], "")
        self.assertTrue(sources["large/SKILL.md"]["truncated"])
        self.assertEqual(len(sources["large/SKILL.md"]["content"]), 1024 * 1024)
        self.assertEqual(self.request(f'/api/scans/{result["scan_id"]}/manifest?path=large/SKILL.md')[0], 413)

    def test_search_index_total_budget_and_session_expiration(self):
        for number in range(10):
            folder = self.repository / str(number)
            folder.mkdir()
            (folder / "SKILL.md").write_text("# Small")
        result = self.scan()
        for manifest in self.repository.glob("*/SKILL.md"):
            manifest.write_text("a" * (1024 * 1024))
        endpoint = f'/api/scans/{result["scan_id"]}/search-index'
        status, index = self.request(endpoint)
        self.assertEqual(status, 200)
        self.assertEqual(sum(len(s["content"].encode()) for s in index["sources"]), 8 * 1024 * 1024)
        self.assertEqual(sum("error" in s for s in index["sources"]), 2)
        for manifest in self.repository.glob("*/SKILL.md"):
            manifest.write_text("# Small")
        for _ in range(8):
            self.scan()
        self.assertEqual(self.request(endpoint)[0], 404)

    def test_search_index_source_limit(self):
        for number in range(513):
            folder = self.repository / f"skill-{number:03}"
            folder.mkdir()
            (folder / "SKILL.md").write_text("# Small")
        result = self.scan()
        status, index = self.request(f'/api/scans/{result["scan_id"]}/search-index')
        self.assertEqual(status, 200)
        self.assertEqual(len(index["sources"]), 513)
        self.assertEqual(sum("error" not in s for s in index["sources"]), 512)
        self.assertIn("limit reached", index["sources"][-1]["error"])
