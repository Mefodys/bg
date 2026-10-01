# Persistent starred skills

Issue: https://github.com/Mefodys/bg/issues/10

## Behavior

Every result has an independent star button, and details has the same control.
Starred matches sort first within their repository/section using a stable sort
before pagination. Existing repository/section order, category/text/scope filters,
counts and JSON export remain intact. Starring returns to page one so a pinned
result cannot be stranded on the previous page. Activation never opens details.

Persist a versioned localStorage set keyed by JSON-encoded canonical repository
path and canonical manifest path. Never key on process/session IDs or names.
Preferences survive reload, new scans and server restarts at the same origin.
Browser origins (including ports) have separate preferences. Missing skills retain
their preference but do not create cards; restoring the same path restores its
star. Renaming a path creates a new identity. Mirrors share their logical skill's
canonical identity; no scan/export mutation or repository write occurs.

Use empty/filled stars, accessible toggle labels including the skill name,
aria-pressed, and a visible Pinned indicator. Keep the star and view-details
buttons as siblings, never nested interactive controls. Sync tabs via storage
events. Malformed/unavailable storage cannot prevent scanning; a status message
explains session-only persistence if a write fails. Bound stored preferences to
10,000 valid identities and reject oversized/malformed stored records.

## Tests and risky parts

- Stable identity: two equally named repositories/skills must not collide;
  changed scan/session IDs must retain preferences. Test rescan and restart.
- Pagination: sort the whole matching section before slicing, preserve totals,
  return to page one, and ensure next-page stars move to the first page.
- Filters: starred nonmatches remain absent; test Current/Selected/All and roles.
- Tags: apply inherited semantic facets before pinned ordering/pagination; keep
  tag badges as sibling controls and preserve owning tags in details. Test
  Testing/Agent evaluations and Unclassified only with a pinned matching skill.
- Persistence: test reload, missing/restored files, corrupt storage, denied writes,
  and cross-tab synchronization without auto-writing corruption back to storage.
- Interaction: keyboard/pointer controls, focus after reorder, detail/card sync,
  no nested buttons, and 390px layout.
- Visual checks: replay all common scenarios unchanged; add feature scenarios
  separately so the established fixture/scenario contract cannot be weakened.

## Demo and delivery

Record desktop starring/reorder/details/reload/filter and mobile toggling using
seeded local fixtures and the rebuilt native scanner. Store video and captioned
PNG frames as CI/session artifacts, link them near the top of the feature PR.
Publish a separate PR closing #10; verify strict/native, browser, and exact-head
CI checks. Merge and post-merge server changes require separate authorization.
