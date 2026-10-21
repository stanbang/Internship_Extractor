# SIT ReadyTalent IWSP integration

ReadyTalent is a separate source in the existing Fieldwork application. **All internships** retains the public search. **SIT IWSP Jobs** shows every imported IWSP row; matching never removes jobs. Saved internships and the application tracker can contain either source.

## Run locally

Use Node 24.15 or later within 24.x. From the repository root:

```powershell
npm ci
npm run build
npm start
```

Open http://127.0.0.1:4317. The server binds only to loopback. For development use `npm run dev` and http://127.0.0.1:5173.

## Refresh through authorized files

1. Log into ReadyTalent manually. In Job Search choose **Integrated Work Study Programme (IWSP)** and **BSc (Hons) Com Sci in RTIS**, then Search.
2. Record the filtered count and page count. Process every page through normal supported browser interactions or an official export, if the portal provides one. Do not call private APIs. Do not store account headers, cookies, tokens, global application tables or other unrelated personal details.
3. Record source job IDs, complete unabridged descriptions and all visible posting fields. Keep unknown fields `null`. Record page numbers, observation evidence, extraction and verification timestamps accurately.
4. Save a JSON dataset using the shape in [iwsp-example.json](iwsp-example.json). That file is explicitly synthetic and must not be used as a real collection. Manifest `pages_processed` means pages actually processed, not pages planned. List every failed page/job under `errors`.
5. In **SIT IWSP Jobs**, choose **Refresh from file**, or run:

```powershell
npm run import -- --readytalent --file data/readytalent/readytalent-current.json
```

Store input files under ignored `data/readytalent/`. Import is transactional. Matching source IDs update existing records and preserve bookmarks, notes, labels, reminders and local stages. Null fields on refresh preserve previously collected richer facts; the latest capture still reports its missing descriptions. Identical titles with different source IDs remain distinct. Invalid or duplicate IDs reject the batch.

Completeness requires known source counts, all numbered pages, matching distinct row count, a source page for every row, no missing descriptions, no errors, and a finished timestamp. An incomplete import never advances **Last complete refresh**. Stored count can exceed the latest capture count because earlier rows remain present. Absence from a capture does not prove unavailability. An explicit availability change requires job-specific evidence and a verification timestamp.

The search row's label “Closed on” is recorded as a closing date; that label alone does not prove a job expired. A dollar amount without an explicit currency/pay period stays in original metadata; monthly allowance remains unknown until verified. Dates are never inferred from a posting date or the IWSP label.

The observed **Application Details** URL depends on browser context and is shared between jobs. It is not presented as a reliable per-job deep link. **Find in ReadyTalent** opens the normal search page with title and scope filters; verify the displayed source ID in the full source metadata before relying on the match.

## Search, comparison and tracking

Search covers company, title, full description and technical terms. Category filters use any selected category; skill filters require every selected skill. Salary filters test overlapping ranges; unknown allowance and closing dates have explicit inclusion controls. Filter by local or source application status, closing date range, or locally saved jobs. Sort by relevance, current agent fit, closing date, allowance or company. Unscored jobs stay visible. Compare two to four jobs side by side. Bookmarks and application stages modify only the local database.

Full original source fields, description, source ID and provenance are in the existing job detail dialog. CSV and JSON source exports are available from the IWSP toolbar. JSON preserves nested fields and the manifest. CSV serializes arrays/objects as JSON cells and escapes spreadsheet formulas. Full workspace backups include IWSP data and local resume/review settings; they are private files.

## Resume and AI job-search skills

Place the actual resume in the repository root **after setup**, then select **Resume analysis → Rescan folder → Load resume**. Supported formats: text PDF, DOCX, `resume.txt` or `resume.md` (also CV-named text files). Scanned PDFs need OCR before loading. Files over 10 MB, symlinks and paths outside the root are rejected. Review the extracted text before interpreting results. Resume parsing and term matching run locally. Forgetting a loaded resume deletes its local analysis settings; it does not delete the original file.

By default the app connects to the sibling `../ai-job-search` directory. Set `AI_JOB_SEARCH_DIR` before starting the server to use another local checkout; `PYTHON` can select the Python executable. The bridge reads the canonical `.claude/skills/job-application-assistant/SKILL.md` and `04-job-evaluation.md` at runtime and invokes that checkout's `tools/posting_guard.py`. It does not copy or edit its candidate profiles or workflow rules. Python 3 must be available. Canonical weight changes take effect without copying rules into this repository.

Keyword coverage reports exact resume/posting evidence, terms not evidenced, detected project examples and conditional improvement suggestions. It is a term-coverage measure, not the overall compatibility score. It cannot infer unstated experience or cultural preferences. Incomplete descriptions and guard warnings cannot produce a coverage score. The original full posting is retained separately from guard-cleaned analysis text.

For the existing AI agent workflow, open a job's **Resume fit → Prepare agent review**. Give the downloaded private packet to your intended agent and request an evaluation only, following its canonical skill paths and returning `response_template` as JSON. The app does **not** invoke an agent automatically, connect to a model API, or transmit your resume. Import the response with **Import agent evaluation**. The import validates exact evidence quotations, current resume/posting hashes, dimension ranges and role-level gate quotations; it recomputes the weighted overall score from the canonical framework. It cannot establish whether an agent's interpretation of valid quotations is correct.

Every scored dimension needs exact resume and original-posting quotes. Missing dimensions keep the overall score unavailable. Hard eligibility, language and location checks are shown separately; a failed gate prevents an overall recommendation but never hides a job. Unverified gates remain explicit. Replacing the loaded resume or changing posting facts invalidates old reviews. Scores are advisory, not verified ATS scores or hiring predictions.

No resume has been assumed from the separate `ai-job-search` checkout. The user-selected root resume is authoritative.

## Data protection and recovery

SQLite schema migration 2 adds source payloads and refresh history without replacing public listings. Version 2 workspace backups preserve these tables; version 1 backups remain restorable. A pre-restore recovery copy is retained by the existing restore API.

The repository ignores local databases, exports, captures, review packets and root candidate documents. Do not force-add private data. Code and synthetic fixtures can be pushed; ReadyTalent descriptions, application metadata, resumes and local tracking must remain local. The portal itself is read-only throughout investigation and refresh.

## Verification

Run `npm run check`, `npm test` and `npm run build`. HTTP tests need loopback socket access. Tests use synthetic employers, descriptions, resumes, skill files and evidence. They cover ID isolation, refresh preservation, completeness, verified availability, original text, backups, filters, resume parsing, canonical bridge calls, stale/evidence rejection, HTTP source protection and the original public features.

Browser collection and description comparison must be reported independently from application tests. Passing software tests does not mean the portal dataset is complete.
