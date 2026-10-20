# Sources and import contract

The app imports files and manual facts; it has no crawler and needs no source credentials.

| Source                  | Refresh workflow                                                                    | Boundary                                                   |
| ----------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Jorb                    | Owner browses normally and imports permitted browser-assisted CSV/JSON observations | No protected endpoint calls, tokens or automated login     |
| Official employers      | Open normal employer links; record evidence or import an authorized export          | No application submission or access-control bypass         |
| Other permitted sources | Import CSV/JSON exports obtained with permission                                    | A URL alone does not establish permission or availability  |
| Manual entry            | Add/edit listing and provenance                                                     | Unknowns stay empty; verification is supported by evidence |

Re-import updated files to refresh. No periodic fetch or live-availability guarantee is provided. Mark expired/unavailable in Edit facts. Source names/URLs are set per listing/import; settings shows their latest import and count.

Required columns: `company` and `title` (aliases `company_name`, `role`, `job_title`).

| Optional fields                                                 | Format                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `description`, `eligibility`, `evidence`                        | Plain text; quoted multiline CSV supported                             |
| `category`, `level`, `location`, `skills`                       | Semicolon-separated; JSON accepts arrays/plural names                  |
| `url` / `job_url` / `application_link`, `source_url`, `source`  | HTTP(S) URLs without embedded credentials; source name                 |
| `posting_date`, `last_verified`                                 | YYYY-MM-DD, blank unknown                                              |
| `start_date`, `end_date`                                        | YYYY, YYYY-MM or YYYY-MM-DD                                            |
| `start_certainty`, `end_certainty`, `date_certainty`            | verified, reported, inferred, unknown; supplied dates default reported |
| `date_evidence`                                                 | Supporting statement and source                                        |
| `duration_min`, `duration_max`, `duration_unit`                 | Non-negative numeric bounds; month/week/day; blank maximum stays open  |
| `duration_months`                                               | Exact-month shorthand                                                  |
| `duration_qualifier`, `duration_certainty`, `duration_evidence` | exact/range/minimum/preferred/unknown; certainty; source statement     |
| `availability`                                                  | unverified, available, expired, unavailable                            |
| `deadline`                                                      | Separate application deadline                                          |

JSON accepts an array or an object containing `jobs`, `listings` or `candidates`. Nested `start`/`end` facts accept `value`, `certainty`, `flexible`, `evidence`, `sourceUrl`; precision is derived and validated. Nested `duration` accepts `min`, `max`, `unit`, `qualifier`, `certainty`, `evidence`. Use JSON/full backup for independent evidence and explicit flexibility.

CSV export escapes formula-like text with an apostrophe. Tracking columns (`saved`, `status`, `notes`, `labels`, `reminder`) are exported for reference and ignored on import. Use a full JSON backup for lossless workspace restore.

The investigation adapter recognizes `internship_period`, `advertised_duration`, evidence status and employer observations. It deliberately discards the old short-window compatibility conclusion. `--facts` joins reviewed candidates by exact job URL; `--descriptions` accepts sanitized text keyed by candidate ID. The local workspace was populated with 248 observed rows and reviewed facts where available; it is a dated selected snapshot. No actual vacancies, private captures or notes are bundled in Git. Test-only synthetic fixtures never populate the application.
