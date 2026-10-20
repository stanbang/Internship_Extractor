# Architecture

React state controls search views; SQLite is authoritative for listings and personal tracking. Node serves loopback API and production assets. Vite serves development assets and proxies `/api`. Fonts/icons/assets are local; saved-data browsing works offline.

| Area                                  | Responsibility                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `frontend/`                           | Dashboard, filters, table, details/editor/import dialogs, saved list, tracker, settings, responsive styles |
| `shared/model.ts`, `shared/filter.ts` | Types, optional preset, date arithmetic, compatibility, filters, sort, canonical identity                  |
| `backend/ingest.ts`                   | CSV/JSON normalization/validation/export and investigation adapter                                         |
| `backend/database.ts`                 | Normalized SQLite, migrations, transactions, deduplication, tracking, backup                               |
| `backend/server.ts`                   | Loopback HTTP API, host/origin checks, request limits, restore recovery, static assets                     |
| `backend/import-cli.ts`               | Offline file import and optional investigation joins                                                       |
| `tests/`                              | Synthetic filter cases, persistence/rollback, CSV and real HTTP integration                                |

## Database

`migrations` records schema version. Version 1 initializes transactionally. Future changes must add new versions rather than editing an applied migration.

Reference tables: `companies`, `categories`, `levels`, `locations`, `sources`, `statuses`, `labels`. `jobs` stores description, identity, posting/first collection/verification metadata, availability, skills, eligibility and evidence. Join tables: `job_categories`, `job_levels`, `job_locations`, `job_sources`, `job_labels`. `job_dates` holds independent start/end facts; `job_durations` retains numeric bounds and provenance. `tracking`, `notes`, `presets`, `settings` store private workflow data. Foreign keys, WAL and transactions maintain consistency.

Deduplication matches normalized employer URLs with tracking parameters removed, then company/title/sorted location. The fallback can merge distinct requisitions with identical names/location; differentiate titles before import when necessary. Alternate source links remain aliases. Source records keep application URL, separate source page and most recent import time, without claiming complete change history.

Refresh updates non-empty source facts, preserves richer missing facts and leaves notes/labels/stages intact. Explicit editor PUT may clear facts. Failed batches roll back atomically.

## API

| Method/path                                    | Behavior                                                    |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `GET /api/bootstrap`                           | Jobs, presets, startup preferences, statuses, source counts |
| `POST /api/jobs`                               | Manual insert/deduplicate                                   |
| `PUT /api/jobs/:id`                            | Explicit fact edit                                          |
| `PATCH /api/jobs/:id/tracking`                 | Saved state, stage, notes, labels, reminder, deadline       |
| `POST /api/import`                             | `{format: "csv" or "json", content: ...}` atomic batch      |
| `POST /api/presets`, `DELETE /api/presets/:id` | Save/remove preset                                          |
| `PUT /api/preferences`                         | Explicit startup filters                                    |
| `GET /api/export`                              | Spreadsheet-safe CSV                                        |
| `GET /api/backup`, `POST /api/restore`         | Complete versioned logical backup/replacement               |

JSON mutations are limited to 20 MB; imports to 10,000 rows. Host/Origin checks allow the local production/dev frontend. The server listens only on 127.0.0.1, with no remote sharing or multiuser authentication mode. Production applies a self-only resource policy. Restore validates format, tables, columns and foreign keys and inflates records before commit; failure rolls back. A recovery copy is written to `DATA_DIR/backups` first.

SQLite, exports, notes, backups and raw/private browser data are excluded from Git. CSV/downloaded backups contain private tracking; keep them local.
