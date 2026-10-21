# Verification record

The initial public-search build was verified locally on Windows with Node 24.22.0. At that stage, no cloud deployment or GitHub push had been performed. The ReadyTalent verification entry below records the subsequent integration.

- `npm run check`: passed strict TypeScript checks.
- `npm test`: **41 passed, 0 failed**. Coverage includes exact/full-period/partial/outside matches, unknowns/flexibility, precision, leap/fractional months, min/max durations, conflicts, combined facets, reset/preset restoration, URL/identity deduplication, tracking preservation, quoted CSV and formula escaping, invalid input/null durations, real SQLite reopen/migrations, atomic backup rollback, and loopback HTTP import/tracking/origin checks.
- `npm run build`: passed production frontend/backend compilation.
- `npm audit`: zero known vulnerabilities after updating csv-parse to 7.0.3.
- Initial local import: 248 inserted. Refresh: 0 inserted, 248 updated. Personal tracking remained empty in the real workspace.

The first HTTP integration attempt was blocked by Windows sandbox loopback access (`connect EACCES 127.0.0.1`). Running with authorized localhost access resolved that environmental failure; no test was skipped.

## Browser checks

Connected Browser observation of the built production app on port 4317 confirmed 248 initial rows, ten local pages, title/company/description search, displayed exact/month/unknown date facts, evidence and employer links. The optional preset applied and deactivated; uncertain leads stayed labelled rather than becoming confirmed matches.

A separate SQLite workspace on port 4320 used clearly synthetic fixtures, isolated from the real data. Browser checks confirmed:

1. All three initial fixtures visible with blank filters; a full-year verified fixture matched the personal preset while a three-month summer fixture and another location did not. Deactivation restored all three.
2. Bookmarking updated the shortlist. Custom stage, labels and notes saved locally; the tracker showed the custom column and accepted a move to Applied.
3. CSV refresh reported 0 added / 1 updated, retaining saved state, labels, stage, dates and duration. Reload preserved saved/application counts.
4. Manual entry accepted multiple semicolon-separated locations/categories and a month-only start date without inventing an end date.
5. The three-month quick filter with unknown durations excluded showed only the summer fixture.

Desktop rendering was visually inspected. Responsive CSS is implemented at 1250, 900 and 600 px with compact/bottom navigation, stacked panels/dialogs and table scrolling. Mobile-device-specific browser verification is not claimed.

Repeat with a separate `DATA_DIR` when testing mutations. Do not insert test vacancies or notes into the user's real workspace. The test workspace and screenshots are not committed.
# ReadyTalent integration verification — 21 October 2026

- `npm run check`: passed.
- `npm test`: **53 passed, 0 failed**, including the original public workflow suite and new source-ID, coverage, refresh, backup, resume parser, skill bridge, evidence import and HTTP checks. Local socket tests were run with loopback permission.
- `npm run build`: passed for the production frontend and backend.
- Dependency audit: no reported vulnerabilities after replacing the DOCX parser's unused CLI dependency chain with local ZIP/XML parsing.
- Browser: verified the preserved 248-row public search and 20-row partial IWSP view, C++ title search, closing-date filter, closing sort, local bookmark/unbookmark, two-job comparison, reset and canonical skill discovery (framework 1.2.7). No actual resume was selected; parser and review tests used synthetic fixtures.
- Portal collection is **incomplete**: filtered count 157 over 8 pages verified, first page's 20 metadata rows stored, all 20 descriptions missing, 137 rows uncollected and pages 2–8 unprocessed. No imported description could be compared to the portal. Whole-page capture was blocked by automatic approval review pending broader read-only scope approval.
- The local manifest and IWSP UI show these collection limits. Tests do not establish portal completeness. See [REA evidence](rea-investigation.md) and [refresh instructions](readytalent.md).
