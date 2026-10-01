"""Tag semantics, lifecycle, native read integration and committed audit gate."""
import subprocess
import unittest
from pathlib import Path
import test_web
ROOT=Path(__file__).resolve().parents[1]
class TagTests(unittest.TestCase):
    def test_tag_semantics_lifecycle_and_native_reads(self):
        result=subprocess.run(['node','--test','tests/tags.mjs'],cwd=ROOT,capture_output=True,text=True,timeout=40)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
    def test_committed_catalogue_and_similarity_ledger(self):
        result=subprocess.run(['node','tools/skill-tags.mjs','--check'],cwd=ROOT,capture_output=True,text=True,timeout=30)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
class TagHttpTests(unittest.TestCase):
    setUpClass=classmethod(test_web.WebTests.setUpClass.__func__)
    tearDownClass=classmethod(test_web.WebTests.tearDownClass.__func__)
    setUp=test_web.WebTests.setUp
    request=test_web.WebTests.request
    scan=test_web.WebTests.scan
    def test_definitions_scan_snapshot_and_unbound_identity(self):
        status,taxonomy=self.request('/api/tags');self.assertEqual(status,200)
        self.assertEqual(len(taxonomy['tags']),43)
        self.assertEqual(self.request('/api/tags',headers={'Origin':'https://example.com'})[0],403)
        (self.repository/'SKILL.md').write_text('# Testing\n\nRun tests.')
        scan=self.scan();self.assertEqual(scan['tagging']['coverage']['needs_classification'],1)
        status,snapshot=self.request('/api/repositories/'+scan['repository']['repository_id']+'/search-snapshot',{})
        self.assertEqual(status,200);self.assertEqual(snapshot['tagging'],scan['tagging'])
        self.assertRegex(snapshot['index']['sources'][0]['manifest_sha256'],r'^[a-f0-9]{64}$')
        self.assertEqual(snapshot['inventory'],scan['inventory'])
