import subprocess
import unittest
from pathlib import Path

class FavoritesTests(unittest.TestCase):
    def test_favorites_storage_contract(self):
        result = subprocess.run(['node', 'tests/favorites.mjs'], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
