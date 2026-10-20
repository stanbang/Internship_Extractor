import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankFilters,
  emptyDate,
  emptyDuration,
  PERSONAL_PRESET,
  togglePreset,
  type Job,
} from "../shared/model.js";
import {
  addCalendarMonths,
  bounds,
  calendarMonthsBetween,
  compatibility,
  durationMonths,
  filterJobs,
  hasConflict,
} from "../shared/filter.js";
const at = (value: string, precision: "day" | "month" = "day") => ({
  ...emptyDate(),
  value,
  precision,
  certainty: "verified" as const,
  evidence: "Test fixture source",
});
export const fixture = (overrides: Partial<Job> = {}): Job => ({
  id: "fixture",
  company: "Test Fixture Company",
  title: "Software internship (test fixture)",
  description: "Testing descriptions",
  categories: ["Backend"],
  levels: ["Summer Internships"],
  locations: ["Singapore"],
  postedAt: "2026-10-20",
  url: "https://example.test/jobs/fixture",
  source: "Synthetic test fixture only",
  sourceUrl: "",
  collectedAt: "2026-10-21",
  verifiedAt: null,
  availability: "unverified",
  start: emptyDate(),
  end: emptyDate(),
  duration: emptyDuration(),
  skills: [],
  eligibility: "",
  notes: "",
  labels: [],
  saved: false,
  status: "Not Started",
  reminder: null,
  deadline: null,
  evidence: "",
  ...overrides,
});
test("all imported rows remain visible with blank filters", () =>
  assert.equal(
    filterJobs(
      [
        fixture(),
        fixture({ id: "other", locations: ["London"], categories: ["Design"] }),
      ],
      blankFilters(),
    ).length,
    2,
  ));
test("exact verified dates covering the requested full period are confirmed", () =>
  assert.equal(
    compatibility(
      fixture({ start: at("2027-05-01"), end: at("2028-04-30") }),
      "2027-05-01",
      "2028-04-30",
    ).status,
    "confirmed",
  ));
test("a summer internship within the window only partially overlaps a year-long placement", () => {
  const m = compatibility(
    fixture({ start: at("2027-06-07"), end: at("2027-08-13") }),
    "2027-05-01",
    "2028-04-30",
  );
  assert.equal(m.status, "incompatible");
  assert.equal(m.relation, "overlaps");
});
test("outside internships are distinct from overlaps", () =>
  assert.equal(
    compatibility(
      fixture({ start: at("2026-07-01"), end: at("2026-12-31") }),
      "2027-05-01",
      "2028-04-30",
    ).relation,
    "outside",
  ));
test("missing dates do not imply flexible dates", () =>
  assert.equal(
    compatibility(fixture(), "2027-05-01", "2028-04-30").status,
    "unknown",
  ));
test("explicit flexibility is potentially compatible, not confirmed", () =>
  assert.equal(
    compatibility(
      fixture({ start: { ...emptyDate(), flexible: true } }),
      "2027-05-01",
      "2028-04-30",
    ).status,
    "potential",
  ));
test("month precision never invents a first or last day for confirmation", () =>
  assert.equal(
    compatibility(
      fixture({ start: at("2027-05", "month"), end: at("2028-04", "month") }),
      "2027-05-01",
      "2028-04-30",
    ).status,
    "potential",
  ));
test("unverified reported coverage is not confirmed", () =>
  assert.equal(
    compatibility(
      fixture({
        start: { ...at("2027-05-01"), certainty: "reported" },
        end: at("2028-04-30"),
      }),
      "2027-05-01",
      "2028-04-30",
    ).status,
    "potential",
  ));
test("invalid requested period returns insufficient information", () =>
  assert.equal(
    compatibility(fixture(), "2028-01-01", "2027-01-01").status,
    "unknown",
  ));
test("calendar month addition clamps January 31 to leap-year February 29", () =>
  assert.equal(
    new Date(addCalendarMonths(Date.UTC(2028, 0, 31), 1))
      .toISOString()
      .slice(0, 10),
    "2028-02-29",
  ));
test("calendar month calculations do not assume 30-day months", () =>
  assert.equal(
    calendarMonthsBetween(Date.UTC(2028, 1, 1), Date.UTC(2028, 2, 1)),
    1,
  ));
test("unknown duration can be included or excluded explicitly", () => {
  assert.equal(
    filterJobs([fixture()], { minMonths: "12", includeUnknownDuration: true })
      .length,
    1,
  );
  assert.equal(
    filterJobs([fixture()], { minMonths: "12", includeUnknownDuration: false })
      .length,
    0,
  );
});
test("weeks without a date anchor cannot be guessed as months", () =>
  assert.equal(
    durationMonths(
      fixture({
        duration: { ...emptyDuration(), min: 12, max: 12, unit: "week" },
      }),
    ),
    null,
  ));
test("minimum-only duration retains an open upper bound", () =>
  assert.equal(
    filterJobs(
      [fixture({ duration: { ...emptyDuration(), min: 3, unit: "month" } })],
      { minMonths: "12", includeUnknownDuration: false },
    ).length,
    1,
  ));
test("a known six-month maximum cannot cover a twelve-month placement", () =>
  assert.equal(
    compatibility(
      fixture({ duration: { ...emptyDuration(), min: 6, max: 6 } }),
      "2027-05-01",
      "2028-04-30",
    ).status,
    "incompatible",
  ));
test("conflicting dates and advertised duration prevent confirmation", () => {
  const j = fixture({
    start: at("2027-05-01"),
    end: at("2028-04-30"),
    duration: { ...emptyDuration(), min: 3, max: 3, qualifier: "exact" },
  });
  assert.equal(hasConflict(j), true);
  assert.equal(compatibility(j, "2027-05-01", "2028-04-30").status, "unknown");
});
test("multiple dimensions combine while values within a facet use OR", () => {
  const j = fixture({ saved: true, status: "Applied" });
  const f = {
    search: "testing descriptions",
    levels: ["Summer Internships", "Off Cycle Internships"],
    categories: ["Backend"],
    locations: ["Singapore"],
    saved: "saved" as const,
    statuses: ["Applied"],
    recency: "7d" as const,
  };
  assert.equal(
    filterJobs(
      [j, fixture({ id: "wrong", locations: ["London"] })],
      f,
      new Date("2026-10-21"),
    ).length,
    1,
  );
});
test("undated posting option is independent of internship dates", () => {
  const j = fixture({ postedAt: null, start: at("2027-05-01") });
  assert.equal(filterJobs([j], { includeUndated: false }).length, 0);
  assert.equal(
    filterJobs([j], { includeUndated: true, recency: "7d" }).length,
    1,
  );
});
test("unknown start date choice is explicit and reset restores all rows", () => {
  const jobs = [fixture(), fixture({ id: "dated", start: at("2027-06-01") })];
  assert.equal(filterJobs(jobs, { startKind: "unknown" }).length, 1);
  assert.equal(filterJobs(jobs, blankFilters()).length, 2);
});
test("specific month and date bounds combine independently", () =>
  assert.equal(
    filterJobs([fixture({ start: at("2027-06-15") })], {
      startMonth: "2027-06",
      startMin: "2027-06-01",
      startMax: "2027-06-30",
    }).length,
    1,
  ));
test("preset is optional and deactivation restores previous filters", () => {
  const before = {
    ...blankFilters(),
    search: "my query",
    locations: ["London"],
  };
  const enabled = togglePreset(before, null, null, PERSONAL_PRESET);
  assert.deepEqual(enabled.filters.locations, ["Singapore"]);
  const disabled = togglePreset(
    enabled.filters,
    enabled.active,
    enabled.previous,
    PERSONAL_PRESET,
  );
  assert.deepEqual(disabled.filters, before);
  assert.equal(blankFilters().periodStart, "");
});
test("sorting does not mutate the original dataset", () => {
  const jobs = [
    fixture({ id: "b", company: "Z" }),
    fixture({ id: "a", company: "A" }),
  ];
  assert.equal(filterJobs(jobs, { sort: "company" })[0].id, "a");
  assert.equal(jobs[0].id, "b");
});
test("invalid dates are not silently normalised to a different calendar day", () =>
  assert.equal(bounds(at("2027-02-31")), null));

test("maximum-only duration remains bounded", () => {
  assert.deepEqual(
    durationMonths(fixture({ duration: { ...emptyDuration(), max: 6 } })),
    { min: 0, max: 6 },
  );
  assert.equal(
    filterJobs([fixture({ duration: { ...emptyDuration(), max: 6 } })], {
      minMonths: "12",
      includeUnknownDuration: false,
    }).length,
    0,
  );
});
test("a known late start prevents full coverage even if the end is missing", () => {
  assert.equal(
    compatibility(
      fixture({ start: at("2027-06-01") }),
      "2027-05-01",
      "2028-04-30",
    ).status,
    "incompatible",
  );
});
test("verified labels without supporting evidence cannot confirm a placement", () => {
  assert.equal(
    compatibility(
      fixture({
        start: { ...at("2027-05-01"), evidence: "" },
        end: at("2028-04-30"),
      }),
      "2027-05-01",
      "2028-04-30",
    ).status,
    "potential",
  );
});
test("fractional calendar months use the actual anchored month length", () => {
  assert.equal(
    addCalendarMonths(Date.UTC(2028, 1, 1), 0.5),
    Date.UTC(2028, 1, 15, 12),
  );
});
