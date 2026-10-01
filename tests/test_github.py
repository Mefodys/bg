import subprocess
import unittest
from pathlib import Path

class GitHubOrganizationTests(unittest.TestCase):
    def test_native_and_fake_github_contracts(self):
        result=subprocess.run(['node','--test','tests/github.mjs'],cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True,timeout=120)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_http_organization_jobs(self):
        result=subprocess.run(['node','--test','tests/github-http.mjs'],cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True,timeout=120)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
