# Reviewed tag-feature visual changes

PR9 https://github.com/Mefodys/bg/pull/9 was manually merged by Mefodys at 2026-10-01 09:23:25 UTC as `4bcac3937e6af91874b8939c5f94997384d8d79f`, from head `3d74d695fabe7f97dc902b107dc073c9f5950e3a`. The user then explicitly authorised merge in the project conversation after the final screenshots and explanation. This decision is recorded by Codex at https://github.com/Mefodys/bg/pull/9#issuecomment-5928790109; it is not a separate GitHub reviewer approval.

## Scope and preserved evidence

The historical declaration is archived in [`tests/visual/archive/skill-tags-b911ff2.json`](../tests/visual/archive/skill-tags-b911ff2.json). It is supplied explicitly only for historical reanalysis; CI never reads this archive. The active `tests/visual/expected-changes.json` remains `{"baseSHA":null,"changes":[]}`. The archive binds exact previous main `b911ff2b7392d8b69c9642048f5bcef9821a6265` and each reviewed decoded after-image SHA256. All 23 main after-image hashes are identical to the previously reviewed PR images. The original failed runs and inline old/new/highlighted comparisons remain preserved at https://github.com/Mefodys/bg/pull/9#issuecomment-5927869334 . Main native CI 36842410933 passed; main visual CI 36842410859 failed on undeclared changes and did not publish a baseline. This declaration does not retroactively change that run.

Each declaration describes the visible feature addition and affected layout. Regions are bounded horizontal 32px bands covering reviewed changed content; no full-viewport permission is used. The exact after-image hash is required in addition to region containment, so even a different image inside those regions fails. For scrolled states and centered dialogs, the affected bands span much of the content area; region containment alone is a broad constraint there. The exact decoded-image hash is the decisive constraint. This is acceptance of reviewed images only, not a blanket allowance for future tag changes.

- Initial: tagged-export action and shift of existing export button.
- Inventory/search/scopes/category/empty/clear/refresh/errors/pagination/Unicode: Tags disclosure and classification badges add height; the existing scroll-to-filter behavior changes visible page geometry. Existing counts, owning results and errors remain unchanged. ScrollY changes in 18 states as the page becomes taller; each exact reviewed observedAfter object is declared. All other observed fields match.
- Similar: new classification badges and reasons expand target rows as well as the inventory.
- Details/expiry/recovery/mirrors/mobile details: classification badge/reason expands and recenters the dialog; the taller inventory shifts the scrolled background.
- Mobile overview/search: added disclosure and badges shift results and bottom-visible content.

All 23 common and 12 tag frames were visually inspected; no obvious clipping or overlap was found. All behavior assertions passed. Base/head 23-scenario pixel and DOM repeats, retained baseline verification 23/23 and tag 12/12 repeats were exact with zero skips/retries/flaky tests. The earlier d0ee116 recovered-details 1px nondeterminism was fixed, not accepted.

## Future gate

No fixture, suite, font, rendering environment, tolerance, analyzer or behavior test changes. Both active expectation files remain empty. On the follow-up PR, actual base `4bcac39` already contains the feature: fresh base/head must match, including all 12 tag states. The archived declaration cannot waive any CI difference, even if a later author changes the active base. Historical reanalysis must pass this archive path explicitly to `analyze.py`; it never establishes the next CI baseline. Only a successful actual main run can publish that baseline. Prior failed artifacts remain retained.
