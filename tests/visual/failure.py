"""Distinguish product assertions from incomplete rendering/harness checks."""
import json
from pathlib import Path

def failure_heading(command, results=None):
    if 'compare.py' in str(command):
        return 'INCOMPLETE — NONDETERMINISTIC SCREENSHOTS'
    try:
        report = json.loads(Path(results).read_text())
    except (TypeError, OSError, ValueError):
        return 'INCOMPLETE — PLAYWRIGHT HARNESS FAILURE'
    if report.get('errors'):
        return 'INCOMPLETE — PLAYWRIGHT HARNESS FAILURE'
    errors = []
    def visit(suites):
        for suite in suites:
            visit(suite.get('suites', []))
            for spec in suite.get('specs', []):
                for test in spec.get('tests', []):
                    for result in test.get('results', []):
                        errors.extend(result.get('errors', []))
    visit(report.get('suites', []))
    if not errors:
        return 'INCOMPLETE — PLAYWRIGHT HARNESS FAILURE'
    if all('toHaveScreenshot' in str(e) or 'Screenshot comparison failed' in str(e) for e in errors):
        return 'INCOMPLETE — NONDETERMINISTIC SCREENSHOTS'
    return 'REGRESSION — PLAYWRIGHT TEST FAILURE'
