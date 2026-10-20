import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import {
  emptyDate,
  emptyDuration,
  type DateFact,
  type DurationFact,
  type Job,
} from "../shared/model.js";
import { bounds, day } from "../shared/filter.js";
type Row = Record<string, any>;
const text = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).trim();
export const list = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map(text).filter(Boolean)
    : text(v)
        .split(/;|\n/)
        .map((s) => s.trim())
        .filter(Boolean);
export function url(value: unknown): string {
  const v = text(value);
  if (!v) return "";
  const u = new URL(v);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw Error(
      "Application/source URLs must use HTTP(S) without embedded credentials.",
    );
  return u.toString();
}
function fact(
  input: any,
  value?: unknown,
  certainty?: unknown,
  evidence?: unknown,
): DateFact {
  const f = { ...emptyDate(), ...(input ?? {}) };
  f.value = text(f.value || value) || null;
  f.precision =
    f.value?.length === 10
      ? "day"
      : f.value?.length === 7
        ? "month"
        : f.value?.length === 4
          ? "year"
          : "unknown";
  f.certainty = f.value
    ? (input?.certainty ?? certainty ?? "reported")
    : "unknown";
  f.evidence = text(input?.evidence ?? evidence);
  f.flexible = Boolean(input?.flexible);
  if (f.value && !bounds(f))
    throw Error(
      `Invalid internship date: ${f.value}. Use YYYY, YYYY-MM or YYYY-MM-DD.`,
    );
  if (!["verified", "reported", "inferred", "unknown"].includes(f.certainty))
    throw Error("Invalid date certainty.");
  return f;
}
export function normalize(row: Row, source = "Manual entry"): Omit<Job, "id"> {
  const company = text(row.company ?? row.company_name),
    title = text(row.title ?? row.role ?? row.job_title);
  if (!company || !title)
    throw Error("Every listing needs company and title (or role).");
  const d: DurationFact = { ...emptyDuration(), ...(row.duration ?? {}) };
  if (row.duration_min !== undefined && row.duration_min !== "")
    d.min = Number(row.duration_min);
  if (row.duration_max !== undefined && row.duration_max !== "")
    d.max = Number(row.duration_max);
  if (row.duration_months !== undefined && row.duration_months !== "") {
    d.min = d.max = Number(row.duration_months);
    d.qualifier = "exact";
  }
  if (row.duration_unit) d.unit = row.duration_unit;
  if (row.duration_qualifier) d.qualifier = row.duration_qualifier;
  for (const n of [d.min, d.max])
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 10000))
      throw Error("Duration must be a non-negative number.");
  if (d.min !== null && d.max !== null && d.min > d.max)
    throw Error("Minimum duration exceeds maximum duration.");
  if (!["month", "week", "day"].includes(d.unit))
    throw Error("Duration unit must be month, week or day.");
  if (
    !["exact", "range", "minimum", "preferred", "unknown"].includes(d.qualifier)
  )
    throw Error("Invalid duration qualifier.");
  if ((d.min !== null || d.max !== null) && d.qualifier === "unknown")
    d.qualifier =
      d.max === d.min ? "exact" : d.max === null ? "minimum" : "range";
  if (d.min !== null && d.certainty === "unknown") d.certainty = "reported";
  if (row.duration_evidence) d.evidence = text(row.duration_evidence);
  if (row.duration_certainty) d.certainty = row.duration_certainty;
  if (!["verified", "reported", "inferred", "unknown"].includes(d.certainty))
    throw Error("Invalid duration certainty.");
  const posted =
    text(row.postedAt ?? row.posting_date ?? row.posted_date) || null;
  if (posted && day(posted) === null)
    throw Error("Posting date must use YYYY-MM-DD.");
  return {
    company,
    title,
    description: text(row.description),
    categories: list(row.categories ?? row.category),
    levels: list(row.levels ?? row.level),
    locations: list(row.locations ?? row.location),
    postedAt: posted,
    url: url(row.url ?? row.job_url ?? row.application_link),
    source: text(row.source) || source,
    sourceUrl: url(row.sourceUrl ?? row.source_url),
    collectedAt: text(row.collectedAt) || new Date().toISOString(),
    verifiedAt: text(row.verifiedAt ?? row.last_verified) || null,
    availability: ["available", "expired", "unavailable"].includes(
      row.availability,
    )
      ? row.availability
      : "unverified",
    start: fact(
      row.start,
      row.start_date,
      row.start_certainty ?? row.date_certainty,
      row.date_evidence,
    ),
    end: fact(
      row.end,
      row.end_date,
      row.end_certainty ?? row.date_certainty,
      row.date_evidence,
    ),
    duration: d,
    skills: list(row.skills),
    eligibility: text(row.eligibility),
    notes: "",
    labels: [],
    saved: false,
    status: "Not Started",
    reminder: null,
    deadline: text(row.deadline) || null,
    evidence: text(row.evidence),
    aliases: list(row.aliases),
  };
}
export function readImport(input: any, format = "json"): Omit<Job, "id">[] {
  let rows: any[];
  if (format === "csv") {
    rows = parse(String(input).replace(/^\uFEFF/, ""), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });
  } else {
    const data = typeof input === "string" ? JSON.parse(input) : input;
    rows = Array.isArray(data)
      ? data
      : (data.listings ?? data.jobs ?? data.candidates);
    if (!Array.isArray(rows))
      throw Error(
        "JSON must be an array or contain listings, jobs, or candidates.",
      );
  }
  if (rows.length > 10000)
    throw Error("Import at most 10,000 listings per batch.");
  return rows.map((r, i) => {
    try {
      return normalize(
        r.internship_period || r.advertised_duration
          ? investigationFacts(r, r)
          : r,
        format === "csv" ? "CSV import" : "JSON import",
      );
    } catch (e) {
      throw Error(`Row ${i + 1}: ${(e as Error).message}`);
    }
  });
}
export function exportCsv(jobs: Job[]): string {
  const safe = (v: unknown) =>
    typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return (
    "\uFEFF" +
    stringify(
      jobs.map((j) =>
        Object.fromEntries(
          Object.entries({
            company: j.company,
            title: j.title,
            description: j.description,
            category: j.categories.join(";"),
            level: j.levels.join(";"),
            location: j.locations.join(";"),
            posting_date: j.postedAt,
            url: j.url,
            source: j.source,
            source_url: j.sourceUrl,
            start_date: j.start.value,
            end_date: j.end.value,
            duration_min: j.duration.min,
            duration_max: j.duration.max,
            duration_unit: j.duration.unit,
            duration_qualifier: j.duration.qualifier,
            start_certainty: j.start.certainty,
            end_certainty: j.end.certainty,
            date_evidence: [j.start.evidence, j.end.evidence].join(" | "),
            duration_evidence: j.duration.evidence,
            duration_certainty: j.duration.certainty,
            last_verified: j.verifiedAt,
            availability: j.availability,
            skills: j.skills.join(";"),
            eligibility: j.eligibility,
            deadline: j.deadline,
            saved: j.saved,
            status: j.status,
            notes: j.notes,
            labels: j.labels.join(";"),
            reminder: j.reminder,
          }).map(([k, v]) => [k, safe(v)]),
        ),
      ),
      { header: true },
    )
  );
}

/** Converts the investigation's structured facts without treating its short-window assessment as a twelve-month match. */
export function investigationFacts(row: Row, candidate: Row | undefined): Row {
  const base = {
    ...row,
    levels: list(
      row.levels ?? row.level?.split(",").map((s: string) => s.trim()),
    ),
    source: "Jorb browser-assisted import",
    sourceUrl: "https://www.jorb.ai/search-jobs",
  };
  if (!candidate) return base;
  const p = candidate.internship_period,
    d = candidate.advertised_duration;
  const certainty = (v: any) =>
    v?.evidence_status === "employer_verified" ? "verified" : "reported";
  const date = (v: any) => {
    const value =
      typeof v === "string" && /^\d{4}(-\d{2})?(-\d{2})?$/.test(v) ? v : null;
    return {
      ...emptyDate(),
      value,
      certainty: value ? certainty(p) : "unknown",
      flexible:
        candidate.availability_assessment?.status ===
        "explicit_flexible_season_confirm_dates",
      evidence: p?.quote ?? candidate.notes?.join(" ") ?? "",
      sourceUrl: row.job_url,
    };
  };
  return {
    ...base,
    start: date(p?.start),
    end: date(p?.end),
    duration: d
      ? {
          min: d.minimum,
          max: d.maximum,
          unit: d.unit ?? "month",
          qualifier: d.qualifier?.includes("minimum")
            ? "minimum"
            : d.qualifier === "preferred"
              ? "preferred"
              : d.minimum === d.maximum
                ? "exact"
                : "range",
          certainty: certainty(d),
          evidence: d.quote ?? d.text,
        }
      : emptyDuration(),
    verifiedAt: "2026-10-21",
    availability:
      candidate.application_status === "displayed_deadline_passed"
        ? "expired"
        : candidate.sources?.some(
              (s: any) => s.quality === "employer_page_not_found",
            )
          ? "unavailable"
          : "unverified",
    deadline: candidate.application_deadline?.value ?? null,
    eligibility: candidate.eligibility_notes ?? "",
    evidence: [
      ...(candidate.notes ?? []),
      ...(candidate.sources ?? [])
        .filter((s: any) => s.kind === "employer_browser_check")
        .map((s: any) => s.url),
    ].join("\n"),
  };
}
