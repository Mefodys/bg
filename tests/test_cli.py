"""Black-box tests of the compiled Kotlin/Native executable."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

CLI = Path(__file__).resolve().parents[1] / "bg"
EXCLUDED = {".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", "target", ".idea", ".vscode"}


class ScannerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()

    def manifest(self, path, content="# Example\n\nDoes something useful.\n"):
        target = self.root / path / "SKILL.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return target

    def run_cli(self, *args, cwd=None):
        return subprocess.run([str(CLI), *args], cwd=cwd, capture_output=True,
                              text=True, encoding="utf-8", timeout=30)

    def scan(self):
        result = self.run_cli("scan", str(self.root), "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        return json.loads(result.stdout)

    def test_recursive_discovery_sections_ordering_and_unicode(self):
        self.manifest("tools/z/deep", "# Пример\n\nFirst line\nsecond line.\n\nMore text.")
        self.manifest("tools/a")
        self.manifest(".agents/custom")
        self.manifest(".")
        first = self.run_cli("scan", str(self.root), "--json")
        second = self.run_cli("scan", str(self.root), "--json")
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(first.stdout, second.stdout)
        self.assertTrue(first.stdout.endswith("\n"))
        data = json.loads(first.stdout)
        self.assertEqual([s["path"] for s in data["sections"]], [".", ".agents", "tools"])
        skills = data["sections"][2]["skills"]
        self.assertEqual([s["location"] for s in skills], ["tools/a", "tools/z/deep"])
        self.assertEqual(skills[1]["name"], "Пример")
        self.assertEqual(skills[1]["description"], "First line second line.")
        self.assertEqual(skills[1]["manifest_path"], "tools/z/deep/SKILL.md")

    def test_exclusions_and_gitignore_policy(self):
        for excluded in EXCLUDED:
            self.manifest(f"nested/{excluded}/hidden")
        self.manifest("ignored/visible")
        (self.root / ".gitignore").write_text("ignored/\n")
        (self.root / "skill.md").write_text("# Wrong case")
        result = self.scan()
        self.assertEqual(len(result["sections"]), 1)
        self.assertEqual(result["sections"][0]["path"], "ignored")

    def test_symlinks_are_not_followed(self):
        real = self.manifest("real")
        (self.root / "alias").symlink_to(real.parent, target_is_directory=True)
        (self.root / "linked").mkdir()
        (self.root / "linked/SKILL.md").symlink_to(real)
        (self.root / "broken").symlink_to(self.root / "absent")
        self.assertEqual(len(self.scan()["sections"]), 1)

    def test_no_skills_and_relative_path(self):
        result = self.run_cli("scan", ".", "--json", cwd=self.root)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), {
            "repository": self.root.as_posix(), "sections": [], "warnings": []})

    def test_invalid_invocations_and_paths(self):
        for args in [[], ["scan"], ["other", "."], ["scan", ".", "extra"]]:
            result = self.run_cli(*args)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")
            self.assertIn("Usage:", result.stderr)
        file = self.manifest("skill")
        for path in [self.root / "missing", file]:
            result = self.run_cli("scan", str(path))
            self.assertEqual(result.returncode, 3)
            self.assertEqual(result.stdout, "")

    def test_help_and_version(self):
        for flag in ["--help", "--version"]:
            result = self.run_cli(flag)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stderr, "")
            self.assertIn("bg", result.stdout)

    def test_markdown_fallback_and_block_boundaries(self):
        cases = [
            ("## No H1\nText", ("case", None)),
            ("# Title\n\n- List", ("Title", None)),
            ("# Title\n\nShort text\n## Next", ("Title", "Short text")),
            ("```md\n# Fake\n```\n# Real\n\nDescription", ("Real", "Description")),
            ("---\nname: metadata\n---\n# Real\n\nDescription", ("metadata", "Description")),
            ("garbled [markdown", ("case", None)),
        ]
        for content, expected in cases:
            with self.subTest(content=content):
                self.manifest("case", content)
                skill = self.scan()["sections"][0]["skills"][0]
                self.assertEqual((skill["name"], skill["description"]), expected)

    def test_front_matter_priority_and_short_descriptions(self):
        self.manifest("case", "---\nname: real-name\ndescription: 'Does useful work.'\n---\n# Input\n\nWrong description.")
        skill = self.scan()["sections"][0]["skills"][0]
        self.assertEqual((skill["name"], skill["description"]), ("real-name", "Does useful work."))
        self.manifest("case", '---\nname: "Quoted name"\ndescription: >-\n  First line\n  second line.\n---')
        skill = self.scan()["sections"][0]["skills"][0]
        self.assertEqual((skill["name"], skill["description"]), ("Quoted name", "First line second line."))
        self.manifest("case", "# Long\n\n" + "😀" * 400)
        description = self.scan()["sections"][0]["skills"][0]["description"]
        self.assertEqual(len(description), 240)
        self.assertTrue(description.endswith("..."))

    @unittest.skipIf(os.geteuid() == 0, "Root bypasses file permissions")
    def test_unreadable_manifest_and_directory_keep_scanning(self):
        unreadable = self.manifest("bad")
        self.manifest("good")
        blocked = self.root / "blocked"
        blocked.mkdir()
        unreadable.chmod(0)
        blocked.chmod(0)
        try:
            data = self.scan()
            self.assertEqual(len(data["sections"]), 2)
            self.assertEqual(len(data["warnings"]), 2)
            self.assertIn("bad/SKILL.md", data["warnings"][0])
            self.assertIn("blocked", data["warnings"][1])
            self.assertIsNone(data["sections"][0]["skills"][0]["description"])
        finally:
            unreadable.chmod(0o600)
            blocked.chmod(0o700)

    def test_invalid_utf8_warns(self):
        manifest = self.manifest("bad")
        manifest.write_bytes(b"\xff")
        data = self.scan()
        self.assertEqual(data["sections"][0]["skills"][0]["name"], "bad")
        self.assertEqual(len(data["warnings"]), 1)

    def test_json_escaping(self):
        self.manifest('with "quotes"', '# Name "quoted"\n\nA \\ backslash and a tab\tinside.')
        skill = self.scan()["sections"][0]["skills"][0]
        self.assertEqual(skill["name"], 'Name "quoted"')
        self.assertEqual(skill["description"], "A \\ backslash and a tab inside.")

    def test_readable_default_output(self):
        self.manifest("tools/example", "# Example\n\n" + "Useful description. " * 20)
        self.manifest("agents/no-description", "no heading")
        result = self.run_cli("scan", str(self.root))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        self.assertIn("2 skills  ·  2 sections", result.stdout)
        self.assertIn("[tools]  1 skills", result.stdout)
        self.assertIn("1 › Example", result.stdout)
        self.assertIn("    tools/example", result.stdout)
        self.assertIn("SKILL.md ↗", result.stdout)
        self.assertNotIn("\x1b", result.stdout)
        self.assertIn("No description available.", result.stdout)
        self.assertIn("    Useful description.", result.stdout)
        self.assertLess(result.stdout.index("[agents]"), result.stdout.index("[tools]"))
        for line in result.stdout.splitlines():
            if line.startswith("    Useful"):
                self.assertLessEqual(len(line), 96)

    def test_terminal_colors_and_links(self):
        import pty
        self.manifest("example")
        master, slave = pty.openpty()
        try:
            environment = dict(os.environ, TERM="xterm-256color", COLUMNS="100")
            environment.pop("NO_COLOR", None)
            process = subprocess.Popen([str(CLI), "scan", str(self.root)],
                                       stdout=slave, stderr=subprocess.PIPE, env=environment)
            process.wait(timeout=30)
            output = os.read(master, 16384).decode("utf-8")
            self.assertEqual(process.returncode, 0)
            self.assertIn("\x1b[1;36m", output)
            self.assertIn("\x1b]8;;file://", output)
            self.assertIn("SKILL.md", output)
            process.stderr.close()
        finally:
            os.close(master)
            os.close(slave)

    def test_readable_empty_output(self):
        result = self.run_cli("scan", str(self.root))
        self.assertEqual(result.returncode, 0)
        self.assertIn("No skills found.", result.stdout)

    def test_readable_warnings(self):
        self.manifest("bad").write_bytes(b"\xff")
        result = self.run_cli("scan", str(self.root))
        self.assertEqual(result.returncode, 0)
        self.assertIn("Warnings:", result.stdout)
        self.assertIn("bad/SKILL.md:", result.stdout)


if __name__ == "__main__":
    unittest.main()
