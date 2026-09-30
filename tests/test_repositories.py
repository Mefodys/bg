"""Added-repository search with real scanner, native reads and HTTP checks."""
import subprocess
import unittest
from pathlib import Path
import test_web

ROOT = Path(__file__).resolve().parents[1]

class RepositorySearchTests(unittest.TestCase):
    setUpClass = classmethod(test_web.WebTests.setUpClass.__func__)
    tearDownClass = classmethod(test_web.WebTests.tearDownClass.__func__)
    setUp = test_web.WebTests.setUp
    request = test_web.WebTests.request
    scan = test_web.WebTests.scan

    def write(self, directory, relative='SKILL.md', content='# Same\n\nSummary.\n\nBody-only token 世界 .* <script>'):
        file = directory / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content)
        return file

    def snapshot(self, scan, **options):
        return self.request('/api/repositories/' + scan['repository']['repository_id'] + '/search-snapshot', options)

    def test_manual_registration_failed_scan_and_alias_identity(self):
        before = self.request('/api/repositories')[1]
        self.assertEqual(self.request('/api/scan', {'path': str(self.repository / 'missing')})[0], 400)
        self.assertEqual(self.request('/api/repositories')[1], before)
        self.write(self.repository)
        result = self.scan()
        entry = result['repository']
        self.assertEqual(entry['path'], str(self.repository))
        self.assertIn(entry, self.request('/api/repositories')[1])
        alias = self.repository / 'alias'
        alias.symlink_to(self.repository, target_is_directory=True)
        other = self.request('/api/scan', {'path': str(alias)})[1]
        self.assertEqual(other['repository']['repository_id'], entry['repository_id'])
        self.assertEqual(len([r for r in self.request('/api/repositories')[1] if r['path'] == str(self.repository)]), 1)

    def test_snapshot_reuses_focused_scan_index_and_refreshes(self):
        file = self.write(self.repository)
        scan = self.scan()
        status, first = self.snapshot(scan)
        self.assertEqual(status, 200, first)
        self.assertEqual(first['scan_id'], scan['scan_id'])
        self.assertEqual(first['inventory'], scan['inventory'])
        self.assertEqual(first['index'], self.request(f"/api/scans/{scan['scan_id']}/search-index")[1])
        self.assertIn('Body-only token 世界', first['index']['sources'][0]['content'])
        self.assertFalse(first['partial'])
        file.write_text('# Changed\n\nNew body')
        self.assertEqual(self.snapshot(scan)[1], first)
        status, fresh = self.snapshot(scan, refresh=True)
        self.assertEqual(status, 200, fresh)
        self.assertNotEqual(first['scan_id'], fresh['scan_id'])
        self.assertEqual(fresh['index']['sources'][0]['content'], '# Changed\n\nNew body')

    def test_equal_relative_paths_have_independent_ownership(self):
        results = []
        for name in ['one', 'two']:
            folder = self.repository / name
            self.write(folder, content='# Same\n\n' + name)
            status, scan = self.request('/api/scan', {'path': str(folder)})
            self.assertEqual(status, 200)
            status, snapshot = self.snapshot(scan)
            self.assertEqual(status, 200)
            results.append(snapshot)
        self.assertNotEqual(results[0]['repository']['repository_id'], results[1]['repository']['repository_id'])
        self.assertNotEqual(results[0]['scan_id'], results[1]['scan_id'])
        for snapshot, name in zip(results, ['one', 'two']):
            status, manifest = self.request(f"/api/scans/{snapshot['scan_id']}/manifest?path=SKILL.md")
            self.assertEqual(status, 200)
            self.assertEqual(manifest['content'], '# Same\n\n' + name)

    def test_snapshot_partial_reads_and_pinned_allowlist(self):
        file = self.write(self.repository)
        self.write(self.repository, 'gone/SKILL.md')
        self.write(self.repository, 'large/SKILL.md')
        scan = self.scan()
        file.unlink(); file.symlink_to(ROOT / 'AGENTS.md')
        (self.repository / 'gone/SKILL.md').unlink()
        (self.repository / 'large/SKILL.md').write_text('a' * (1024 * 1024 + 1))
        status, result = self.snapshot(scan)
        self.assertEqual(status, 200, result)
        self.assertTrue(result['partial'])
        sources = {s['path']: s for s in result['index']['sources']}
        self.assertIn('outside', sources['SKILL.md']['error'])
        self.assertEqual(sources['SKILL.md']['content'], '')
        self.assertIn('no longer available', sources['gone/SKILL.md']['error'])
        self.assertTrue(sources['large/SKILL.md']['truncated'])

    def test_snapshot_invalid_ids_fields_origin_and_host(self):
        scan = self.scan()
        endpoint = '/api/repositories/' + scan['repository']['repository_id'] + '/search-snapshot'
        for options in [None, [], {'refresh': 1}, {'budget_ms': True}, {'budget_ms': 0}, {'budget_ms': 120001}, {'budget_ms': 1.5}, {'path': '/arbitrary'}]:
            self.assertEqual(self.request(endpoint, options, raw=b'null' if options is None else None)[0], 400)
        self.assertEqual(self.request('/api/repositories/00000000-0000-0000-0000-000000000000/search-snapshot', {})[0], 404)
        self.assertEqual(self.request(endpoint, {}, headers={'Origin': 'https://example.com'})[0], 403)
        self.assertEqual(self.request(endpoint, {}, headers={'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.request(endpoint, {'padding': 'a' * 20000})[0], 413)

    def test_unavailable_repository_preserved_with_explicit_error(self):
        folder = self.repository / 'removed'
        folder.mkdir()
        scan = self.request('/api/scan', {'path': str(folder)})[1]
        folder.rmdir()
        entry = next(r for r in self.request('/api/repositories')[1] if r['repository_id'] == scan['repository']['repository_id'])
        self.assertFalse(entry['available'])
        self.assertEqual(self.snapshot(scan, refresh=True)[0], 410)

    def test_expired_snapshot_gets_new_scan_and_empty_is_complete(self):
        scan = self.scan()
        for _ in range(8): self.scan()
        self.assertEqual(self.request(f"/api/scans/{scan['scan_id']}/search-index")[0], 404)
        status, result = self.snapshot(scan)
        self.assertEqual(status, 200, result)
        self.assertNotEqual(result['scan_id'], scan['scan_id'])
        self.assertFalse(result['partial'])
        self.assertEqual(result['inventory']['sections'], [])

    def test_catalogue_worker_deadlines_limits_and_restart(self):
        result = subprocess.run(['node', '--test', 'tests/repositories.mjs'], cwd=ROOT, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
