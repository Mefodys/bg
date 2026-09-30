"""Build command regression checks; no compiler download or Docker needed."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BuildCommandTests(unittest.TestCase):
    def check_build(self, system, target, platform):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copyfile(ROOT / "build.sh", root / "build.sh")
            binary = root / "bin"
            binary.mkdir()
            (binary / "uname").write_text("#!/bin/sh\necho " + system + "\n")
            compiler = binary / "konanc"
            compiler.write_text("#!/usr/bin/env python3\nimport json, sys\n"
                "from pathlib import Path\nPath('arguments.json').write_text(json.dumps(sys.argv[1:]))\n"
                "Path('build/bg.kexe').write_text('mock binary')\n")
            for file in binary.iterdir():
                file.chmod(0o755)
            environment = dict(os.environ, PATH=str(binary) + os.pathsep + os.environ["PATH"],
                               KONANC=str(compiler), BG_TARGET=target)
            # /bin/bash is Bash 3.2 on macOS: catch empty-array + nounset errors.
            result = subprocess.run(["/bin/bash", "build.sh"], cwd=root, env=environment,
                                    text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            args = json.loads((root / "arguments.json").read_text())
            expected = ["src/Main.kt", "src/platform/" + platform + ".kt"]
            if target:
                expected += ["-target", target]
            self.assertEqual(args, expected + ["-o", "build/bg"])
            self.assertEqual((root / "bg").read_text(), "mock binary")

    def test_default_macos_build_is_bash32_safe(self):
        self.check_build("Darwin", "", "Macos")

    def test_linux_arm64_cross_target(self):
        self.check_build("Linux", "linux_arm64", "Linux")
