"""CI test runner: fail on failures, errors, skips, or zero discovered tests."""
import sys
import unittest
from pathlib import Path


def main():
    suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print(f"Tests: {result.testsRun}; failures: {len(result.failures)}; "
          f"errors: {len(result.errors)}; skipped: {len(result.skipped)}")
    return 0 if result.testsRun > 0 and result.wasSuccessful() and not result.skipped else 1


if __name__ == "__main__":
    sys.exit(main())
