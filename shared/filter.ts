import {
  blankFilters,
  type DateFact,
  type Filters,
  type Job,
  type MatchStatus,
} from "./model.js";
const DAY = 86400000;
export function day(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const n = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value
    ? n
    : null;
}
export function bounds(f: DateFact): { first: number; last: number } | null {
  if (!f.value) return null;
  const v = f.value;
  if (f.precision === "day") {
    const t = day(v);
    return t === null ? null : { first: t, last: t };
  }
  if (f.precision === "month" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) {
    const [y, m] = v.split("-").map(Number);
    return { first: Date.UTC(y, m - 1, 1), last: Date.UTC(y, m, 0) };
  }
  if (f.precision === "year" && /^\d{4}$/.test(v)) {
    const y = Number(v);
    return { first: Date.UTC(y, 0, 1), last: Date.UTC(y, 11, 31) };
  }
  return null;
}
export function addCalendarMonths(time: number, months: number): number {
  if (!Number.isInteger(months)) {
    const whole = Math.floor(months);
    const anchor = addCalendarMonths(time, whole);
    return (
      anchor + (months - whole) * (addCalendarMonths(time, whole + 1) - anchor)
    );
  }
  const d = new Date(time),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth() + months;
  return Date.UTC(
    y,
    m,
    Math.min(d.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate()),
  );
}
export function calendarMonthsBetween(start: number, end: number): number {
  const a = new Date(start),
    b = new Date(end);
  let m =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    b.getUTCMonth() -
    a.getUTCMonth();
  if (addCalendarMonths(start, m) > end) m--;
  const anchor = addCalendarMonths(start, m),
    next = addCalendarMonths(start, m + 1);
  return m + (end - anchor) / (next - anchor);
}
export function hasConflict(job: Job): boolean {
  const s = bounds(job.start),
    e = bounds(job.end);
  if (s && e && s.first > e.last) return true;
  if (
    !s ||
    !e ||
    s.first !== s.last ||
    e.first !== e.last ||
    job.duration.qualifier === "preferred"
  )
    return false;
  const d = job.duration;
  const expected = (n: number) =>
    d.unit === "month"
      ? addCalendarMonths(s.first, n)
      : s.first + n * (d.unit === "week" ? 7 : 1) * DAY;
  return (
    (d.min !== null && expected(d.min) > e.last + 7 * DAY) ||
    (d.max !== null && expected(d.max) < e.first - 7 * DAY)
  );
}
export function durationMonths(job: Job): { min: number; max: number } | null {
  const d = job.duration;
  if (d.unit === "month" && (d.min !== null || d.max !== null))
    return { min: d.min ?? 0, max: d.max ?? Infinity };
  const s = bounds(job.start),
    e = bounds(job.end);
  if (
    s &&
    e &&
    s.first === s.last &&
    e.first === e.last &&
    e.first >= s.first
  ) {
    const n = calendarMonthsBetween(s.first, e.first);
    return { min: n, max: n };
  }
  if (s && s.first === s.last && (d.min !== null || d.max !== null)) {
    const m = (n: number) =>
      calendarMonthsBetween(
        s.first,
        s.first + n * (d.unit === "week" ? 7 : 1) * DAY,
      );
    return { min: m(d.min ?? 0), max: d.max === null ? Infinity : m(d.max) };
  }
  return null;
}
export interface Compatibility {
  status: MatchStatus;
  relation: "covers" | "overlaps" | "outside" | "unknown";
  explanation: string;
}
export function compatibility(
  job: Job,
  start: string,
  end: string,
): Compatibility {
  const a = day(start),
    b = day(end);
  if (a === null || b === null || a > b)
    return {
      status: "unknown",
      relation: "unknown",
      explanation:
        "Choose a valid required placement period to assess coverage.",
    };
  if (hasConflict(job))
    return {
      status: "unknown",
      relation: "unknown",
      explanation:
        "Advertised dates and duration conflict. Verify them before matching.",
    };
  const s = bounds(job.start),
    e = bounds(job.end);
  if ((s && s.first > b) || (e && e.last < a))
    return {
      status: "incompatible",
      relation: "outside",
      explanation:
        "The advertised internship is outside the required placement period.",
    };
  if (s && e) {
    const guaranteed = s.last <= a && e.first >= b,
      possible = s.first <= a && e.last >= b;
    const verified =
      job.start.certainty === "verified" &&
      job.end.certainty === "verified" &&
      Boolean(job.start.evidence.trim()) &&
      Boolean(job.end.evidence.trim());
    if (guaranteed && verified)
      return {
        status: "confirmed",
        relation: "covers",
        explanation:
          "Verified dates cover the entire required placement period.",
      };
    if (possible)
      return {
        status: "potential",
        relation: guaranteed ? "covers" : "overlaps",
        explanation:
          "The published date range could cover the placement, but date precision or evidence needs confirmation.",
      };
    return {
      status: "incompatible",
      relation: "overlaps",
      explanation:
        "The internship overlaps the placement but does not cover the entire required period.",
    };
  }
  if ((s && s.first > a) || (e && e.last < b))
    return {
      status: "incompatible",
      relation: "unknown",
      explanation:
        "A known internship boundary prevents coverage of the full required placement. The other boundary is missing.",
    };
  const dur = durationMonths(job),
    needed = calendarMonthsBetween(a, b);
  if (
    dur &&
    Number.isFinite(dur.max) &&
    dur.max + 0.1 < needed &&
    job.duration.qualifier !== "preferred"
  )
    return {
      status: "incompatible",
      relation: "unknown",
      explanation:
        "The advertised maximum duration is shorter than the required placement.",
    };
  if (job.start.flexible || job.end.flexible)
    return {
      status: "potential",
      relation: "unknown",
      explanation:
        "Flexible scheduling is explicitly recorded. Confirm a placement covering the required dates.",
    };
  return {
    status: "unknown",
    relation: "unknown",
    explanation:
      "Job-specific start/end dates are missing; compatibility cannot be confirmed.",
  };
}
function dateMatches(
  f: DateFact,
  min: string,
  max: string,
  month: string,
  kind: string,
  includeUnknown: boolean,
): boolean {
  const b = bounds(f);
  if (
    (kind === "flexible" && !f.flexible) ||
    (kind === "unknown" && b) ||
    (kind === "known" && !b)
  )
    return false;
  if (!min && !max && !month) return true;
  if (!b) return includeUnknown;
  const low = min ? day(min) : null,
    high = max ? day(max) : null;
  if ((low !== null && b.last < low) || (high !== null && b.first > high))
    return false;
  if (month) {
    const mb = bounds({ ...f, value: month, precision: "month" });
    if (mb && (b.last < mb.first || b.first > mb.last)) return false;
  }
  return true;
}
export function filterJobs(
  jobs: Job[],
  input: Partial<Filters>,
  now = new Date(),
): Job[] {
  const f = { ...blankFilters(), ...input };
  let result = jobs.filter((j) => {
    if (
      f.search &&
      !`${j.company} ${j.title} ${j.description}`
        .toLowerCase()
        .includes(f.search.toLowerCase().trim())
    )
      return false;
    for (const [selected, values] of [
      [f.levels, j.levels],
      [f.categories, j.categories],
      [f.locations, j.locations],
    ] as [string[], string[]][])
      if (selected.length && !selected.some((x) => values.includes(x)))
        return false;
    if (
      (f.saved === "saved" && !j.saved) ||
      (f.saved === "not-saved" && j.saved) ||
      (f.statuses.length && !f.statuses.includes(j.status)) ||
      (f.availability.length && !f.availability.includes(j.availability))
    )
      return false;
    if (!j.postedAt && !f.includeUndated) return false;
    if (f.recency !== "any" && j.postedAt) {
      const t = day(j.postedAt);
      const days = { "24h": 1, "3d": 3, "7d": 7, "30d": 30 }[f.recency];
      if (t === null || t < now.getTime() - days * DAY) return false;
    }
    if (
      !dateMatches(
        j.start,
        f.startMin,
        f.startMax,
        f.startMonth,
        f.startKind,
        f.includeUnknownDates,
      ) ||
      !dateMatches(
        j.end,
        f.endMin,
        f.endMax,
        f.endMonth,
        f.endKind,
        f.includeUnknownDates,
      )
    )
      return false;
    if (f.minMonths || f.maxMonths || f.exactMonths) {
      const d = durationMonths(j);
      if (!d) {
        if (!f.includeUnknownDuration) return false;
      } else {
        const min = f.exactMonths
            ? Number(f.exactMonths)
            : f.minMonths
              ? Number(f.minMonths)
              : 0,
          max = f.exactMonths
            ? Number(f.exactMonths)
            : f.maxMonths
              ? Number(f.maxMonths)
              : Infinity;
        if (d.max < min || d.min > max) return false;
      }
    }
    if (f.periodStart && f.periodEnd) {
      const c = compatibility(j, f.periodStart, f.periodEnd);
      if (f.matchStatuses.length && !f.matchStatuses.includes(c.status))
        return false;
      if (
        f.relation !== "all" &&
        c.relation !== f.relation &&
        !(
          c.relation === "unknown" &&
          f.includeUnknownDates &&
          f.relation !== "outside"
        )
      )
        return false;
    }
    return true;
  });
  const software = (j: Job) =>
    /software|backend|frontend|full.stack|developer|platform/i.test(
      `${j.title} ${j.categories.join(" ")}`,
    )
      ? 1
      : 0;
  result = result.sort((a, b) => {
    if (f.sort === "relevance") {
      const rank = { confirmed: 0, potential: 1, unknown: 2, incompatible: 3 };
      const c =
        rank[compatibility(a, f.periodStart, f.periodEnd).status] -
        rank[compatibility(b, f.periodStart, f.periodEnd).status];
      if (c) return c;
      if (f.prioritizeSoftware && software(a) !== software(b))
        return software(b) - software(a);
    }
    if (f.sort === "company")
      return (
        a.company.localeCompare(b.company) || a.title.localeCompare(b.title)
      );
    const n = (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
    return f.sort === "oldest" ? -n : n;
  });
  return result;
}
export function canonicalUrl(value: string): string {
  try {
    const u = new URL(value);
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./, "");
    for (const k of [...u.searchParams.keys()])
      if (/^utm_|^gh_src$|^source$|^ref$|^trk/.test(k))
        u.searchParams.delete(k);
    u.searchParams.sort();
    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}
export function identity(
  j: Pick<Job, "company" | "title" | "locations">,
): string {
  return [j.company, j.title, [...j.locations].sort().join("|")]
    .map((v) => v.toLowerCase().trim().replace(/\s+/g, " "))
    .join("::");
}
