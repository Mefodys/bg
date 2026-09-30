"""Descriptor-relative manifest reads against the freshly built native binary."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ManifestReaderTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.repository = Path(self.temporary.name).resolve()

    def read(self, relative="SKILL.md", limit="1024", repository=None):
        return subprocess.run([str(ROOT / "bg"), "--read-manifest",
                               str(repository or self.repository), relative, limit],
                              capture_output=True, timeout=5)

    def test_regular_binary_content_is_bounded(self):
        content = b"\x00\xffabc"
        (self.repository / "SKILL.md").write_bytes(content)
        self.assertEqual(self.read().stdout, content)
        self.assertEqual(self.read(limit="2").stdout, content[:3])
        self.assertEqual(self.read(limit="0").stdout, content[:1])

    def test_invalid_paths_limits_and_arguments(self):
        for relative in ["../SKILL.md", "/SKILL.md", "skills/../SKILL.md", "./SKILL.md", "a//SKILL.md", "other.md"]:
            result = self.read(relative)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, b"")
        for limit in ["-1", "1048577", "garbage"]:
            self.assertEqual(self.read(limit=limit).returncode, 2)
        self.assertEqual(self.read(repository="relative-root").returncode, 2)
        result = subprocess.run([str(ROOT / "bg"), "--read-manifest"], capture_output=True)
        self.assertEqual(result.returncode, 2)

    def test_symlink_leaf_and_parent_are_rejected_even_inside_repository(self):
        folder = self.repository / "real"
        folder.mkdir()
        (folder / "SKILL.md").write_text("PRIVATE_FIXTURE")
        (self.repository / "SKILL.md").symlink_to(folder / "SKILL.md")
        (self.repository / "alias").symlink_to(folder, target_is_directory=True)
        for relative in ["SKILL.md", "alias/SKILL.md"]:
            result = self.read(relative)
            self.assertEqual(result.returncode, 3)
            self.assertEqual(result.stdout, b"")

    def test_missing_directory_and_fifo_never_block(self):
        self.assertEqual(self.read("missing/SKILL.md").returncode, 4)
        manifest = self.repository / "SKILL.md"
        manifest.mkdir()
        self.assertEqual(self.read().returncode, 4)
        manifest.rmdir()
        os.mkfifo(manifest)
        result = self.read()
        self.assertEqual(result.returncode, 4)
        self.assertEqual(result.stdout, b"")

    def test_deterministic_path_swap_regressions(self):
        result = subprocess.run(["node", "--test", "tests/manifest_reader.mjs"],
                                cwd=ROOT, text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
