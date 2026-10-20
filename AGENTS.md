# Working on Fieldwork

- Keep the app local-first and bound to loopback. Do not deploy or push without direct human authorization.
- Blank filters must show every imported listing. The personal placement preset stays optional, editable and removable.
- Preserve unknowns, precision, explicit flexibility and provenance. Posting dates are not placement dates. Confirmed compatibility requires evidence of full-period coverage.
- Never access protected source APIs, tokens, cookies or browser profiles. Refresh uses authorized files or normal manual browsing; there is no automatic Jorb scraper.
- Never commit databases, personal tracking, exports, backups, private captures, credentials or environment files. Use clearly synthetic test fixtures.
- Refresh must preserve notes, labels, saved state and stages. Explicit edits may clear facts.
- Use Node 24.15+ within 24.x. Add new transactional migration versions for schema changes; preserve recovery before restore.
- Run `npm run check`, `npm test` and `npm run build` after behavioral changes. Check meaningful UI changes in-browser. Report blocked checks honestly.
- Keep confirmed Jorb observations separate from enhancements and hypotheses. Do not copy proprietary implementation or design.
- Make meaningful local commits; do not push unless explicitly requested.
