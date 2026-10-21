import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Compass,
  Search,
  Bookmark,
  LayoutGrid,
  SlidersHorizontal,
  ArrowUpRight,
  Plus,
  X,
  Download,
  Database,
  Check,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Upload,
  ShieldCheck,
  RotateCcw,
  FolderOpen,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  blankFilters,
  emptyDate,
  emptyDuration,
  LEVELS,
  togglePreset,
  type Filters,
  type Job,
  type Preset,
} from "../shared/model";
import { compatibility, filterJobs, hasConflict } from "../shared/filter";
import { Modal, Multi, Field, api } from "./ui";
import { IWSPJobs } from "./iwsp";
import "./styles.css";

type Bootstrap = {
  jobs: Job[];
  presets: Preset[];
  preferences: Filters | null;
  statuses: string[];
  sources: { id: string; name: string; count: number; lastImported: string }[];
};
const formatDate = (v: string | null | undefined) => v ?? "Not stated";
const durationText = (j: Job) =>
  j.duration.min === null && j.duration.max === null
    ? "Not stated"
    : `${j.duration.qualifier === "preferred" ? "Preferred " : ""}${j.duration.min === null ? "≤ " : j.duration.max === null ? "≥ " : ""}${j.duration.min ?? j.duration.max}${j.duration.min !== null && j.duration.max !== null && j.duration.max !== j.duration.min ? "–" + j.duration.max : ""} ${j.duration.unit}${j.duration.max === 1 ? "" : "s"}`;
const matchNames = {
  confirmed: "Confirmed compatible",
  potential: "Potentially compatible",
  incompatible: "Incompatible",
  unknown: "Insufficient information",
};

function App() {
  const [data, setData] = useState<Bootstrap>({
      jobs: [],
      presets: [],
      preferences: null,
      statuses: [],
      sources: [],
    }),
    [ready, setReady] = useState(false),
    [view, setView] = useState("iwsp"),
    [filters, setFilters] = useState<Filters>(blankFilters),
    [page, setPage] = useState(1),
    [advanced, setAdvanced] = useState(false),
    [selected, setSelected] = useState<Job | null>(null),
    [editor, setEditor] = useState<Job | "new" | null>(null),
    [company, setCompany] = useState<string | null>(null),
    [importOpen, setImportOpen] = useState(false),
    [presetDialog, setPresetDialog] = useState(false),
    [active, setActive] = useState<Preset | null>(null),
    [previous, setPrevious] = useState<Filters | null>(null),
    [presetChoice, setPresetChoice] = useState(""),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 5000);
  };
  const reload = async (initial = false) => {
    try {
      const d = await api("/bootstrap");
      setData(d);
      if (initial && d.preferences)
        setFilters({ ...blankFilters(), ...d.preferences });
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void reload(true);
  }, []);
  const act = async (fn: () => Promise<any>, message = "Saved locally") => {
    setError("");
    try {
      const value = await fn();
      await reload();
      notify(message);
      return value;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };
  const change = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const publicJobs = useMemo(
    () => data.jobs.filter((j) => !j.readyTalent),
    [data.jobs],
  );
  const filtered = useMemo(
    () =>
      filterJobs(view === "saved" ? data.jobs : publicJobs, {
        ...filters,
        saved: view === "saved" ? "saved" : filters.saved,
      }),
    [data.jobs, publicJobs, filters, view],
  );
  const facetJobs = view === "saved" ? data.jobs : publicJobs;
  const categories = [
      ...new Set(facetJobs.flatMap((j) => j.categories)),
    ].sort(),
    levels = [...new Set([...LEVELS, ...facetJobs.flatMap((j) => j.levels)])],
    locations = [...new Set(facetJobs.flatMap((j) => j.locations))].sort();
  const saved = data.jobs.filter((j) => j.saved),
    tracked = data.jobs.filter((j) => j.saved || j.status !== "Not Started");
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * 25, safePage * 25);
  const activeCount = Object.keys(filters).filter(
    (k) =>
      JSON.stringify(filters[k as keyof Filters]) !==
      JSON.stringify(blankFilters()[k as keyof Filters]),
  ).length;
  const toggleSave = (j: Job) =>
    act(
      () => api(`/jobs/${j.id}/tracking`, "PATCH", { saved: !j.saved }),
      j.saved
        ? "Removed from local saved list"
        : "Saved to your local shortlist",
    );
  const selectPreset = (p: Preset) => {
    const next = togglePreset(filters, active, previous, p);
    setFilters(next.filters);
    setActive(next.active);
    setPrevious(next.previous);
    setPage(1);
  };
  const reset = () => {
    setFilters(blankFilters());
    setActive(null);
    setPrevious(null);
    setPage(1);
  };
  const detail = selected
    ? (data.jobs.find((j) => j.id === selected.id) ?? selected)
    : null;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("all");
          }}
        >
          <span className="brand-icon">
            <Compass size={24} />
          </span>
          fieldwork<span className="brand-dot">.</span>
        </a>
        <p className="sidebar-caption">YOUR NEXT CHAPTER</p>
        <nav>
          {[
            ["all", "All internships", Search],
            ["iwsp", "SIT IWSP Jobs", FolderOpen],
            ["saved", "Saved internships", Bookmark],
            ["tracker", "Application tracker", LayoutGrid],
            ["settings", "Data & settings", Database],
          ].map(([id, label, Icon]) => {
            const I = Icon as typeof Search;
            return (
              <button
                key={String(id)}
                aria-label={String(label)}
                className={view === id ? "nav-item current" : "nav-item"}
                onClick={() => {
                  setView(String(id));
                  setPage(1);
                }}
              >
                <I size={19} />
                <span>{String(label)}</span>
                {id === "saved" && saved.length > 0 && <b>{saved.length}</b>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={23} />
          <div>
            <strong>Yours. On your device.</strong>
            <p>
              Local SQLite storage.
              <br />
              No cloud account required.
            </p>
          </div>
        </div>
        <small>INTERNSHIP FINDER · PERSONAL WORKSPACE</small>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span>
            <span className="live-dot" />
            Local workspace
          </span>
          <span className="topbar-note">
            Find possibilities. Keep perspective.
          </span>
          <button
            className="secondary small"
            onClick={() => setImportOpen(true)}
          >
            <Upload size={15} />
            Import listings
          </button>
        </header>
        {error && (
          <div role="alert" className="error-banner">
            <AlertCircle size={18} />
            {error}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {view !== "settings" && view !== "iwsp" && (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow">
                  {view === "all"
                    ? "EXPLORE YOUR OPTIONS"
                    : view === "saved"
                      ? "KEEP THE GOOD ONES"
                      : "ONE STEP AT A TIME"}
                </p>
                <h1>
                  {view === "all"
                    ? "All internships"
                    : view === "saved"
                      ? "Saved internships"
                      : "Application tracker"}
                </h1>
                <p>
                  {view === "all"
                    ? "Every imported opportunity. Your filters, when you need them."
                    : view === "saved"
                      ? "A considered shortlist, with your notes and next steps."
                      : "A little structure for the next big thing."}
                </p>
              </div>
              <button className="primary" onClick={() => setEditor("new")}>
                <Plus size={17} />
                Add internship
              </button>
            </section>
            <section className="overview">
              <div className="metric">
                <span>IN YOUR WORKSPACE</span>
                <strong>
                  {data.jobs.length}
                  <small>internships</small>
                </strong>
                <p>All imported listings are kept</p>
              </div>
              <div className="metric">
                <span>YOUR SHORTLIST</span>
                <strong>
                  {saved.length}
                  <small>saved</small>
                </strong>
                <p>Independent of search filters</p>
              </div>
              <div className="metric">
                <span>IN PROGRESS</span>
                <strong>
                  {
                    data.jobs.filter(
                      (j) =>
                        !["Not Started", "Rejected", "Withdrawn"].includes(
                          j.status,
                        ),
                    ).length
                  }
                  <small>applications</small>
                </strong>
                <p>Progress stays on this device</p>
              </div>
              <div className="insight">
                <CalendarDays size={23} />
                <div>
                  <strong>Dates deserve a closer look.</strong>
                  <p>
                    Posting dates and placement dates are different. Missing
                    details stay unknown.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
        {(view === "all" || view === "saved") && (
          <>
            <section className="search-panel">
              <div className="search-top">
                <div className="search-input">
                  <Search size={19} />
                  <input
                    aria-label="Search internships"
                    placeholder="Search titles, companies, or descriptions…"
                    value={filters.search}
                    onChange={(e) => change("search", e.target.value)}
                  />
                  {filters.search && (
                    <button
                      aria-label="Clear search"
                      onClick={() => change("search", "")}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <button
                  className={"secondary " + (advanced ? "selected" : "")}
                  onClick={() => setAdvanced(!advanced)}
                >
                  <SlidersHorizontal size={17} />
                  Date & duration
                </button>
                <button className="text-button" onClick={reset}>
                  <RotateCcw size={15} />
                  Reset all{activeCount > 0 ? ` (${activeCount})` : ""}
                </button>
              </div>
              <div className="filter-row">
                <Multi
                  label="Level"
                  values={levels}
                  selected={filters.levels}
                  onChange={(v) => change("levels", v)}
                />
                <Multi
                  label="Category"
                  values={categories}
                  selected={filters.categories}
                  onChange={(v) => change("categories", v)}
                />
                <Multi
                  label="Location"
                  values={locations}
                  selected={filters.locations}
                  onChange={(v) => change("locations", v)}
                />
                <select
                  aria-label="Posting recency"
                  value={filters.recency}
                  onChange={(e) =>
                    change("recency", e.target.value as Filters["recency"])
                  }
                >
                  <option value="any">Any time</option>
                  <option value="24h">Last 24 hours</option>
                  <option value="3d">Last 3 days</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
                <select
                  aria-label="Saved status"
                  value={filters.saved}
                  onChange={(e) =>
                    change("saved", e.target.value as Filters["saved"])
                  }
                >
                  <option value="all">All Jobs</option>
                  <option value="saved">Saved</option>
                  <option value="not-saved">Not saved</option>
                </select>
                <Multi
                  label="Application status"
                  values={data.statuses}
                  selected={filters.statuses}
                  onChange={(v) => change("statuses", v)}
                />
                <Multi
                  label="Availability"
                  values={["unverified", "available", "expired", "unavailable"]}
                  selected={filters.availability}
                  onChange={(v) => change("availability", v)}
                />
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={filters.includeUndated}
                    onChange={(e) => change("includeUndated", e.target.checked)}
                  />
                  Include undated
                </label>
              </div>
              <div className="preset-strip">
                <CalendarDays size={17} />
                <select
                  aria-label="Saved filter preset"
                  value={presetChoice || data.presets[0]?.id || ""}
                  onChange={(e) => setPresetChoice(e.target.value)}
                >
                  {data.presets.length === 0 && (
                    <option value="">No saved presets</option>
                  )}
                  {data.presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  className="text-button"
                  disabled={!data.presets.length}
                  onClick={() => {
                    const p = data.presets.find(
                      (p) => p.id === (presetChoice || data.presets[0]?.id),
                    );
                    if (p) selectPreset(p);
                  }}
                >
                  {active?.id === (presetChoice || data.presets[0]?.id)
                    ? "Deactivate preset"
                    : "Activate preset"}
                </button>
                <span className="grow" />
                <button
                  className="text-button"
                  onClick={() => setPresetDialog(true)}
                >
                  Save current filters
                </button>
              </div>
              {active && (
                <div className="active-notice">
                  <CheckCircle2 size={15} />
                  {active.name}
                  <span>
                    Requires coverage of the full placement. Short overlaps are
                    not confirmed matches.
                  </span>
                </div>
              )}
              {advanced && (
                <div className="advanced">
                  <div className="advanced-title">
                    <h3>Date & duration filters</h3>
                    <button
                      className="text-button"
                      onClick={() => {
                        const b = blankFilters();
                        setFilters((f) => ({
                          ...f,
                          ...Object.fromEntries(
                            [
                              "startMin",
                              "startMax",
                              "startMonth",
                              "endMin",
                              "endMax",
                              "endMonth",
                              "startKind",
                              "endKind",
                              "minMonths",
                              "maxMonths",
                              "exactMonths",
                              "includeUnknownDates",
                              "includeUnknownDuration",
                              "periodStart",
                              "periodEnd",
                              "relation",
                              "matchStatuses",
                            ].map((k) => [k, b[k as keyof Filters]]),
                          ),
                        }));
                      }}
                    >
                      Reset dates
                    </button>
                  </div>
                  <div className="advanced-grid">
                    {(["start", "end"] as const).map((k) => (
                      <fieldset key={k}>
                        <legend>Internship {k} date</legend>
                        <div className="two-col">
                          <Field label="Earliest">
                            <input
                              type="date"
                              value={filters[`${k}Min`]}
                              onChange={(e) =>
                                change(`${k}Min`, e.target.value)
                              }
                            />
                          </Field>
                          <Field label="Latest">
                            <input
                              type="date"
                              value={filters[`${k}Max`]}
                              onChange={(e) =>
                                change(`${k}Max`, e.target.value)
                              }
                            />
                          </Field>
                        </div>
                        <Field label="Specific month">
                          <input
                            type="month"
                            value={filters[`${k}Month`]}
                            onChange={(e) =>
                              change(`${k}Month`, e.target.value)
                            }
                          />
                        </Field>
                        <select
                          aria-label={`${k} date information`}
                          value={filters[`${k}Kind`]}
                          onChange={(e) =>
                            change(
                              `${k}Kind`,
                              e.target.value as Filters["startKind"],
                            )
                          }
                        >
                          <option value="any">Any date information</option>
                          <option value="known">Known dates only</option>
                          <option value="flexible">
                            Explicitly flexible dates
                          </option>
                          <option value="unknown">Unknown dates only</option>
                        </select>
                      </fieldset>
                    ))}
                    <fieldset>
                      <legend>Duration in calendar months</legend>
                      <div className="two-col">
                        <Field label="Minimum">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={filters.minMonths}
                            onChange={(e) =>
                              change("minMonths", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Maximum">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={filters.maxMonths}
                            onChange={(e) =>
                              change("maxMonths", e.target.value)
                            }
                          />
                        </Field>
                      </div>
                      <Field label="Exact duration">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={filters.exactMonths}
                          onChange={(e) =>
                            change("exactMonths", e.target.value)
                          }
                        />
                      </Field>
                      <div className="duration-chips">
                        {[3, 6, 9, 12].map((n) => (
                          <button
                            key={n}
                            className={
                              filters.exactMonths === String(n)
                                ? "selected"
                                : ""
                            }
                            onClick={() =>
                              change(
                                "exactMonths",
                                filters.exactMonths === String(n)
                                  ? ""
                                  : String(n),
                              )
                            }
                          >
                            {n} mo
                          </button>
                        ))}
                      </div>
                      <p className="hint">
                        Unanchored week durations stay unknown in month
                        comparisons.
                      </p>
                    </fieldset>
                    <fieldset>
                      <legend>Required placement period</legend>
                      <div className="two-col">
                        <Field label="From">
                          <input
                            type="date"
                            value={filters.periodStart}
                            onChange={(e) =>
                              change("periodStart", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Through">
                          <input
                            type="date"
                            value={filters.periodEnd}
                            onChange={(e) =>
                              change("periodEnd", e.target.value)
                            }
                          />
                        </Field>
                      </div>
                      <select
                        aria-label="Date relationship"
                        value={filters.relation}
                        onChange={(e) =>
                          change(
                            "relation",
                            e.target.value as Filters["relation"],
                          )
                        }
                      >
                        <option value="all">Any relationship</option>
                        <option value="covers">
                          Fully covers required period
                        </option>
                        <option value="overlaps">Partially overlaps</option>
                        <option value="outside">Outside required period</option>
                        <option value="unknown">Not enough information</option>
                      </select>
                      <Multi
                        label="Compatibility"
                        values={Object.keys(matchNames)}
                        selected={filters.matchStatuses}
                        onChange={(v) =>
                          change("matchStatuses", v as Filters["matchStatuses"])
                        }
                      />
                    </fieldset>
                  </div>
                  <div className="advanced-footer">
                    <label>
                      <input
                        type="checkbox"
                        checked={filters.includeUnknownDates}
                        onChange={(e) =>
                          change("includeUnknownDates", e.target.checked)
                        }
                      />
                      Include unknown dates in date comparisons
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={filters.includeUnknownDuration}
                        onChange={(e) =>
                          change("includeUnknownDuration", e.target.checked)
                        }
                      />
                      Include unknown duration
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={filters.prioritizeSoftware}
                        onChange={(e) =>
                          change("prioritizeSoftware", e.target.checked)
                        }
                      />
                      Prioritize software in relevance sorting
                    </label>
                  </div>
                </div>
              )}
            </section>
            <div className="results-heading">
              <div>
                <strong>{filtered.length.toLocaleString()}</strong>{" "}
                {filtered.length === 1 ? "opportunity" : "opportunities"}
                <span>
                  {" "}
                  · {activeCount ? "Filtered view" : "All imported listings"}
                </span>
              </div>
              <select
                aria-label="Sort internships"
                value={filters.sort}
                onChange={(e) =>
                  change("sort", e.target.value as Filters["sort"])
                }
              >
                <option value="newest">Newest added</option>
                <option value="oldest">Oldest added</option>
                <option value="company">Company name A–Z</option>
                <option value="relevance">Placement relevance</option>
              </select>
            </div>
            {filters.periodStart && filters.periodEnd && (
              <p className="match-summary" role="status">
                Placement coverage:{" "}
                {
                  filtered.filter(
                    (j) =>
                      compatibility(j, filters.periodStart, filters.periodEnd)
                        .status === "confirmed",
                  ).length
                }{" "}
                confirmed ·{" "}
                {
                  filtered.filter(
                    (j) =>
                      compatibility(j, filters.periodStart, filters.periodEnd)
                        .status === "potential",
                  ).length
                }{" "}
                potential ·{" "}
                {
                  filtered.filter(
                    (j) =>
                      compatibility(j, filters.periodStart, filters.periodEnd)
                        .status === "unknown",
                  ).length
                }{" "}
                insufficient information ·{" "}
                {
                  filtered.filter(
                    (j) =>
                      compatibility(j, filters.periodStart, filters.periodEnd)
                        .status === "incompatible",
                  ).length
                }{" "}
                incompatible
              </p>
            )}
            <div className="table-card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="save-col">
                        <Bookmark size={16} />
                      </th>
                      <th>COMPANY & OPPORTUNITY</th>
                      <th>LEVEL / CATEGORY</th>
                      <th>LOCATION</th>
                      <th>PLACEMENT DATES</th>
                      <th>DURATION</th>
                      <th>POSTED</th>
                      <th>LINK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((j) => (
                      <tr key={j.id}>
                        <td>
                          <button
                            className={
                              "bookmark-button " + (j.saved ? "is-saved" : "")
                            }
                            aria-label={
                              (j.saved ? "Unsave " : "Save ") + j.title
                            }
                            onClick={() => void toggleSave(j)}
                          >
                            <Bookmark
                              size={19}
                              fill={j.saved ? "currentColor" : "none"}
                            />
                          </button>
                        </td>
                        <td>
                          <div className="opportunity">
                            <span className="company-avatar">
                              {j.company
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((x) => x[0])
                                .join("")
                                .toUpperCase()}
                            </span>
                            <div>
                              <button
                                className="company-link"
                                onClick={() => setCompany(j.company)}
                              >
                                {j.company}
                              </button>
                              <button
                                className="role-link"
                                onClick={() => setSelected(j)}
                              >
                                {j.title}
                              </button>
                              <span
                                className={"listing-state " + j.availability}
                              >
                                {j.availability === "unverified"
                                  ? "Availability unverified"
                                  : j.availability}
                              </span>
                              <span className="source-meta">
                                {j.source} · Checked {j.verifiedAt ?? "not yet"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="cell-tags">
                            {j.levels.map((l) => (
                              <span className="tag" key={l}>
                                {l}
                              </span>
                            ))}
                            {j.categories.map((c) => (
                              <span className="category-text" key={c}>
                                {c}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="location-cell">
                          {j.locations.join(" · ") || "Not stated"}
                        </td>
                        <td>
                          <div className="date-cell">
                            <span>{formatDate(j.start.value)}</span>
                            <small>to {formatDate(j.end.value)}</small>
                            {hasConflict(j) ? (
                              <b className="warning-text">
                                Conflicting evidence
                              </b>
                            ) : (
                              j.start.flexible && (
                                <b className="subtle-green">Flexible dates</b>
                              )
                            )}
                            {filters.periodStart && filters.periodEnd && (
                              <span
                                className={
                                  "match-chip " +
                                  compatibility(
                                    j,
                                    filters.periodStart,
                                    filters.periodEnd,
                                  ).status
                                }
                              >
                                {
                                  matchNames[
                                    compatibility(
                                      j,
                                      filters.periodStart,
                                      filters.periodEnd,
                                    ).status
                                  ]
                                }
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            className={
                              j.duration.min === null && j.duration.max === null
                                ? "unknown-value"
                                : "duration-value"
                            }
                          >
                            {durationText(j)}
                          </span>
                        </td>
                        <td className="posted-cell">
                          {j.postedAt ?? "Undated"}
                        </td>
                        <td>
                          {j.url && (
                            <a
                              className="external-link"
                              href={j.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={"Employer listing for " + j.title}
                            >
                              <ArrowUpRight size={19} />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!ready ? (
                  <div className="empty">Opening your local workspace…</div>
                ) : (
                  filtered.length === 0 && (
                    <div className="empty">
                      <FolderOpen size={34} />
                      <h3>
                        {data.jobs.length
                          ? "No internships match these filters"
                          : "A fresh start"}
                      </h3>
                      <p>
                        {data.jobs.length
                          ? "Try including unknown dates or resetting your filters. Your saved internships are still here."
                          : "Import CSV or JSON, or add an internship manually. No vacancies are fabricated."}
                      </p>
                      <button
                        className="secondary"
                        onClick={() =>
                          data.jobs.length ? reset() : setImportOpen(true)
                        }
                      >
                        {data.jobs.length
                          ? "Reset filters"
                          : "Import your listings"}
                      </button>
                    </div>
                  )
                )}
              </div>
              <footer className="table-footer">
                <span>
                  Showing {filtered.length ? (safePage - 1) * 25 + 1 : 0}–
                  {Math.min(safePage * 25, filtered.length)} of{" "}
                  {filtered.length}
                </span>
                <div className="pagination">
                  <button
                    aria-label="Previous page"
                    disabled={safePage === 1}
                    onClick={() => setPage(safePage - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    Page {safePage} of {pages}
                  </span>
                  <button
                    aria-label="Next page"
                    disabled={safePage === pages}
                    onClick={() => setPage(safePage + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </footer>
            </div>
          </>
        )}
        {view === "iwsp" && (
          <IWSPJobs
            jobs={data.jobs}
            statuses={data.statuses}
            reload={reload}
            onDetails={setSelected}
            onBookmark={toggleSave}
          />
        )}
        {view === "tracker" && (
          <>
            <div className="section-note">
              <Bookmark size={17} />
              Save an internship to start tracking it. Reminders are local dates
              shown here; the app does not send notifications.
            </div>
            <div className="kanban">
              {data.statuses.map((s) => (
                <section className="kanban-column" key={s}>
                  <h3>
                    {s}
                    <span>{tracked.filter((j) => j.status === s).length}</span>
                  </h3>
                  {tracked
                    .filter((j) => j.status === s)
                    .map((j) => (
                      <article className="kanban-card" key={j.id}>
                        <button
                          className="company-link"
                          onClick={() => setSelected(j)}
                        >
                          {j.company}
                        </button>
                        <button
                          className="role-link"
                          onClick={() => setSelected(j)}
                        >
                          {j.title}
                        </button>
                        <p>{j.locations.join(", ")}</p>
                        <select
                          aria-label={"Status for " + j.title}
                          value={j.status}
                          onChange={(e) =>
                            void act(() =>
                              api(`/jobs/${j.id}/tracking`, "PATCH", {
                                status: e.target.value,
                              }),
                            )
                          }
                        >
                          {data.statuses.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        {j.reminder && (
                          <small className="reminder">
                            <CalendarDays size={13} />
                            Next step · {j.reminder}
                          </small>
                        )}
                        {j.labels.length > 0 && (
                          <p>
                            {j.labels.map((l) => (
                              <span className="tag" key={l}>
                                {l}
                              </span>
                            ))}
                          </p>
                        )}
                      </article>
                    ))}
                </section>
              ))}
            </div>
            {tracked.length === 0 && (
              <div className="empty">
                <LayoutGrid size={34} />
                <h3>Your next steps, all in one place</h3>
                <p>
                  Save an opportunity from All internships to add it to the
                  board.
                </p>
                <button className="secondary" onClick={() => setView("all")}>
                  Explore internships
                </button>
              </div>
            )}
          </>
        )}
        {view === "settings" && (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow">A WORKSPACE YOU OWN</p>
                <h1>Data & settings</h1>
                <p>
                  Your listings, preferences, and application history stay
                  local.
                </p>
              </div>
            </section>
            <div className="settings-grid">
              <section className="settings-card">
                <span className="card-icon">
                  <Database />
                </span>
                <h2>Bring your opportunities</h2>
                <p>
                  Import CSV or JSON from a permitted source. Re-import an
                  updated file to refresh listings without losing notes or
                  application stages.
                </p>
                <button className="primary" onClick={() => setImportOpen(true)}>
                  <Upload size={16} />
                  Import or refresh
                </button>
                <button className="secondary" onClick={() => setEditor("new")}>
                  <Plus size={16} />
                  Manual entry
                </button>
                <a className="secondary" href="/api/export">
                  <Download size={16} />
                  Export all CSV
                </a>
                <p className="hint">
                  CSV exports include personal tracking columns. Restoring those
                  fields requires a full backup.
                </p>
              </section>
              <section className="settings-card">
                <span className="card-icon">
                  <ShieldCheck />
                </span>
                <h2>Back up your workspace</h2>
                <p>
                  Versioned JSON backups include listings, source evidence,
                  notes, labels, stages, filters and presets. Restore replaces
                  the local workspace atomically.
                </p>
                <a className="primary" href="/api/backup">
                  <Download size={16} />
                  Download backup
                </a>
                <label className="secondary file-button">
                  <RotateCcw size={16} />
                  Restore backup
                  <input
                    type="file"
                    accept=".json"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (
                        !confirm(
                          "Replace this local workspace with the backup? A pre-restore copy will be kept locally.",
                        )
                      )
                        return;
                      try {
                        const value = JSON.parse(await f.text());
                        await act(
                          () => api("/restore", "POST", value),
                          "Backup restored",
                        );
                        reset();
                      } catch (err) {
                        setError((err as Error).message);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              </section>
              <section className="settings-card">
                <h2>Saved filters & presets</h2>
                <p>
                  Nothing is excluded by default. Save a preferred view
                  explicitly to load it at the next local startup.
                </p>
                <button
                  className="secondary"
                  onClick={() =>
                    void act(
                      () => api("/preferences", "PUT", filters),
                      "Current filters saved as startup preferences",
                    )
                  }
                >
                  <Check size={16} />
                  Save current view as startup preference
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    void act(
                      () => api("/preferences", "PUT", blankFilters()),
                      "Startup preference reset to all listings",
                    )
                  }
                >
                  Default to all listings
                </button>
                {data.presets.map((p) => (
                  <div className="preset-management" key={p.id}>
                    <button
                      className="text-button"
                      onClick={() => {
                        setFilters(p.filters);
                        setActive(p);
                        setView("all");
                        setAdvanced(true);
                      }}
                    >
                      {p.name}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={"Edit preset " + p.name}
                      onClick={() => {
                        setFilters(p.filters);
                        setActive(p);
                        setPresetDialog(true);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={"Delete preset " + p.name}
                      onClick={() =>
                        void act(async () => {
                          await api("/presets/" + p.id, "DELETE");
                          if (active?.id === p.id) reset();
                        }, "Preset removed")
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </section>
              <section className="settings-card">
                <h2>Listing sources</h2>
                <p>
                  Browser-assisted files, manual records, and permitted public
                  exports are supported. There is no background Jorb scraper and
                  no browser credentials are collected.
                </p>
                {data.sources.length === 0 ? (
                  <p className="hint">
                    Sources will appear after your first import.
                  </p>
                ) : (
                  data.sources.map((s) => (
                    <div className="source-row" key={s.id}>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {s.count} listings · imported{" "}
                          {s.lastImported?.slice(0, 10)}
                        </small>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setImportOpen(true)}
                      >
                        Refresh from file
                      </button>
                    </div>
                  ))
                )}
              </section>
            </div>
          </>
        )}
        <footer className="workspace-footer">
          <span>Built for a thoughtful search.</span>
          <span>
            <ShieldCheck size={13} />
            Stored on this device · SQLite
          </span>
        </footer>
      </main>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      {detail && (
        <Details
          job={detail}
          statuses={data.statuses}
          filters={filters}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditor(detail);
            setSelected(null);
          }}
          onSave={(patch) =>
            act(() => api(`/jobs/${detail.id}/tracking`, "PATCH", patch))
          }
          onBookmark={() => void toggleSave(detail)}
        />
      )}
      {editor && (
        <Editor
          job={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSubmit={async (row) => {
            const result = await act(
              () =>
                api(
                  editor === "new" ? "/jobs" : "/jobs/" + editor.id,
                  editor === "new" ? "POST" : "PUT",
                  row,
                ),
              "Listing saved locally",
            );
            if (result) setEditor(null);
          }}
        />
      )}
      {company && (
        <Modal title={company} wide onClose={() => setCompany(null)}>
          <div className="modal-body">
            <p className="hint">
              {data.jobs.filter((j) => j.company === company).length} imported
              opportunities · all local records
            </p>
            {data.jobs
              .filter((j) => j.company === company)
              .map((j) => (
                <button
                  key={j.id}
                  className="company-job"
                  onClick={() => {
                    setCompany(null);
                    setSelected(j);
                  }}
                >
                  <strong>{j.title}</strong>
                  <span>
                    {j.locations.join(", ")} · {j.levels.join(", ")}
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImport={async (content, format) => {
            const result = await act(
              () => api("/import", "POST", { content, format }),
              "Import complete",
            );
            if (result) {
              notify(
                `${result.inserted} added · ${result.updated} updated · tracking preserved`,
              );
              setImportOpen(false);
            }
          }}
        />
      )}
      {presetDialog && (
        <PresetDialog
          active={active}
          filters={filters}
          onClose={() => setPresetDialog(false)}
          onSave={async (p) => {
            const r = await act(
              () => api("/presets", "POST", p),
              "Filter preset saved",
            );
            if (r) {
              setPresetDialog(false);
              setActive(p);
            }
          }}
        />
      )}
    </div>
  );
}

function Details({
  job: j,
  statuses,
  filters,
  onClose,
  onEdit,
  onSave,
  onBookmark,
}: {
  job: Job;
  statuses: string[];
  filters: Filters;
  onClose: () => void;
  onEdit: () => void;
  onSave: (p: any) => Promise<any>;
  onBookmark: () => void;
}) {
  const [notes, setNotes] = useState(j.notes),
    [labels, setLabels] = useState(j.labels.join("; ")),
    [status, setStatus] = useState(j.status),
    [custom, setCustom] = useState(""),
    [reminder, setReminder] = useState(j.reminder ?? ""),
    [deadline, setDeadline] = useState(j.deadline ?? "");
  const c = compatibility(j, filters.periodStart, filters.periodEnd);
  return (
    <Modal title="Internship details" wide onClose={onClose}>
      <div className="modal-body detail-body">
        <div className="detail-title">
          <span className="company-avatar large">
            {j.company.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="eyebrow">{j.company}</p>
            <h2>{j.title}</h2>
            <p>
              {j.locations.join(" · ")} · {j.levels.join(" · ")}
            </p>
          </div>
        </div>
        <div className="detail-actions">
          <button
            className={j.saved ? "secondary selected" : "secondary"}
            onClick={onBookmark}
          >
            <Bookmark size={16} />
            {j.saved ? "Saved locally" : "Save internship"}
          </button>
          {!j.readyTalent && (
            <button className="secondary" onClick={onEdit}>
              <Pencil size={16} />
              Edit facts
            </button>
          )}
          {j.url && (
            <a
              className="primary"
              href={j.url}
              target="_blank"
              rel="noreferrer"
            >
              {j.readyTalent ? "Find in ReadyTalent" : "Employer listing"}
              <ArrowUpRight size={16} />
            </a>
          )}
        </div>
        <div className="facts-grid">
          <div>
            <span>INTERNSHIP START</span>
            <strong>{formatDate(j.start.value)}</strong>
            <small>
              {j.start.flexible ? "Explicitly flexible · " : ""}
              {j.start.precision} precision · {j.start.certainty}
            </small>
          </div>
          <div>
            <span>INTERNSHIP END</span>
            <strong>{formatDate(j.end.value)}</strong>
            <small>
              {j.end.precision} precision · {j.end.certainty}
            </small>
          </div>
          <div>
            <span>ADVERTISED DURATION</span>
            <strong>{durationText(j)}</strong>
            <small>
              {j.duration.qualifier} · {j.duration.certainty}
            </small>
          </div>
        </div>
        {hasConflict(j) && (
          <p className="warning-box">
            The recorded dates and duration conflict. Verify the evidence before
            using them to confirm a match.
          </p>
        )}
        <div className={"compatibility-box " + c.status}>
          <strong>{matchNames[c.status]}</strong>
          <p>{c.explanation}</p>
        </div>
        <div className="detail-columns">
          <section>
            <h3>About this opportunity</h3>
            <div className="description">
              {j.description ||
                "A full description was not collected. Visit the source or add it through Edit facts. No description has been fabricated."}
            </div>
            {j.skills.length > 0 && (
              <>
                <h3>Skills</h3>
                <p>{j.skills.join(" · ")}</p>
              </>
            )}
            {j.eligibility && (
              <>
                <h3>Eligibility</h3>
                <p className="description">{j.eligibility}</p>
              </>
            )}
            {j.readyTalent && (
              <details className="source-metadata">
                <summary>Full original source fields</summary>
                <p className="hint">
                  The portal details route depends on browser context. Use the
                  source ID to verify the correct listing after opening
                  ReadyTalent search.
                </p>
                <dl className="metadata">
                  {Object.entries(j.readyTalent).map(([key, value]) => (
                    <React.Fragment key={key}>
                      <dt>{key.replaceAll("_", " ")}</dt>
                      <dd className="description">
                        {value == null
                          ? "Not stated"
                          : typeof value === "object"
                            ? JSON.stringify(value, null, 2)
                            : String(value)}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              </details>
            )}
            <h3>Date evidence & provenance</h3>
            {[j.start.evidence, j.end.evidence, j.duration.evidence, j.evidence]
              .filter((x, i, a) => x && a.indexOf(x) === i)
              .map((e, i) => (
                <blockquote key={i}>{e}</blockquote>
              ))}
            <dl className="metadata">
              <dt>Source</dt>
              <dd>{j.source}</dd>
              <dt>Source page</dt>
              <dd>
                {j.sourceUrl ? (
                  <a href={j.sourceUrl} target="_blank" rel="noreferrer">
                    {j.sourceUrl}
                  </a>
                ) : (
                  "Not stated"
                )}
              </dd>
              <dt>
                {j.readyTalent ? "ReadyTalent search URL" : "Employer URL"}
              </dt>
              <dd>
                {j.url ? (
                  <a href={j.url} target="_blank" rel="noreferrer">
                    {j.url}
                  </a>
                ) : (
                  "Not stated"
                )}
              </dd>
              <dt>Posted</dt>
              <dd>{formatDate(j.postedAt)} (not the internship start)</dd>
              <dt>Collected</dt>
              <dd>{j.collectedAt.slice(0, 10)}</dd>
              <dt>Last verified</dt>
              <dd>{formatDate(j.verifiedAt)}</dd>
              <dt>Availability</dt>
              <dd>{j.availability}</dd>
            </dl>
          </section>
          <form
            className="tracking-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await onSave({
                saved: true,
                status: custom.trim() || status,
                notes,
                labels: labels
                  .split(";")
                  .map((s) => s.trim())
                  .filter(Boolean),
                reminder,
                deadline,
              });
            }}
          >
            <h3>Your application</h3>
            <p className="hint">
              Private to this device. Never sent to the employer.
            </p>
            <Field label="Stage">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Or a custom stage">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. Recruiter call"
                maxLength={80}
              />
            </Field>
            <Field label="Personal labels (semicolon-separated)">
              <input
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                placeholder="Priority; Research"
              />
            </Field>
            <Field label="Notes">
              <textarea
                rows={6}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What stands out? What needs checking?"
              />
            </Field>
            <Field label="Next-step reminder">
              <input
                type="date"
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
              />
            </Field>
            <Field label="Application deadline">
              <input
                type="text"
                placeholder="YYYY-MM or YYYY-MM-DD"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </Field>
            <button className="primary" type="submit">
              <Check size={16} />
              Save tracking
            </button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

function Editor({
  job,
  onClose,
  onSubmit,
}: {
  job: Job | null;
  onClose: () => void;
  onSubmit: (row: any) => Promise<void>;
}) {
  const [draft, setDraft] = useState<any>(
    job ?? {
      company: "",
      title: "",
      description: "",
      locations: [],
      categories: [],
      levels: [],
      url: "",
      source: "Manual entry",
      postedAt: "",
      verifiedAt: "",
      availability: "unverified",
      start: emptyDate(),
      end: emptyDate(),
      duration: emptyDuration(),
      skills: [],
      eligibility: "",
      evidence: "",
    },
  );
  const set = (key: string, value: any) =>
    setDraft((d: any) => ({ ...d, [key]: value }));
  const [listText, setListText] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ["locations", "categories", "levels", "skills"].map((k) => [
        k,
        (job?.[k as "locations"] ?? []).join("; "),
      ]),
    ),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit({ ...draft, ...listText });
  };
  return (
    <Modal
      title={job ? "Edit listing facts" : "Add an internship"}
      wide
      onClose={onClose}
    >
      <form className="modal-body editor-form" onSubmit={submit}>
        <p className="hint">
          Only enter facts you have. Empty dates and durations remain unknown.
        </p>
        <div className="two-col">
          {[
            ["company", "Company"],
            ["title", "Job title"],
          ].map(([k, l]) => (
            <Field key={k} label={l}>
              <input
                required
                value={draft[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </Field>
          ))}
          {[
            ["locations", "Locations"],
            ["categories", "Categories"],
            ["levels", "Levels"],
            ["skills", "Skills"],
          ].map(([k, l]) => (
            <Field key={k} label={l + " (semicolon-separated)"}>
              <input
                value={listText[k]}
                onChange={(e) =>
                  setListText((v) => ({ ...v, [k]: e.target.value }))
                }
              />
            </Field>
          ))}
          <Field label="Employer application link">
            <input
              type="url"
              value={draft.url}
              onChange={(e) => set("url", e.target.value)}
            />
          </Field>
          <Field label="Source name">
            <input
              value={draft.source}
              onChange={(e) => set("source", e.target.value)}
            />
          </Field>
          <Field label="Source page URL">
            <input
              type="url"
              value={draft.sourceUrl ?? ""}
              onChange={(e) => set("sourceUrl", e.target.value)}
            />
          </Field>
          <Field label="Posting date">
            <input
              type="date"
              value={draft.postedAt ?? ""}
              onChange={(e) => set("postedAt", e.target.value)}
            />
          </Field>
          <Field label="Last verified">
            <input
              type="date"
              value={draft.verifiedAt ?? ""}
              onChange={(e) => set("verifiedAt", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            rows={5}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <div className="two-col">
          {(["start", "end"] as const).map((k) => (
            <Field
              key={k}
              label={"Internship " + k + " (YYYY, YYYY-MM or YYYY-MM-DD)"}
            >
              <input
                value={draft[k].value ?? ""}
                onChange={(e) =>
                  set(k, { ...draft[k], value: e.target.value || null })
                }
              />
            </Field>
          ))}
        </div>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={draft.start.flexible}
            onChange={(e) => {
              set("start", { ...draft.start, flexible: e.target.checked });
              set("end", { ...draft.end, flexible: e.target.checked });
            }}
          />
          Source explicitly offers flexible dates
        </label>
        <div className="two-col">
          {(["start", "end"] as const).map((k) => (
            <div key={k}>
              <Field
                label={`${k === "start" ? "Start" : "End"} date evidence quality`}
              >
                <select
                  value={draft[k].certainty}
                  onChange={(e) =>
                    set(k, { ...draft[k], certainty: e.target.value })
                  }
                >
                  <option value="unknown">Unknown</option>
                  <option value="reported">
                    Reported / not independently verified
                  </option>
                  <option value="verified">Verified against source</option>
                  <option value="inferred">Inferred</option>
                </select>
              </Field>
              <Field label={`Supporting ${k} date evidence`}>
                <textarea
                  required={draft[k].certainty === "verified"}
                  value={draft[k].evidence}
                  onChange={(e) =>
                    set(k, { ...draft[k], evidence: e.target.value })
                  }
                  placeholder="Quote the date statement and source."
                />
              </Field>
            </div>
          ))}
        </div>
        <Field label="Availability">
          <select
            value={draft.availability}
            onChange={(e) => set("availability", e.target.value)}
          >
            {["unverified", "available", "expired", "unavailable"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <div className="four-col">
          {(["min", "max"] as const).map((k) => (
            <Field
              key={k}
              label={k === "min" ? "Duration minimum" : "Duration maximum"}
            >
              <input
                type="number"
                min="0"
                step="any"
                value={draft.duration[k] ?? ""}
                onChange={(e) =>
                  set("duration", {
                    ...draft.duration,
                    [k]: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          ))}
          <Field label="Duration unit">
            <select
              value={draft.duration.unit}
              onChange={(e) =>
                set("duration", { ...draft.duration, unit: e.target.value })
              }
            >
              {["month", "week", "day"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Duration qualifier">
            <select
              value={draft.duration.qualifier}
              onChange={(e) =>
                set("duration", {
                  ...draft.duration,
                  qualifier: e.target.value,
                })
              }
            >
              {["unknown", "exact", "range", "minimum", "preferred"].map(
                (v) => (
                  <option key={v}>{v}</option>
                ),
              )}
            </select>
          </Field>
        </div>
        <Field label="Duration evidence quality">
          <select
            value={draft.duration.certainty}
            onChange={(e) =>
              set("duration", { ...draft.duration, certainty: e.target.value })
            }
          >
            {["unknown", "reported", "verified", "inferred"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Duration evidence">
          <input
            required={draft.duration.certainty === "verified"}
            value={draft.duration.evidence}
            onChange={(e) =>
              set("duration", { ...draft.duration, evidence: e.target.value })
            }
          />
        </Field>
        <Field label="Eligibility">
          <textarea
            value={draft.eligibility}
            onChange={(e) => set("eligibility", e.target.value)}
          />
        </Field>
        <div className="modal-footer">
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            <Check size={16} />
            Save listing locally
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (content: string, format: string) => Promise<void>;
}) {
  const [content, setContent] = useState(""),
    [format, setFormat] = useState("csv"),
    [busy, setBusy] = useState(false),
    [fileError, setFileError] = useState("");
  return (
    <Modal title="Import or refresh listings" onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onImport(content, format);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Bring a permitted CSV or JSON export. Existing listings are matched by
          employer URL or company, title and location. Notes, labels and stages
          are preserved.
        </p>
        <label className="dropzone">
          <Upload size={25} />
          <strong>Choose a CSV or JSON file</strong>
          <span>Or paste its contents below · 20 MB maximum</span>
          <input
            aria-label="Import file"
            type="file"
            accept=".csv,.json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 20 * 1024 * 1024) {
                setFileError("File exceeds 20 MB.");
                return;
              }
              setFileError("");
              setFormat(f.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
              setContent(await f.text());
            }}
          />
        </label>
        {fileError && <p role="alert">{fileError}</p>}
        <Field label="Format">
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </Field>
        <Field label="File contents">
          <textarea
            required
            rows={7}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              "company,title,location,url,start_date,end_date,duration_months\n"
            }
          />
        </Field>
        <p className="hint">
          Required: company and title (or role). Arrays use semicolons in CSV.
          Dates accept YYYY-MM-DD or month/year precision for internship dates.
          No Jorb credentials are needed.
        </p>
        <button
          className="primary"
          disabled={busy || !!fileError}
          type="submit"
        >
          <Upload size={16} />
          {busy ? "Importing…" : "Import listings"}
        </button>
      </form>
    </Modal>
  );
}
function PresetDialog({
  active,
  filters,
  onClose,
  onSave,
}: {
  active: Preset | null;
  filters: Filters;
  onClose: () => void;
  onSave: (p: Preset) => Promise<void>;
}) {
  const [name, setName] = useState(active?.name ?? "My saved search");
  return (
    <Modal title="Save filter preset" onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({ id: active?.id ?? crypto.randomUUID(), name, filters });
        }}
      >
        <Field label="Preset name">
          <input
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <p>
          This saves the current filters, including the placement period and
          unknown-information choices. To edit the filter values, close this
          dialog and use Date & duration.
        </p>
        <button className="primary" type="submit">
          Save preset
        </button>
      </form>
    </Modal>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
