import React, { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  ArrowUpRight,
  Download,
  Upload,
  Search,
  SlidersHorizontal,
  RefreshCw,
  FileText,
  Columns3,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Job } from "../shared/model";
import {
  blankIWSPFilters,
  filterIWSP,
  RT_EMPLOYMENT,
  RT_PROGRAMME,
  type Coverage,
  type IWSPFilters,
  type SourceSync,
} from "../shared/readytalent";
import type { FitResult, ResumeState } from "../shared/resume";
import { api, Modal, Multi, Field } from "./ui";

const shown = (v: unknown): string =>
  v == null || v === ""
    ? "Not stated"
    : Array.isArray(v)
      ? v.join(" · ") || "Not stated"
      : String(v);
const allowance = (j: Job) =>
  j.readyTalent?.monthly_allowance?.text ||
  j.readyTalent?.original_metadata?.["Allowance"] ||
  j.readyTalent?.original_metadata?.["Advertised amount"] ||
  "Not stated";
const download = (value: unknown, name: string) => {
  const link = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
type Props = {
  jobs: Job[];
  statuses: string[];
  reload: () => Promise<void>;
  onDetails: (j: Job) => void;
  onBookmark: (j: Job) => unknown;
};
export function IWSPJobs({
  jobs: allJobs,
  statuses,
  reload,
  onDetails,
  onBookmark,
}: Props) {
  const jobs = useMemo(() => allJobs.filter((j) => j.readyTalent), [allJobs]);
  const [coverage, setCoverage] = useState<Coverage | null>(null),
    [sourceSync, setSourceSync] = useState<SourceSync | null>(null),
    [filters, setFilters] = useState<IWSPFilters>(blankIWSPFilters),
    [page, setPage] = useState(1),
    [advanced, setAdvanced] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [importing, setImporting] = useState(false),
    [resumeOpen, setResumeOpen] = useState(false),
    [resume, setResume] = useState<ResumeState | null>(null),
    [compareIds, setCompareIds] = useState<string[]>([]),
    [compareOpen, setCompareOpen] = useState(false),
    [fitJob, setFitJob] = useState<Job | null>(null);
  const refresh = async () => {
    const [r, s, sync] = await Promise.allSettled([
      api("/readytalent"),
      api("/resume"),
      api("/readytalent/sync"),
    ]);
    if (r.status === "fulfilled") setCoverage(r.value.coverage);
    if (s.status === "fulfilled") setResume(s.value);
    if (sync.status === "fulfilled") setSourceSync(sync.value);
    if (r.status === "rejected") throw r.reason;
    if (s.status === "rejected") throw s.reason;
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [allJobs]);
  useEffect(() => {
    if (sourceSync?.status !== "running") return;
    let lastFull = sourceSync.full;
    const timer = setInterval(() => {
      void api("/readytalent/sync")
        .then(async (value) => {
          setSourceSync(value);
          if (value.status !== "running" || value.full !== lastFull) {
            lastFull = value.full;
            await reload();
            await refresh();
          }
        })
        .catch((e) => setError(e.message));
    }, 2500);
    return () => clearInterval(timer);
  }, [sourceSync?.status]);
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const results = Object.fromEntries(
    (resume?.results ?? []).map((r) => [r.job_id, r]),
  );
  const scores = Object.fromEntries(
    (resume?.results ?? []).map((r) => [r.job_id, r.technical_coverage]),
  );
  useEffect(() => {
    if (!fitJob || !resume?.resume) return;
    const result = results[fitJob.id],
      task = resume.ai?.[fitJob.id];
    if (
      !result ||
      result.status === "missing_posting" ||
      result.review_required ||
      result.agent_review ||
      task?.key === `${resume.resume.hash}:${result.posting_hash}`
    )
      return;
    void api("/resume/analyze", "POST", { job_id: fitJob.id })
      .then(refresh)
      .catch((e) => setError(e.message));
  }, [
    fitJob?.id,
    resume?.resume?.hash,
    results[fitJob?.id ?? ""]?.posting_hash,
  ]);
  useEffect(() => {
    const task = resume?.ai?.[fitJob?.id ?? ""];
    if (!fitJob || !task || !["queued", "running"].includes(task.status))
      return;
    const timer = setInterval(() => {
      void refresh().catch((e) => setError(e.message));
    }, 3000);
    return () => clearInterval(timer);
  }, [fitJob?.id, resume?.ai?.[fitJob?.id ?? ""]?.status]);
  const filtered = filterIWSP(jobs, filters, scores),
    pages = Math.max(1, Math.ceil(filtered.length / 25)),
    current = Math.min(page, pages),
    visible = filtered.slice((current - 1) * 25, current * 25);
  const change = <K extends keyof IWSPFilters>(
    key: K,
    value: IWSPFilters[K],
  ) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const values = (key: "categories" | "skills") =>
    [
      ...new Set(
        jobs.flatMap((j) => (key === "categories" ? j.categories : j.skills)),
      ),
    ].sort();
  const comparison = jobs.filter((j) => compareIds.includes(j.id));
  const packet = async (j: Job) =>
    download(
      await api("/resume/review-packet?job=" + encodeURIComponent(j.id)),
      "internship.review-packet.json",
    );
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">SIT READYTALENT · PRIVATE SOURCE</p>
          <h1>SIT IWSP Jobs</h1>
          <p>
            Current IWSP postings, your resume feedback and your application
            shortlist.
          </p>
        </div>
        <div className="iwsp-actions">
          <button className="secondary" onClick={() => setResumeOpen(true)}>
            <FileText size={17} />
            Resume analysis
          </button>
          <button
            className="primary"
            disabled={sourceSync?.status === "running"}
            onClick={() =>
              void run(async () => {
                setSourceSync(await api("/readytalent/sync", "POST", {}));
              })
            }
          >
            <RefreshCw size={17} />
            {sourceSync?.status === "running"
              ? "Syncing ReadyTalent…"
              : "Sync ReadyTalent"}
          </button>
          <button className="secondary" onClick={() => setImporting(true)}>
            <Upload size={16} /> Import file
          </button>
        </div>
      </section>
      <div className="scope-banner">
        <span className="tag">IWSP</span>
        <div>
          <strong>{RT_PROGRAMME}</strong>
          <small>{RT_EMPLOYMENT}</small>
        </div>
        <a
          className="text-button"
          href="https://readytalent2.singaporetech.edu.sg/rt-student-search/"
          target="_blank"
          rel="noreferrer"
        >
          Open ReadyTalent <ArrowUpRight size={15} />
        </a>
      </div>
      {sourceSync?.status === "running" && (
        <div className="analysis-summary" role="status">
          <strong>Reading ReadyTalent through your signed-in Chrome</strong>
          <p>
            {sourceSync.full
              ? `Captured ${sourceSync.full} of ${sourceSync.total} job details${sourceSync.title ? " · " + sourceSync.title : ""}`
              : `Reading listing page ${sourceSync.page} · ${sourceSync.total || "…"} jobs`}
            . Each detail window is closed after capture. Keep the dedicated
            search session open.
          </p>
        </div>
      )}
      {sourceSync?.error && (
        <div className="warning-box" role="alert">
          {sourceSync.error}
        </div>
      )}
      {resume?.resume && (
        <div className="resume-loaded-banner">
          <FileText size={17} />
          <div>
            <strong>Resume loaded · {resume.resume.name}</strong>
            <small>
              Automatic feedback for{" "}
              {
                resume.results.filter((r) => r.status !== "missing_posting")
                  .length
              }{" "}
              postings · open a role’s fit panel for AI feedback.
            </small>
          </div>
          <button
            className="text-button"
            onClick={() => change("sort", "resume")}
          >
            Sort by my skill match
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="error-banner">
          {error}
          <button
            className="icon-button"
            aria-label="Dismiss IWSP error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <section
        className="iwsp-coverage"
        aria-label="Source collection coverage"
      >
        <div className="coverage-title">
          <span
            className={
              "coverage-badge " +
              (coverage?.complete ? "complete" : "incomplete")
            }
          >
            {coverage?.complete
              ? "Collection verified"
              : "Collection incomplete"}
          </span>
          <small>
            {jobs.length} postings ·{" "}
            {Math.max(
              0,
              (coverage?.extracted_count ?? 0) -
                (coverage?.missing_descriptions ?? 0),
            )}{" "}
            full descriptions · {coverage?.missing_descriptions ?? 0} pending
          </small>
        </div>
        <details className="collection-details">
          <summary>Source and sync details</summary>
          <p className="hint">
            Latest attempt:{" "}
            {coverage?.finished_at ?? coverage?.started_at ?? "No import yet"}
          </p>
          <div className="iwsp-stats">
            <div>
              <strong>{coverage?.expected_count ?? "—"}</strong>
              <span>on source</span>
            </div>
            <div>
              <strong>{jobs.length}</strong>
              <span>stored locally</span>
            </div>
            <div>
              <strong>{coverage?.extracted_count ?? 0}</strong>
              <span>in latest attempt</span>
            </div>
            <div>
              <strong>{coverage?.missing_descriptions ?? "—"}</strong>
              <span>descriptions missing</span>
            </div>
            <div>
              <strong>
                {new Set(coverage?.pages_processed ?? []).size}/
                {coverage?.expected_pages ?? "?"}
              </strong>
              <span>pages processed</span>
            </div>
            <div>
              <strong>{coverage?.duplicate_count ?? 0}</strong>
              <span>duplicate IDs</span>
            </div>
          </div>
          <p className="hint">
            Last complete refresh: {coverage?.last_successful_refresh ?? "None"}
            . Counts describe collection, independent of filters. Source rows
            absent from a refresh stay available for review.
          </p>
          {!!coverage?.errors.length && (
            <details>
              <summary>{coverage.errors.length} collection errors</summary>
              <ul>
                {coverage.errors.map((e, i) => (
                  <li key={i}>
                    {e.page ? `Page ${e.page}: ` : ""}
                    {e.job_id ? `${e.job_id}: ` : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </details>
      </section>
      <section className="search-panel">
        <div className="search-top">
          <div className="search-input">
            <Search size={19} />
            <input
              aria-label="Search SIT IWSP jobs"
              placeholder="Title, company, description, language or skill"
              value={filters.search}
              onChange={(e) => change("search", e.target.value)}
            />
          </div>
          <button
            className={"secondary " + (advanced ? "selected" : "")}
            onClick={() => setAdvanced(!advanced)}
            aria-expanded={advanced}
          >
            <SlidersHorizontal size={16} />
            Filters
          </button>
          <button
            className="text-button"
            onClick={() => {
              setFilters(blankIWSPFilters());
              setPage(1);
            }}
          >
            Reset all
          </button>
        </div>
        <div className="filter-row">
          <Multi
            label="Role area (detected)"
            values={values("categories")}
            selected={filters.categories}
            onChange={(v) => change("categories", v)}
          />
          <Multi
            label="Skills & languages"
            values={values("skills")}
            selected={filters.skills}
            onChange={(v) => change("skills", v)}
          />
          <Multi
            label="Application status"
            values={[
              ...new Set([
                ...statuses,
                ...jobs
                  .map((j) => j.readyTalent?.application_status)
                  .filter((x): x is string => !!x),
              ]),
            ]}
            selected={filters.statuses}
            onChange={(v) => change("statuses", v)}
          />
          <label className="check-label">
            <input
              type="checkbox"
              checked={filters.savedOnly}
              onChange={(e) => change("savedOnly", e.target.checked)}
            />
            Saved locally
          </label>
        </div>
        {advanced && (
          <div className="iwsp-filter-grid">
            <Field label="Minimum advertised allowance">
              <input
                type="number"
                min="0"
                value={filters.minSalary ?? ""}
                onChange={(e) => change("minSalary", e.target.value)}
              />
            </Field>
            <Field label="Maximum advertised allowance">
              <input
                type="number"
                min="0"
                value={filters.maxSalary ?? ""}
                onChange={(e) => change("maxSalary", e.target.value)}
              />
            </Field>
            <Field label="Closing from">
              <input
                type="date"
                value={filters.closingFrom}
                onChange={(e) => change("closingFrom", e.target.value)}
              />
            </Field>
            <Field label="Closing through">
              <input
                type="date"
                value={filters.closingThrough}
                onChange={(e) => change("closingThrough", e.target.value)}
              />
            </Field>
            <label className="check-label">
              <input
                type="checkbox"
                checked={filters.includeUnknownSalary}
                onChange={(e) =>
                  change("includeUnknownSalary", e.target.checked)
                }
              />
              Include unknown allowance
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={filters.includeUnknownClosing}
                onChange={(e) =>
                  change("includeUnknownClosing", e.target.checked)
                }
              />
              Include unknown closing dates
            </label>
          </div>
        )}
      </section>
      <div className="iwsp-toolbar">
        <strong>
          {filtered.length}{" "}
          {filtered.length === 1 ? "opportunity" : "opportunities"}
          <small> of {jobs.length} locally stored</small>
        </strong>
        <div className="iwsp-actions">
          <button
            className="secondary small"
            disabled={comparison.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            <Columns3 size={15} />
            Compare {comparison.length > 0 && `(${comparison.length})`}
          </button>
          <a
            className="secondary small"
            href="/api/readytalent/export?format=csv"
          >
            <Download size={15} />
            CSV
          </a>
          <a className="secondary small" href="/api/readytalent/export">
            <Download size={15} />
            JSON
          </a>
          <label className="iwsp-sort">
            Sort by
            <select
              value={filters.sort}
              onChange={(e) =>
                change("sort", e.target.value as IWSPFilters["sort"])
              }
            >
              <option value="newest">Latest posting first</option>
              <option value="oldest">Oldest posting first</option>
              <option value="relevance">Relevance</option>
              <option value="resume">Resume match</option>
              <option value="closing">Closing date</option>
              <option value="salary">Allowance, highest first</option>
              <option value="company">Company</option>
            </select>
          </label>
        </div>
      </div>
      {filters.sort === "resume" && (
        <p className="section-note">
          Sorted by automatic resume skill coverage. Open a role for evidence,
          specific improvements and an automatic AI review. Jobs awaiting source
          details remain visible.
        </p>
      )}
      <div className="table-card iwsp-table">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Compare</span>
                </th>
                <th>COMPANY / ROLE</th>
                <th>ALLOWANCE</th>
                <th>POSTED</th>
                <th>CLOSING</th>
                <th>RESUME FIT</th>
                <th>STATUS</th>
                <th>
                  <span className="sr-only">Save</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((j) => (
                <tr key={j.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={"Compare " + j.title}
                      checked={compareIds.includes(j.id)}
                      disabled={
                        compareIds.length >= 4 && !compareIds.includes(j.id)
                      }
                      onChange={(e) =>
                        setCompareIds((ids) =>
                          e.target.checked
                            ? [...ids, j.id]
                            : ids.filter((id) => id !== j.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <span className="iwsp-company">{j.company}</span>
                    <button className="role-link" onClick={() => onDetails(j)}>
                      {j.title}
                    </button>
                    <small className="iwsp-compact-facts">
                      Posted {j.postedAt ?? "date not captured"} ·{" "}
                      {allowance(j)} · Closes{" "}
                      {shown(j.readyTalent?.closing_date)}
                    </small>
                    <small>
                      {shown(j.readyTalent?.work_location)} ·{" "}
                      {shown(j.readyTalent?.vacancies)} vacancies
                    </small>
                    <div className="iwsp-tags">
                      {j.skills.slice(0, 4).map((s) => (
                        <span className="tag" key={s}>
                          {s}
                        </span>
                      ))}
                      {j.skills.length > 4 && (
                        <span className="tag">+{j.skills.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td>{allowance(j)}</td>
                  <td>{j.postedAt ?? "Not captured"}</td>
                  <td>{shown(j.readyTalent?.closing_date)}</td>
                  <td>
                    <button className="fit-button" onClick={() => setFitJob(j)}>
                      {results[j.id]?.technical_coverage != null
                        ? `${results[j.id].technical_coverage}% skill match`
                        : results[j.id]?.status === "missing_posting"
                          ? "Awaiting job details"
                          : resume?.resume
                            ? "Review feedback"
                            : "Load resume"}
                      <small>
                        {results[j.id]?.matched.length
                          ? `${results[j.id].matched.length} strengths · ${results[j.id].not_evidenced.length} gaps`
                          : "View analysis"}
                      </small>
                    </button>
                  </td>
                  <td>
                    <span className="tag">{j.status}</span>
                    {j.readyTalent?.application_status && (
                      <small>Portal: {j.readyTalent.application_status}</small>
                    )}
                  </td>
                  <td>
                    <button
                      className={"icon-button " + (j.saved ? "is-saved" : "")}
                      aria-label={(j.saved ? "Unsave " : "Save ") + j.title}
                      onClick={() => onBookmark(j)}
                    >
                      <Bookmark
                        size={18}
                        fill={j.saved ? "currentColor" : "none"}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <div className="empty">
            <FileText size={32} />
            <h3>
              {jobs.length
                ? "No jobs match these filters"
                : "Ready for your IWSP collection"}
            </h3>
            <p>
              {jobs.length
                ? "Reset filters to see every imported listing."
                : "Import an authorized dataset with its coverage manifest. Missing descriptions and failed pages will remain visible."}
            </p>
            <button
              className="secondary"
              onClick={() =>
                jobs.length
                  ? setFilters(blankIWSPFilters())
                  : setImporting(true)
              }
            >
              {jobs.length ? "Reset filters" : "Import collection"}
            </button>
          </div>
        )}
        <footer className="table-footer">
          <span>
            Showing {filtered.length ? (current - 1) * 25 + 1 : 0}–
            {Math.min(current * 25, filtered.length)} of {filtered.length}
          </span>
          <div className="pagination">
            <button
              aria-label="Previous IWSP page"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              Page {current} of {pages}
            </span>
            <button
              aria-label="Next IWSP page"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </footer>
      </div>
      {importing && (
        <Modal
          title="Refresh SIT IWSP jobs"
          onClose={() => setImporting(false)}
        >
          <div className="modal-body">
            <p>
              Choose a JSON collection from normal authorized browsing or a
              permitted export. It must include the requested IWSP/RTIS scope,
              source job IDs, original fields, and a page coverage manifest.
            </p>
            <p>
              Re-importing updates source facts and keeps your local notes,
              bookmarks and application stages. Incomplete captures are accepted
              and labelled incomplete.
            </p>
            <label className="primary file-button">
              <Upload size={16} />
              Choose collection JSON
              <input
                type="file"
                accept=".json"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void run(async () => {
                      await api(
                        "/readytalent/import",
                        "POST",
                        JSON.parse(await f.text()),
                      );
                      await reload();
                      await refresh();
                      setImporting(false);
                    });
                  e.target.value = "";
                }}
              />
            </label>
            <p className="hint">
              Source data stays in your local database. Schema and a synthetic
              example are in docs/readytalent.md.
            </p>
            {error && (
              <p role="alert" className="warning-box">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
      {compareOpen && (
        <Modal
          title="Compare IWSP opportunities"
          wide
          onClose={() => setCompareOpen(false)}
        >
          <div
            className="modal-body compare-grid"
            style={{
              gridTemplateColumns: `repeat(${comparison.length}, minmax(220px,1fr))`,
            }}
          >
            {comparison.map((j) => (
              <section key={j.id}>
                <p className="eyebrow">{j.company}</p>
                <h3>{j.title}</h3>
                <dl className="metadata">
                  <dt>Allowance</dt>
                  <dd>{allowance(j)}</dd>
                  <dt>Closing</dt>
                  <dd>{shown(j.readyTalent?.closing_date)}</dd>
                  <dt>Internship period</dt>
                  <dd>{shown(j.readyTalent?.internship_period)}</dd>
                  <dt>Location</dt>
                  <dd>{shown(j.readyTalent?.work_location)}</dd>
                  <dt>Skills</dt>
                  <dd>{shown(j.skills)}</dd>
                  <dt>Resume fit</dt>
                  <dd>
                    {scores[j.id] == null
                      ? "Not evaluated"
                      : `${scores[j.id]}/100`}
                  </dd>
                  <dt>Eligibility</dt>
                  <dd>
                    {results[j.id]?.agent_review?.eligibility.status ??
                      "Unverified"}
                  </dd>
                  <dt>Source ID</dt>
                  <dd>{j.sourceJobId}</dd>
                </dl>
                <button
                  className="secondary"
                  onClick={() => {
                    setCompareOpen(false);
                    onDetails(j);
                  }}
                >
                  Full job details
                </button>
              </section>
            ))}
          </div>
        </Modal>
      )}
      {resumeOpen && (
        <Modal
          title="Resume analysis · your AI job-search skills"
          wide
          onClose={() => setResumeOpen(false)}
        >
          <div className="modal-body">
            <div className="resume-setup">
              <section>
                <h3>Use your actual resume</h3>
                <p>
                  Place your PDF, DOCX, resume.txt or resume.md in the
                  Internship_Extractor repository root, then rescan. Choose the
                  file before loading it.
                </p>
                <button
                  className="secondary small"
                  disabled={busy}
                  onClick={() => void run(refresh)}
                >
                  <RefreshCw size={15} />
                  Rescan folder
                </button>
                {resume?.files.map((name) => (
                  <div className="source-row" key={name}>
                    <strong>{name}</strong>
                    <button
                      className="secondary small"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api("/resume/load", "POST", { name });
                          await refresh();
                        })
                      }
                    >
                      Load resume
                    </button>
                  </div>
                ))}
                {!resume?.files.length && (
                  <p className="hint">
                    No resume files found in the repository root.
                  </p>
                )}
                {resume?.resume && (
                  <>
                    <p className="success-box">
                      Loaded {resume.resume.name} ·{" "}
                      {resume.resume.loaded_at.slice(0, 10)}
                    </p>
                    <details>
                      <summary>Review extracted resume text</summary>
                      <pre className="resume-preview">{resume.resume.text}</pre>
                    </details>
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(async () => {
                          await api("/resume", "DELETE");
                          await refresh();
                        })
                      }
                    >
                      Forget loaded resume and reviews
                    </button>
                  </>
                )}
              </section>
              <section>
                <h3>Your connected skill workspace</h3>
                <p className="description">{resume?.skill.directory}</p>
                <span className="tag">
                  {resume?.skill.available
                    ? `Framework ${resume.skill.framework_version}`
                    : "Skill workspace unavailable"}
                </span>
                {resume?.skill.error && (
                  <p className="warning-box">{resume.skill.error}</p>
                )}
                <p>
                  The app reads your canonical job-evaluation framework and runs
                  its posting guard locally. Keyword evidence helps you inspect
                  matches; it does not measure experience, culture or career
                  fit.
                </p>
                <p>
                  Loading a resume automatically checks every captured posting.
                  Open a role’s Resume fit panel for an automatic AI review
                  using your canonical skills and your signed-in Codex CLI. The
                  selected resume and posting are sent to that AI service for
                  the review.
                </p>
                <p className="hint">
                  AI reviews run one at a time and are reused until the resume
                  or posting changes. Eligibility, language and location remain
                  separate.
                </p>
              </section>
            </div>
            {error && (
              <p role="alert" className="warning-box">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
      {fitJob && (
        <Modal
          title="Resume fit & feedback"
          wide
          onClose={() => setFitJob(null)}
        >
          <FitPanel
            job={fitJob}
            result={results[fitJob.id]}
            resume={resume}
            busy={busy}
            error={error}
            onSetup={() => {
              setFitJob(null);
              setResumeOpen(true);
            }}
            onPacket={() => void run(() => packet(fitJob))}
            onAnalyze={() =>
              void run(async () => {
                await api("/resume/analyze", "POST", {
                  job_id: fitJob.id,
                  retry: true,
                });
                await refresh();
              })
            }
            onImport={(f) =>
              void run(async () => {
                await api("/resume/review", "POST", JSON.parse(await f.text()));
                await refresh();
              })
            }
          />
        </Modal>
      )}
    </>
  );
}
function FitPanel({
  job,
  result,
  resume,
  busy,
  error,
  onSetup,
  onPacket,
  onImport,
  onAnalyze,
}: {
  job: Job;
  result?: FitResult;
  resume: ResumeState | null;
  busy: boolean;
  error: string;
  onSetup: () => void;
  onPacket: () => void;
  onImport: (f: File) => void;
  onAnalyze: () => void;
}) {
  const review = result?.agent_review;
  return (
    <div className="modal-body">
      <p className="eyebrow">{job.company}</p>
      <h3>{job.title}</h3>
      {!resume?.resume ? (
        <>
          <p>
            Load your resume to inspect evidence for this role. No match score
            has been generated.
          </p>
          <button className="primary" onClick={onSetup}>
            Set up resume analysis
          </button>
        </>
      ) : (
        <>
          <p
            className={result?.review_required ? "warning-box" : "section-note"}
          >
            {result?.guard_verdict ??
              "Posting guard unavailable. Check the connected skill workspace."}
          </p>
          <div
            className={
              result?.status === "missing_posting"
                ? "warning-box"
                : "analysis-summary"
            }
          >
            <strong>
              {result?.status === "missing_posting"
                ? "Job details are missing"
                : "Automatic resume feedback"}
            </strong>
            <p>
              {result?.summary ??
                resume?.skill.error ??
                "Analyzing your resume against the posting…"}
            </p>
          </div>
          {result?.review_required && (
            <pre className="resume-preview">
              {JSON.stringify(result.guard_findings, null, 2)}
            </pre>
          )}
          <div className="resume-setup">
            <section>
              <h3>
                Your strengths and skill gaps{" "}
                {result?.technical_coverage != null &&
                  `· ${result.technical_coverage}%`}
              </h3>
              <p className="hint">
                Coverage of detected posting terms in your resume. A term not
                found is an evidence gap, not proof that you lack the skill.
              </p>
              {result?.matched.map((m) => (
                <div className="evidence-pair" key={m.skill}>
                  <strong>{m.skill}</strong>
                  <blockquote>Resume: {m.resume_quote}</blockquote>
                  <blockquote>Posting: {m.job_quote}</blockquote>
                </div>
              ))}
              <h4>Not evidenced in resume</h4>
              <p>
                {result?.not_evidenced.join(" · ") ||
                  (result?.status === "missing_posting"
                    ? "Waiting for the full posting; gaps cannot be assessed yet."
                    : result?.status === "no_terms"
                      ? "No comparable skill terms were detected in this posting."
                      : "Every detected posting skill has supporting resume evidence.")}
              </p>
              <h4>Relevant project evidence</h4>
              {result?.project_evidence.length ? (
                result.project_evidence.map((p, i) => (
                  <blockquote key={i}>{p}</blockquote>
                ))
              ) : (
                <p className="hint">
                  No explicit project evidence detected. Review the actual
                  resume.
                </p>
              )}
              <h4>Possible improvements</h4>
              <ul>
                {result?.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <h4>Requirements to check</h4>
              {result?.checks.map((c) => (
                <div className="evidence-pair" key={c.label}>
                  <strong>
                    {c.label} · {c.status}
                  </strong>
                  <p>{c.text}</p>
                </div>
              ))}
            </section>
            <section>
              <h3>
                AI review {review?.overall != null && `· ${review.overall}/100`}
              </h3>
              <p>
                Uses your job-search evaluation skills and actual resume.
                Evidence is checked against this exact posting before the result
                is saved.
              </p>
              {resume?.ai?.[job.id]?.status === "queued" && (
                <p role="status" className="analysis-summary">
                  AI review queued. Another role is being reviewed first.
                </p>
              )}
              {resume?.ai?.[job.id]?.status === "running" && (
                <p role="status" className="analysis-summary">
                  AI is reviewing your resume, projects and this role’s
                  requirements…
                </p>
              )}
              {resume?.ai?.[job.id]?.error && (
                <p role="alert" className="warning-box">
                  {resume.ai[job.id].error}
                </p>
              )}
              <button
                className="primary"
                onClick={onAnalyze}
                disabled={
                  busy ||
                  result?.status === "missing_posting" ||
                  result?.review_required ||
                  ["queued", "running"].includes(
                    resume?.ai?.[job.id]?.status ?? "",
                  )
                }
              >
                {review
                  ? "Review again"
                  : resume?.ai?.[job.id]?.status === "error"
                    ? "Retry AI review"
                    : "Analyze with AI"}
              </button>
              <details className="advanced-review">
                <summary>Advanced: export or import an evaluation</summary>
                <div className="iwsp-actions">
                  <button
                    className="secondary"
                    disabled={
                      busy ||
                      !result ||
                      result.review_required ||
                      !job.description
                    }
                    onClick={onPacket}
                  >
                    <Download size={16} />
                    Prepare agent review
                  </button>
                  <label className="secondary file-button">
                    <Upload size={16} />
                    Import agent evaluation
                    <input
                      type="file"
                      accept=".json"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onImport(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </details>
              {!review && (
                <p className="hint">
                  Your automatic skill feedback is available immediately. AI
                  feedback appears here when the review finishes; unknown
                  dimensions stay explicit.
                </p>
              )}
              {review && (
                <>
                  <dl className="metadata">
                    {Object.entries(review.dimensions).map(([name, d]) => (
                      <React.Fragment key={name}>
                        <dt>{name}</dt>
                        <dd>
                          <strong>
                            {d.score == null
                              ? "Insufficient evidence"
                              : `${d.score}/100`}
                          </strong>
                          <p>{d.explanation}</p>
                          {d.resume_quote && (
                            <blockquote>Resume: {d.resume_quote}</blockquote>
                          )}
                          {d.job_quote && (
                            <blockquote>Posting: {d.job_quote}</blockquote>
                          )}
                        </dd>
                      </React.Fragment>
                    ))}
                  </dl>
                  {(["eligibility", "language", "location"] as const).map(
                    (g) => (
                      <div className="evidence-pair" key={g}>
                        <strong>
                          {g}: {review[g].status}
                        </strong>
                        <p>{review[g].explanation}</p>
                        {review[g].evidence && (
                          <blockquote>{review[g].evidence}</blockquote>
                        )}
                      </div>
                    ),
                  )}
                  <ul>
                    {review.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="hint">
                Advisory assessment. Unverified gates need your review. Scores
                never hide source jobs.
              </p>
            </section>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="warning-box">
          {error}
        </p>
      )}
    </div>
  );
}
