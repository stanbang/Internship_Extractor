export type Certainty = "verified" | "reported" | "inferred" | "unknown";
export interface DateFact {
  value: string | null;
  precision: "day" | "month" | "year" | "unknown";
  certainty: Certainty;
  flexible: boolean;
  evidence: string;
  sourceUrl?: string;
}
export interface DurationFact {
  min: number | null;
  max: number | null;
  unit: "month" | "week" | "day";
  qualifier: "exact" | "range" | "minimum" | "preferred" | "unknown";
  certainty: Certainty;
  evidence: string;
}
export const emptyDate = (): DateFact => ({
  value: null,
  precision: "unknown",
  certainty: "unknown",
  flexible: false,
  evidence: "",
});
export const emptyDuration = (): DurationFact => ({
  min: null,
  max: null,
  unit: "month",
  qualifier: "unknown",
  certainty: "unknown",
  evidence: "",
});
export const STATUSES = [
  "Not Started",
  "Applied",
  "Online Assessment",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
];
export const LEVELS = [
  "Summer Internships",
  "Off Cycle Internships",
  "Insight Programmes",
  "Industrial Placements",
  "Graduate / Entry Level",
  "Apprenticeships",
  "Pre University",
  "Events",
  "Early Career",
  "Developing Career",
  "Specialist",
  "Managerial",
  "Head of Department",
];
export interface Job {
  id: string;
  company: string;
  title: string;
  description: string;
  categories: string[];
  levels: string[];
  locations: string[];
  postedAt: string | null;
  url: string;
  source: string;
  sourceUrl: string;
  collectedAt: string;
  verifiedAt: string | null;
  availability: "unverified" | "available" | "expired" | "unavailable";
  start: DateFact;
  end: DateFact;
  duration: DurationFact;
  skills: string[];
  eligibility: string;
  notes: string;
  labels: string[];
  saved: boolean;
  status: string;
  reminder: string | null;
  deadline: string | null;
  evidence: string;
  aliases?: string[];
  sourceType?: "IWSP" | null;
  sourceJobId?: string | null;
  readyTalent?: import("./readytalent.js").ReadyTalentPosting | null;
}
export type MatchStatus =
  "confirmed" | "potential" | "incompatible" | "unknown";
export interface Filters {
  search: string;
  levels: string[];
  categories: string[];
  locations: string[];
  recency: "any" | "24h" | "3d" | "7d" | "30d";
  includeUndated: boolean;
  saved: "all" | "saved" | "not-saved";
  statuses: string[];
  availability: string[];
  sort: "newest" | "oldest" | "company" | "relevance";
  startMin: string;
  startMax: string;
  startMonth: string;
  endMin: string;
  endMax: string;
  endMonth: string;
  startKind: "any" | "known" | "flexible" | "unknown";
  endKind: "any" | "known" | "flexible" | "unknown";
  minMonths: string;
  maxMonths: string;
  exactMonths: string;
  includeUnknownDates: boolean;
  includeUnknownDuration: boolean;
  periodStart: string;
  periodEnd: string;
  relation: "all" | "covers" | "overlaps" | "outside" | "unknown";
  matchStatuses: MatchStatus[];
  prioritizeSoftware: boolean;
}
export const blankFilters = (): Filters => ({
  search: "",
  levels: [],
  categories: [],
  locations: [],
  recency: "any",
  includeUndated: true,
  saved: "all",
  statuses: [],
  availability: [],
  sort: "newest",
  startMin: "",
  startMax: "",
  startMonth: "",
  endMin: "",
  endMax: "",
  endMonth: "",
  startKind: "any",
  endKind: "any",
  minMonths: "",
  maxMonths: "",
  exactMonths: "",
  includeUnknownDates: true,
  includeUnknownDuration: true,
  periodStart: "",
  periodEnd: "",
  relation: "all",
  matchStatuses: [],
  prioritizeSoftware: false,
});
export interface Preset {
  id: string;
  name: string;
  filters: Filters;
}
export const PERSONAL_PRESET: Preset = {
  id: "personal-placement",
  name: "My Internship — May 2027 to April 2028",
  filters: {
    ...blankFilters(),
    locations: ["Singapore"],
    periodStart: "2027-05-01",
    periodEnd: "2028-04-30",
    minMonths: "11",
    maxMonths: "13",
    matchStatuses: ["confirmed", "potential", "unknown"],
    prioritizeSoftware: true,
    sort: "relevance",
  },
};
export function togglePreset(
  current: Filters,
  active: Preset | null,
  previous: Filters | null,
  preset: Preset,
): { filters: Filters; active: Preset | null; previous: Filters | null } {
  return active?.id === preset.id
    ? { filters: previous ?? blankFilters(), active: null, previous: null }
    : {
        filters: structuredClone(preset.filters),
        active: preset,
        previous: active ? previous : structuredClone(current),
      };
}
