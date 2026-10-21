# Fieldwork — Local Internship Finder

A personal internship discovery and application tracker for Windows. React, TypeScript, Vite and Tailwind power the interface; a Node.js API stores everything in local SQLite. No cloud service or Jorb login is needed to use the app.

All imported listings appear by default. The optional **My Internship — May 2027 to April 2028** preset looks for full placement coverage, prioritizes software roles and retains uncertain leads with clear labels. A short summer internship is not a confirmed year-long match.

## Run on Windows

Use Node.js **24.15 or newer within 24.x** and Git. Tested with Node 24.22.0 and npm 11.19.1. SQLite comes with Node; no separate database server is required.

```powershell
git clone https://github.com/stanbang/Internship_Extractor.git
cd Internship_Extractor
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317**. Keep the terminal running; Ctrl+C stops the app. On subsequent launches, run `npm start`. This working copy already has an ignored local dataset from the investigation. A fresh clone starts empty, with no fabricated vacancies.

For development, run `npm run dev` and open http://127.0.0.1:5173. Vite proxies `/api` to port 4317. Both servers bind to loopback. After installation/build, browsing saved data works offline; employer links require internet access.

Optional PowerShell overrides:

```powershell
$env:DATA_DIR = 'C:\path\to\my-private-workspace'
$env:PORT = '4317'
npm start
```

`.env.example` documents these options; `.env` is not loaded automatically. The development proxy assumes backend port 4317.

## Features

- Search company names, titles and available descriptions. Combine level, category, location, posting recency, saved state, application stage and availability. Paginate, sort and reset without losing saved jobs.
- Filter start/end bounds, month, known/unknown or explicitly flexible dates. Compare calendar-month durations and full-period coverage. Include/exclude unknown information independently.
- Activate, deactivate, edit, save or remove presets. Startup filters change only when explicitly saved in Data & settings.
- Open company/job details, provenance, original evidence and employer links.
- Save jobs locally; add notes, labels, deadlines, reminder dates and standard/custom application stages.
- Add manual listings; import/refresh CSV or JSON; deduplicate while preserving personal tracking.
- Export CSV and download/restore complete versioned JSON backups. Restore saves a recovery copy first.
- **SIT IWSP Jobs:** opens by default, shows posting dates and sorts latest first. Sync through one manually authenticated Chrome session; every job popup is closed after capture. Stable IDs, durable checkpoints and a single-collector lock support resumable refresh. Allowance, detected role area, skills, closing-date filters, comparison and local bookmarks are available. See [setup and refresh instructions](docs/readytalent.md).
- **Resume analysis:** load your actual root-folder resume once for automatic posting/requirements matching, strengths, evidence gaps, project examples and improvement suggestions. Opening a captured role's fit panel automatically runs an AI review through your signed-in Codex CLI using the canonical `ai-job-search` skills. It sends that resume and posting to the AI service, validates returned evidence and caches the result until inputs change. No packet exchange is required for the normal workflow. Missing source details and AI errors are explained explicitly.

Reminders are displayed in-app; they do not send notifications or run while closed. Public-source refresh imports a file. ReadyTalent sync uses normal browser UI and requires your dedicated Chrome session; no private source APIs, cookies or tokens are accessed. Availability is a dated observation, not a guarantee a job is open.

## Import and backup

Use **Import listings** or **Data & settings**. Company and title (or role) are required. See [supported fields](docs/data-sources.md) and the [header-only CSV template](docs/import-template.csv).

```powershell
npm run import -- --file 'C:\path\to\permitted-listings.csv'
```

The optional investigation adapter joins reviewed facts and sanitized descriptions without browser access:

```powershell
npm run import -- --file 'C:\path\all-listings.json' --facts 'C:\path\internships.json' --descriptions 'C:\path\sanitized-text.json'
```

The default database is `data/internships.sqlite`, excluded from Git. Use **Download backup** while running. To copy raw SQLite instead, stop the app and copy the entire data folder, including WAL/SHM siblings. Never copy just a live SQLite main file.

CSV includes tracking columns for reference, but importing it does not overwrite personal notes/stages. Use the full JSON backup to restore those. Restore replaces the workspace transactionally and rolls back on failure.

## Verification

```powershell
npm run check
npm test
npm run build
npm audit
```

Tests cover real SQLite transactions, persistence, migrations, backup rollback, the local HTTP API, CSV/deduplication and date matching. Synthetic fixtures never populate the app. See [verification notes](docs/verification.md).

## Project guide

- [REA/browser findings and limitations](docs/rea-investigation.md)
- [Architecture, database and API](docs/architecture.md)
- [Filtering and matching](docs/filtering.md)
- [Supported sources and import contract](docs/data-sources.md)
- [Contributor rules](AGENTS.md)

This is an original implementation of observed workflow functionality. Proprietary code, credentials and account state are not included. The verified remote is `stanbang/Internship_Extractor`, following the latest user selection over the older brief's `internship-finder` name. No deployment or automatic push is configured.
