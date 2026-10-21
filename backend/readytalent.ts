import { randomUUID } from "node:crypto";
import { stringify } from "csv-stringify/sync";
import { normalize, url } from "./ingest.js";
import { day } from "../shared/filter.js";
import {
  RT_EMPLOYMENT,
  RT_PROGRAMME,
  RT_SOURCE,
  type ReadyTalentPosting,
  type ReadyTalentDataset,
  type Coverage,
} from "../shared/readytalent.js";
import type { Store } from "./database.js";
import type { Job } from "../shared/model.js";
import { detectedTerms } from "../shared/skills.js";

// The Singapore portal displays day/month/year. Reject invalid calendar dates.
export function portalDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return day(value) === null ? null : value;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return day(iso) === null ? null : iso;
}
export function readyTalentAnalysisText(r: ReadyTalentPosting): string {
  return (
    [
      r.original_description,
      r.responsibilities,
      r.minimum_requirements,
      r.original_metadata?.["Job Requirements"],
      r.preferred_qualifications,
    ]
      .filter((v, i, a) => v?.trim() && a.indexOf(v) === i)
      .join("\n\n") ||
    r.original_posting_text ||
    ""
  );
}
export function detectedAreas(title: string, text: string): string[] {
  const source = title + "\n" + text;
  const rules: [string, RegExp][] = [
    [
      "Software & web",
      /software|full[ -]?stack|front[ -]?end|back[ -]?end|web develop|programmer|application develop/i,
    ],
    [
      "Data & AI",
      /data (?:anal|engineer|science)|machine learning|artificial intelligence|\bLLM\b|\bGenAI\b|\bAI\b/i,
    ],
    [
      "Games & graphics",
      /game|graphics|\bUnity\b|\bUnreal\b|rendering|mixed reality|virtual reality/i,
    ],
    [
      "Cloud & infrastructure",
      /devops|devsecops|cloud|platform engineer|infrastructure|site reliability/i,
    ],
    [
      "Security",
      /cybersecurity|cyber security|information security|security engineer/i,
    ],
    [
      "Embedded & robotics",
      /embedded|robotics|firmware|\bFPGA\b|microcontroller/i,
    ],
    [
      "Product & design",
      /product design|\bUX\b|\bUI\b|user experience|graphic design/i,
    ],
    [
      "Business & solutions",
      /business analyst|solutions engineer|solution engineer|project executive|business development/i,
    ],
  ];
  return rules
    .filter(([, pattern]) => pattern.test(source))
    .map(([area]) => area);
}
export function readyTalentListingChanged(
  previous: ReadyTalentPosting | undefined,
  next: ReadyTalentPosting,
): boolean {
  if (!previous) return true;
  // Upgrade earlier accessibility-only captures to exact visible textarea values once.
  if (previous.original_description && previous.evidence_id?.startsWith("ev_"))
    return true;
  const amount = (r: ReadyTalentPosting) =>
    (r.original_metadata?.["Advertised amount"] ?? "").replace(/[\s,]/g, "");
  const vacancy = (r: ReadyTalentPosting) =>
    r.original_metadata?.["Search row text"]?.match(/(\d+)\s+Vacanc/i)?.[1] ??
    null;
  return (
    previous.job_title !== next.job_title ||
    previous.company_name !== next.company_name ||
    previous.closing_date !== next.closing_date ||
    amount(previous) !== amount(next) ||
    vacancy(previous) !== vacancy(next)
  );
}

const nullable = (v: unknown): string | null =>
  v == null || v === "" ? null : String(v);
const array = (v: unknown): string[] | null =>
  v == null
    ? null
    : Array.isArray(v) && v.every((x) => typeof x === "string")
      ? [...v]
      : String(v)
          .split(";")
          .map((x) => x.trim())
          .filter(Boolean);
export function normalizeReadyTalent(raw: any): ReadyTalentPosting {
  if (raw?.source !== RT_SOURCE || raw.source_type !== "IWSP")
    throw Error(
      "ReadyTalent records require the correct source and source_type.",
    );
  if (
    typeof raw.source_job_id !== "string" ||
    !raw.source_job_id.trim() ||
    raw.source_job_id.length > 160
  )
    throw Error("A stable source_job_id is required.");
  if (!raw.job_title?.trim() || !raw.company_name?.trim())
    throw Error("ReadyTalent jobs require a title and company.");
  if (raw.employment_type != null && raw.employment_type !== RT_EMPLOYMENT)
    throw Error("Posting employment type is outside the requested IWSP scope.");
  if (
    raw.eligible_programmes != null &&
    (!Array.isArray(raw.eligible_programmes) ||
      !raw.eligible_programmes.includes(RT_PROGRAMME))
  )
    throw Error(
      "Posting programmes do not include the requested RTIS programme.",
    );
  if (raw.page != null && (!Number.isInteger(raw.page) || raw.page < 1))
    throw Error("Invalid source page.");
  const allowance = raw.monthly_allowance ?? null;
  if (allowance) {
    for (const n of [allowance.min, allowance.max])
      if (n != null && (!Number.isFinite(n) || n < 0))
        throw Error("Invalid allowance.");
    if (
      allowance.min != null &&
      allowance.max != null &&
      allowance.min > allowance.max
    )
      throw Error("Invalid allowance range.");
  }
  if (raw.closing_date && day(raw.closing_date) === null)
    throw Error("Closing dates must be YYYY-MM-DD.");
  if (
    raw.vacancies != null &&
    (!Number.isInteger(raw.vacancies) || raw.vacancies < 0)
  )
    throw Error("Invalid vacancy count.");
  if (!raw.extracted_at || !Number.isFinite(Date.parse(raw.extracted_at)))
    throw Error("An extraction timestamp is required.");
  if (
    raw.last_verified_at &&
    !Number.isFinite(Date.parse(raw.last_verified_at))
  )
    throw Error("Invalid verification timestamp.");
  if (raw.original_url) {
    const u = new URL(url(raw.original_url));
    if (u.origin !== "https://readytalent2.singaporetech.edu.sg")
      throw Error("ReadyTalent source URLs must stay on the source portal.");
  }
  if (
    raw.original_metadata &&
    Object.keys(raw.original_metadata).some((k) =>
      /cookie|token|password|authorization/i.test(k),
    )
  )
    throw Error("Authentication data is not accepted in job metadata.");
  if (
    raw.original_metadata &&
    (typeof raw.original_metadata !== "object" ||
      Array.isArray(raw.original_metadata) ||
      Object.values(raw.original_metadata).some(
        (v) => v !== null && typeof v !== "string",
      ))
  )
    throw Error("Original metadata must contain only text or null fields.");
  const r: ReadyTalentPosting = {
    source: RT_SOURCE,
    source_type: "IWSP",
    source_job_id: raw.source_job_id.trim(),
    job_title: raw.job_title.trim(),
    company_name: raw.company_name.trim(),
    employment_type: nullable(raw.employment_type),
    eligible_programmes: array(raw.eligible_programmes),
    original_description: nullable(raw.original_description),
    original_posting_text: nullable(raw.original_posting_text),
    responsibilities: nullable(raw.responsibilities),
    minimum_requirements: nullable(raw.minimum_requirements),
    preferred_qualifications: nullable(raw.preferred_qualifications),
    technical_skills: array(raw.technical_skills),
    programming_languages: array(raw.programming_languages),
    technologies: array(raw.technologies),
    categories: array(raw.categories),
    monthly_allowance: allowance
      ? {
          min: allowance.min ?? null,
          max: allowance.max ?? null,
          currency: nullable(allowance.currency),
          text: String(allowance.text ?? ""),
        }
      : null,
    vacancies: raw.vacancies ?? null,
    work_location: nullable(raw.work_location),
    internship_period: nullable(raw.internship_period),
    closing_date: nullable(raw.closing_date),
    application_status: nullable(raw.application_status),
    original_url: raw.original_url ? url(raw.original_url) : null,
    extracted_at: raw.extracted_at,
    last_verified_at: nullable(raw.last_verified_at),
    page: raw.page ?? null,
    evidence_id: nullable(raw.evidence_id),
    original_metadata: raw.original_metadata ?? null,
    availability: ["available", "expired", "unavailable"].includes(
      raw.availability,
    )
      ? raw.availability
      : "unverified",
    availability_evidence: nullable(raw.availability_evidence),
  };
  if (
    r.availability !== "unverified" &&
    (!r.last_verified_at || !r.availability_evidence)
  )
    throw Error("Availability changes require verification time and evidence.");
  return r;
}
export function readyTalentJob(r: ReadyTalentPosting): Omit<Job, "id"> {
  // A context-dependent Application Details route is not a reliable deep link.
  const search = new URL(
    "https://readytalent2.singaporetech.edu.sg/rt-student-search/",
  );
  search.searchParams.set("q", r.job_title);
  search.searchParams.set("employmenttypes", RT_EMPLOYMENT);
  search.searchParams.set("programmes", RT_PROGRAMME);
  const fullText = r.original_posting_text || readyTalentAnalysisText(r);
  const range =
    /^(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})$/.exec(
      r.internship_period?.trim() ?? "",
    );
  const start = range ? portalDate(range[1]) : null,
    end = range ? portalDate(range[2]) : null;
  return {
    ...normalize({
      company: r.company_name,
      title: r.job_title,
      description: fullText,
      posting_date: portalDate(r.original_metadata?.["Posting Date"]),
      start_date: start,
      end_date: end,
      date_evidence: r.internship_period ?? "",
      locations: r.work_location ? [r.work_location] : [],
      levels: [r.employment_type ?? RT_EMPLOYMENT],
      categories: r.categories?.length
        ? r.categories
        : detectedAreas(r.job_title, readyTalentAnalysisText(r)),
      skills: detectedTerms(readyTalentAnalysisText(r), [
        ...(r.technical_skills ?? []),
        ...(r.programming_languages ?? []),
        ...(r.technologies ?? []),
      ]),
      url: search.toString(),
      source: RT_SOURCE,
      sourceUrl: r.original_url ?? search.toString(),
      collectedAt: r.extracted_at,
      verifiedAt: r.last_verified_at,
      deadline: r.closing_date,
      availability: r.availability,
      eligibility: r.eligible_programmes?.join("; ") ?? "",
      evidence: r.evidence_id ?? "",
    }),
    description: fullText,
    sourceType: "IWSP",
    sourceJobId: r.source_job_id,
    readyTalent: r,
  };
}
export function importReadyTalent(store: Store, input: ReadyTalentDataset) {
  const m = input?.manifest;
  if (
    m?.source !== RT_SOURCE ||
    m.source_type !== "IWSP" ||
    !Array.isArray(input.jobs) ||
    !Array.isArray(m.pages_processed) ||
    !Array.isArray(m.errors)
  )
    throw Error("Import a ReadyTalent dataset with its coverage manifest.");
  if (m.employment_type !== RT_EMPLOYMENT || m.programme !== RT_PROGRAMME)
    throw Error("The manifest must describe the requested IWSP/RTIS scope.");
  if (input.jobs.length > 10000) throw Error("Import at most 10,000 jobs.");
  for (const v of [m.expected_count, m.expected_pages])
    if (v != null && (!Number.isInteger(v) || v < 0))
      throw Error("Invalid source counts.");
  if (m.pages_processed.some((p) => !Number.isInteger(p) || p < 1))
    throw Error("Invalid page coverage.");
  if (m.expected_count === undefined || m.expected_pages === undefined)
    throw Error("Source counts must be explicit, using null when unknown.");
  if (
    !Number.isFinite(Date.parse(m.started_at)) ||
    (m.finished_at && !Number.isFinite(Date.parse(m.finished_at)))
  )
    throw Error("Invalid refresh timestamps.");
  if (
    !Array.isArray(m.evidence_ids) ||
    m.evidence_ids.some((e) => typeof e !== "string")
  )
    throw Error("Invalid refresh evidence.");
  if (m.errors.some((e) => !e || typeof e.message !== "string"))
    throw Error("Invalid collection errors.");
  if (
    new Set(m.pages_processed).size !== m.pages_processed.length ||
    m.pages_processed.some(
      (p) => m.expected_pages !== null && p > m.expected_pages,
    )
  )
    throw Error("Invalid or duplicate processed page numbers.");
  const rows = input.jobs.map(normalizeReadyTalent),
    ids = new Set(rows.map((r) => r.source_job_id)),
    duplicate_count = rows.length - ids.size;
  if (duplicate_count)
    throw Error(`Duplicate source job IDs in import: ${duplicate_count}.`);
  const missing_descriptions = rows.filter(
    (r) => !r.original_description?.trim(),
  ).length;
  const allPages =
    m.expected_pages !== null &&
    Array.from({ length: m.expected_pages }, (_, i) => i + 1).every((p) =>
      m.pages_processed.includes(p),
    );
  const rowPages = rows.every(
    (r) => r.page !== null && m.pages_processed.includes(r.page),
  );
  const eachPage =
    m.expected_pages !== null &&
    Array.from({ length: m.expected_pages }, (_, i) => i + 1).every((p) =>
      rows.some((r) => r.page === p),
    );
  const complete =
    m.expected_count !== null &&
    rows.length === m.expected_count &&
    allPages &&
    rowPages &&
    (m.expected_count === 0 || eachPage) &&
    !m.errors.length &&
    !missing_descriptions &&
    !!m.finished_at;
  const prior = latestCoverage(store),
    coverage: Coverage = {
      ...m,
      extracted_count: rows.length,
      missing_descriptions,
      duplicate_count,
      complete,
      last_successful_refresh: complete
        ? m.finished_at
        : (prior?.last_successful_refresh ?? null),
    };
  return store.transaction(() => {
    let inserted = 0,
      updated = 0;
    for (const r of rows) {
      const old = store.find(readyTalentJob(r));
      old ? updated++ : inserted++;
      store.put(readyTalentJob(r), old);
    }
    store.db
      .prepare("INSERT INTO readytalent_refreshes VALUES(?,?,?)")
      .run(randomUUID(), new Date().toISOString(), JSON.stringify(coverage));
    // Absence from a snapshot never changes availability without job-specific evidence.
    return { inserted, updated, coverage };
  });
}
export function latestCoverage(store: Store): Coverage | null {
  const r = store.db
    .prepare(
      "SELECT payload FROM readytalent_refreshes ORDER BY rowid DESC LIMIT 1",
    )
    .get() as any;
  return r ? JSON.parse(r.payload) : null;
}
export function exportReadyTalent(store: Store): ReadyTalentDataset | null {
  const manifest = latestCoverage(store);
  return manifest
    ? {
        manifest,
        jobs: store
          .all()
          .filter((j) => j.readyTalent)
          .map((j) => j.readyTalent!),
      }
    : null;
}
export function exportReadyTalentCsv(store: Store): string {
  const jobs = store
    .all()
    .filter((j) => j.readyTalent)
    .map((j) => {
      const r = j.readyTalent!;
      return Object.fromEntries(
        Object.entries({
          ...r,
          local_saved: j.saved,
          local_status: j.status,
        }).map(([k, v]) => [
          k,
          v != null && typeof v === "object"
            ? JSON.stringify(v)
            : typeof v === "string" && /^[=+\-@\t\r]/.test(v)
              ? "'" + v
              : v,
        ]),
      );
    });
  return "\uFEFF" + stringify(jobs, { header: true });
}
