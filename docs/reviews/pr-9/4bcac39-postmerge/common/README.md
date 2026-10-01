# search-field-color — initial visual run

Revision: `4bcac3937e6af91874b8939c5f94997384d8d79f`. Playwright Test visual run.

Isolated native server from serving checkout; versioned deterministic fixtures, not live host repository data.

Capture settings and asserted outcomes: [manifest.json](manifest.json).
Reusable suite: workspace tests/visual/visual.spec.mjs and scenarios.json.

## desktop/01-initial

Initial empty application

![Initial empty application](desktop/01-initial.png)

Count: 0 of 0; query: ""; scope: current.

## desktop/02-scanned

Scanned inventory and lavender search field

![Scanned inventory and lavender search field](desktop/02-scanned.png)

Count: 4 of 4; query: ""; scope: current.

## desktop/03-name

Name search: release-checklist

![Name search: release-checklist](desktop/03-name.png)

Count: 1 of 4; query: "release-checklist"; scope: current.

## desktop/04-description

Description search: automated review

![Description search: automated review](desktop/04-description.png)

Count: 1 of 4; query: "automated review"; scope: current.

## desktop/05-body

Body-only search: AlphaBodyToken

![Body-only search: AlphaBodyToken](desktop/05-body.png)

Count: 1 of 4; query: "AlphaBodyToken"; scope: current.

## desktop/06-current-miss

Current excludes a token in another repository

![Current excludes a token in another repository](desktop/06-current-miss.png)

Count: 0 of 4; query: "OtherBodyNeedle"; scope: current.

## desktop/07-selected

Selected includes the other repository

![Selected includes the other repository](desktop/07-selected.png)

Count: 1 of 8; query: "OtherBodyNeedle"; scope: selected.

## desktop/08-all

All added groups both repositories

![All added groups both repositories](desktop/08-all.png)

Count: 8 of 8; query: ""; scope: all.

## desktop/09-category

Current product category

![Current product category](desktop/09-category.png)

Count: 1 of 1; query: ""; scope: current.

## desktop/10-empty

No matching skills

![No matching skills](desktop/10-empty.png)

Count: 0 of 4; query: "missing-visual-token"; scope: current.

## desktop/11-clear

Escape clears and retains focus

![Escape clears and retains focus](desktop/11-clear.png)

Count: 4 of 4; query: ""; scope: current.

## desktop/12-details

Details belong to the selected library result

![Details belong to the selected library result](desktop/12-details.png)

Count: 1 of 8; query: "OtherBodyNeedle"; scope: all.

## desktop/13-similar

Native Similar skills results

![Native Similar skills results](desktop/13-similar.png)

Count: 4 of 4; query: ""; scope: current.

## desktop/14-refresh

Refresh discovers changed fixture content

![Refresh discovers changed fixture content](desktop/14-refresh.png)

Count: 1 of 8; query: "RefreshBodyToken"; scope: all.

## desktop/15-partial

Failed refresh retains explicitly stale results

![Failed refresh retains explicitly stale results](desktop/15-partial.png)

Count: 1 of 8 · Partial; query: "OtherBodyNeedle"; scope: all.

## desktop/16-expired

Expired details offer recovery

![Expired details offer recovery](desktop/16-expired.png)

Count: 1 of 8; query: "OtherBodyNeedle"; scope: all.

## desktop/17-recovered

Recovery opens the owning manifest

![Recovery opens the owning manifest](desktop/17-recovered.png)

Count: 1 of 8; query: "OtherBodyNeedle"; scope: all.

## desktop/18-pagination

Native pagination: second page of 101 matches

![Native pagination: second page of 101 matches](desktop/18-pagination.png)

Count: 101 of 109; query: "PaginationNeedle"; scope: all.

## desktop/19-mirrors

Mirrored manifest sources retained

![Mirrored manifest sources retained](desktop/19-mirrors.png)

Count: 1 of 8; query: "mirror-helper"; scope: all.

## desktop/20-unicode

Unicode literal matching

![Unicode literal matching](desktop/20-unicode.png)

Count: 1 of 8; query: "世界"; scope: all.

## mobile/01-overview

Mobile Filter overview

![Mobile Filter overview](mobile/01-overview.png)

Count: 4 of 4; query: ""; scope: current.

## mobile/02-search

Mobile search and result

![Mobile search and result](mobile/02-search.png)

Count: 1 of 4; query: "release-checklist"; scope: current.

## mobile/03-details

Mobile owning manifest details

![Mobile owning manifest details](mobile/03-details.png)

Count: 1 of 8; query: "OtherBodyNeedle"; scope: all.
