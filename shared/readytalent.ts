import type { Job } from "./model.js";

export const RT_SOURCE = "SIT ReadyTalent";
export const RT_EMPLOYMENT = "Integrated Work Study Programme (IWSP)";
export const RT_PROGRAMME = "BSc (Hons) Com Sci in RTIS";
export interface ReadyTalentPosting {
  source: "SIT ReadyTalent";
  source_type: "IWSP";
  source_job_id: string;
  job_title: string;
  company_name: string;
  employment_type: string | null;
  eligible_programmes: string[] | null;
  original_description: string | null;
  original_posting_text: string | null;
  responsibilities: string | null;
  minimum_requirements: string | null;
  preferred_qualifications: string | null;
  technical_skills: string[] | null;
  programming_languages: string[] | null;
  technologies: string[] | null;
  categories: string[] | null;
  monthly_allowance: {
    min: number | null;
    max: number | null;
    currency: string | null;
    text: string;
  } | null;
  vacancies: number | null;
  work_location: string | null;
  internship_period: string | null;
  closing_date: string | null;
  application_status: string | null;
  original_url: string | null;
  extracted_at: string;
  last_verified_at: string | null;
  page: number | null;
  evidence_id: string | null;
  original_metadata: Record<string, string | null> | null;
  availability: "unverified" | "available" | "expired" | "unavailable";
  availability_evidence: string | null;
}
export interface RefreshManifest {
  source: "SIT ReadyTalent";
  source_type: "IWSP";
  employment_type: string;
  programme: string;
  expected_count: number | null;
  expected_pages: number | null;
  pages_processed: number[];
  errors: { page: number | null; job_id: string | null; message: string }[];
  started_at: string;
  finished_at: string | null;
  evidence_ids: string[];
}
export interface ReadyTalentDataset {
  manifest: RefreshManifest;
  jobs: ReadyTalentPosting[];
}
export interface Coverage extends RefreshManifest {
  extracted_count: number;
  missing_descriptions: number;
  duplicate_count: number;
  complete: boolean;
  last_successful_refresh: string | null;
}
export interface IWSPFilters {
  search: string;
  categories: string[];
  skills: string[];
  minSalary: string;
  maxSalary: string;
  includeUnknownSalary: boolean;
  closingFrom: string;
  closingThrough: string;
  includeUnknownClosing: boolean;
  statuses: string[];
  savedOnly: boolean;
  sort: "relevance" | "resume" | "closing" | "salary" | "company";
}
export const blankIWSPFilters = (): IWSPFilters => ({
  search: "",
  categories: [],
  skills: [],
  minSalary: "",
  maxSalary: "",
  includeUnknownSalary: true,
  closingFrom: "",
  closingThrough: "",
  includeUnknownClosing: true,
  statuses: [],
  savedOnly: false,
  sort: "relevance",
});
export function filterIWSP(
  jobs: Job[],
  f: IWSPFilters,
  scores: Record<string, number | null> = {},
): Job[] {
  const q = f.search.toLowerCase().trim();
  return jobs
    .filter((j) => {
      const r = j.readyTalent;
      if (!r) return false;
      const skills = [
        ...(r.technical_skills ?? []),
        ...(r.programming_languages ?? []),
        ...(r.technologies ?? []),
        ...j.skills,
      ];
      if (
        q &&
        !`${j.company} ${j.title} ${r.original_description ?? ""} ${skills.join(" ")}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      if (
        f.categories.length &&
        !f.categories.some((c) => j.categories.includes(c))
      )
        return false;
      if (
        f.skills.length &&
        !f.skills.every((s) =>
          skills.some((v) => v.toLowerCase() === s.toLowerCase()),
        )
      )
        return false;
      if (f.savedOnly && !j.saved) return false;
      if (
        f.statuses.length &&
        !f.statuses.includes(j.status) &&
        !f.statuses.includes(r.application_status ?? "")
      )
        return false;
      if (f.minSalary || f.maxSalary) {
        const a = r.monthly_allowance;
        if (a?.min == null && a?.max == null) {
          if (!f.includeUnknownSalary) return false;
        } else if (
          (a?.max ?? Infinity) < Number(f.minSalary || 0) ||
          (a?.min ?? 0) > Number(f.maxSalary || Infinity)
        )
          return false;
      }
      if (f.closingFrom || f.closingThrough) {
        if (!r.closing_date) {
          if (!f.includeUnknownClosing) return false;
        } else if (
          (f.closingFrom && r.closing_date < f.closingFrom) ||
          (f.closingThrough && r.closing_date > f.closingThrough)
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (f.sort === "resume")
        return (
          (scores[b.id] ?? -1) - (scores[a.id] ?? -1) ||
          a.company.localeCompare(b.company)
        );
      if (f.sort === "salary")
        return (
          (b.readyTalent?.monthly_allowance?.min ?? -1) -
            (a.readyTalent?.monthly_allowance?.min ?? -1) ||
          a.company.localeCompare(b.company)
        );
      if (f.sort === "closing")
        return (a.readyTalent?.closing_date ?? "9999").localeCompare(
          b.readyTalent?.closing_date ?? "9999",
        );
      if (f.sort === "relevance" && q) {
        const rank = (j: Job) =>
          [j.title, j.company].reduce(
            (s, v) => s + (v.toLowerCase().includes(q) ? 1 : 0),
            0,
          );
        const diff = rank(b) - rank(a);
        if (diff) return diff;
      }
      return (
        a.company.localeCompare(b.company) || a.title.localeCompare(b.title)
      );
    });
}
