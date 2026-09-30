"""Similarity integration: native discovery and pinned manifest reads, no mocks."""
import subprocess
from pathlib import Path
import test_web
import unittest

ROOT = Path(__file__).resolve().parents[1]

class SimilarityTests(unittest.TestCase):
    setUpClass = classmethod(test_web.WebTests.setUpClass.__func__)
    tearDownClass = classmethod(test_web.WebTests.tearDownClass.__func__)
    setUp = test_web.WebTests.setUp
    request = test_web.WebTests.request
    scan = test_web.WebTests.scan

    def write(self, root, relative, text):
        manifest = root / relative
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(text)

    def setup_comparison(self):
        source = self.repository / 'source'
        source.mkdir()
        self.write(source, 'SKILL.md', '# Alpha\n\ncompiler types language')
        self.repository = source
        scan = self.scan()
        target = source.parent / 'target'
        target.mkdir()
        return scan, target

    def compare(self, scan, targets, **extra):
        return self.request('/api/similarity', dict(scan_id=scan['scan_id'], manifest_path='SKILL.md', targets=[str(p) for p in targets], **extra))

    def test_rankings_roles_mirrors_aliases_ties_and_full_text(self):
        scan, target = self.setup_comparison()
        text = '# Alpha\n\ncompiler types language'
        for relative, content in {
            '.agents/skills/mirror/SKILL.md': text,
            '.claude/skills/mirror/SKILL.md': text,
            'skills/tie/SKILL.md': text,
            'skills/partial/SKILL.md': 'compiler types',
            'skills/unrelated/SKILL.md': 'weather rain sunshine',
            'skills/empty/SKILL.md': '',
            'tests/fixture/SKILL.md': text,
            'plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/product/SKILL.md': text,
        }.items():
            self.write(target, relative, content)
        alias = target.parent / 'alias'
        alias.symlink_to(target, target_is_directory=True)
        source_alias = target.parent / 'source-alias'
        source_alias.symlink_to(self.repository, target_is_directory=True)
        status, data = self.compare(scan, [target, alias, source_alias])
        self.assertEqual(status, 200, data)
        self.assertFalse(data['partial'])
        results = data['results']
        self.assertEqual(len(results), 5)
        self.assertEqual([r['skill']['manifest_path'] for r in results[:2]], ['.agents/skills/mirror/SKILL.md', 'skills/tie/SKILL.md'])
        self.assertEqual([r['score'] for r in results[:2]], [100, 100])
        self.assertGreater(results[2]['score'], 0)
        self.assertLess(results[2]['score'], 100)
        self.assertEqual([r['score'] for r in results[-2:]], [0, 0])
        self.assertEqual(len(results[0]['skill']['sources']), 2)
        self.assertEqual(results[0]['repository'], str(target.resolve()))
        self.assertEqual(results[0]['repository_name'], 'target')
        self.assertEqual(results[0]['content'], text)
        self.assertEqual(self.compare(scan, [alias, target])[1], data)
        self.assertEqual(len(self.compare(scan, [target], include_roles=True)[1]['results']), 7)
        self.assertEqual(self.compare(scan, [self.repository, source_alias])[1]['results'], [])

    def test_validation_allowlists_expiration_and_origins(self):
        scan, target = self.setup_comparison()
        for extra in [dict(targets=[]), dict(targets=['x'] * 9), dict(targets=[None]), dict(include_roles='yes')]:
            payload = dict(scan_id=scan['scan_id'], manifest_path='SKILL.md', targets=[str(target)])
            payload.update(extra)
            self.assertEqual(self.request('/api/similarity', payload)[0], 400)
        for manifest in ['../SKILL.md', str(self.repository / 'SKILL.md'), 'missing/SKILL.md']:
            self.assertEqual(self.request('/api/similarity', dict(scan_id=scan['scan_id'], manifest_path=manifest, targets=[str(target)]))[0], 403)
        self.assertEqual(self.request('/api/similarity', dict(scan_id='expired', targets=[str(target)]))[0], 404)
        payload = dict(scan_id=scan['scan_id'], manifest_path='SKILL.md', targets=[str(target)])
        self.assertEqual(self.request('/api/similarity', payload, headers={'Origin': 'https://example.com'})[0], 403)
        self.assertEqual(self.request('/api/similarity', payload, headers={'Host': 'evil.example'})[0], 403)
        for _ in range(8): self.scan()
        self.assertEqual(self.compare(scan, [target])[0], 404)

    def test_partial_failures_invalid_paths_and_source_disappearance(self):
        scan, target = self.setup_comparison()
        self.write(target, 'SKILL.md', '# Alpha\n\ncompiler types language')
        status, result = self.compare(scan, [target, target / 'missing'])
        self.assertEqual(status, 200, result)
        self.assertTrue(result['partial'])
        self.assertEqual(len(result['results']), 1)
        self.assertIn('does not exist', result['warnings'][0]['error'])
        (self.repository / 'SKILL.md').unlink()
        self.assertEqual(self.compare(scan, [target])[0], 404)

    def test_limits_and_no_partial_text_scoring(self):
        scan, target = self.setup_comparison()
        self.write(target, 'SKILL.md', '# large\n' + 'a ' * (1024 * 1024))
        status, result = self.compare(scan, [target])
        self.assertEqual(status, 200, result)
        self.assertTrue(result['partial'])
        self.assertEqual(result['results'], [])
        self.write(self.repository, 'SKILL.md', 'a' * (1024 * 1024 + 1))
        self.assertEqual(self.compare(scan, [target])[0], 413)

    def test_empty_source_and_cross_repository_stable_ties(self):
        scan, target = self.setup_comparison()
        other = target.parent / 'another'
        other.mkdir()
        text = '# Alpha\n\ncompiler types language'
        for repository in [target, other]: self.write(repository, 'SKILL.md', text)
        first = self.compare(scan, [target, other])[1]
        self.assertEqual(first, self.compare(scan, [other, target])[1])
        self.assertEqual([r['repository'] for r in first['results']], sorted([str(target), str(other)]))
        self.write(self.repository, 'SKILL.md', '')
        empty_scan = self.scan()
        self.assertEqual([r['score'] for r in self.compare(empty_scan, [target, other])[1]['results']], [0, 0])

    def test_source_symlink_rejected_and_mirror_alias_uses_canonical_text(self):
        scan, target = self.setup_comparison()
        self.write(target, 'SKILL.md', '# Alpha\n\ncompiler types language')
        (self.repository / 'SKILL.md').unlink()
        (self.repository / 'SKILL.md').symlink_to(target / 'SKILL.md')
        self.assertEqual(self.compare(scan, [target])[0], 403)
        (self.repository / 'SKILL.md').unlink()
        for prefix in ['.agents', '.claude']:
            self.write(self.repository, prefix + '/skills/mirror/SKILL.md', '# mirrored')
        scan = self.scan()
        status, result = self.request('/api/similarity', dict(scan_id=scan['scan_id'], manifest_path='.claude/skills/mirror/SKILL.md', targets=[str(target)]))
        self.assertEqual(status, 200, result)
        self.assertEqual(len(result['results']), 1)

    def test_candidate_count_and_total_byte_limits(self):
        scan, target = self.setup_comparison()
        for number in range(513): self.write(target, f'{number:03}/SKILL.md', 'compiler')
        status, result = self.compare(scan, [target])
        self.assertEqual(status, 200, result)
        self.assertEqual(len(result['results']), 512)
        self.assertTrue(result['partial'])
        self.assertIn('resource limit', result['warnings'][0]['error'])
        large = target.parent / 'large'
        large.mkdir()
        for number in range(9): self.write(large, f'{number}/SKILL.md', 'a' * (1024 * 1024))
        status, result = self.compare(scan, [large])
        self.assertEqual(status, 200, result)
        self.assertTrue(result['partial'])
        self.assertEqual(len(result['results']), 7)
        self.assertTrue(all(len(r['content']) == 1024 * 1024 for r in result['results']))

    def test_similarity_algorithm(self):
        result = subprocess.run(['node', '--test', 'tests/similarity.mjs'], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
