import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../backend/database.js";
import {
  normalize,
  readImport,
  exportCsv,
  investigationFacts,
} from "../backend/ingest.js";
import { createApp } from "../backend/server.js";
import { blankFilters } from "../shared/model.js";

test("refresh preserves facts but an explicit edit can clear them", () => {
  const s = new Store(":memory:");
  try {
    s.import([
      normalize({
        ...row(),
        sourceUrl: "https://source.example.test/list",
        start_date: "2027-05",
        duration_min: 12,
        duration_max: 12,
        availability: "available",
      }),
    ]);
    const id = s.all()[0].id;
    s.import([row()]);
    assert.equal(s.get(id)?.start.value, "2027-05");
    assert.equal(s.get(id)?.duration.min, 12);
    s.transaction(() => s.put(row(), id, false));
    const j = s.get(id)!;
    assert.equal(j.start.value, null);
    assert.equal(j.duration.min, null);
    assert.equal(j.availability, "unverified");
  } finally {
    s.close();
  }
});

test("source page remains distinct from employer application URL", () => {
  const s = new Store(":memory:");
  try {
    s.import([{ ...row(), sourceUrl: "https://source.example.test/list" }]);
    assert.equal(s.all()[0].sourceUrl, "https://source.example.test/list");
    assert.equal(s.all()[0].url, "https://example.test/job/42");
  } finally {
    s.close();
  }
});

test("invalid posting dates, duration provenance and tracking dates are rejected", () => {
  assert.throws(() => normalize({ ...row(), posting_date: "2027-02-31" }));
  assert.throws(() => normalize({ ...row(), duration_certainty: "invented" }));
  const s = new Store(":memory:");
  try {
    s.import([row()]);
    assert.throws(() => s.track(s.all()[0].id, { reminder: "2027-02-31" }));
  } finally {
    s.close();
  }
});
const row = () =>
  normalize({
    company: "Fixture Co",
    title: "Synthetic test fixture",
    locations: ["Singapore"],
    url: "https://example.test/job/42",
    description: "Original description",
  });
test("deduplicate URL tracking variants and preserve personal data on refresh", () => {
  const s = new Store(":memory:");
  try {
    s.import([row()]);
    const j = s.all()[0];
    s.track(j.id, {
      saved: true,
      status: "Recruiter call",
      notes: "Private test note",
      labels: ["Priority"],
      reminder: "2027-05-01",
    });
    const r = s.import([
      {
        ...row(),
        url: "https://www.example.test/job/42?utm_source=test",
        description: "Updated description",
      },
    ]);
    assert.deepEqual(r, { inserted: 0, updated: 1, total: 1 });
    const updated = s.all()[0];
    assert.equal(updated.notes, "Private test note");
    assert.equal(updated.status, "Recruiter call");
    assert.equal(updated.saved, true);
    assert.deepEqual(updated.labels, ["Priority"]);
    assert.equal(updated.description, "Updated description");
  } finally {
    s.close();
  }
});
test("alternate source URLs deduplicate by company, title and location", () => {
  const s = new Store(":memory:");
  try {
    s.import([
      row(),
      {
        ...row(),
        url: "https://another.example.test/jobs/second",
        source: "Second source",
      },
    ]);
    assert.equal(s.all().length, 1);
    assert.equal(s.all()[0].aliases?.length, 2);
  } finally {
    s.close();
  }
});
test("CSV supports quoted commas and multiline descriptions", () => {
  const jobs = readImport(
    'company,title,description,location\n"Fixture, Co",Test,"Line one\nLine two",Singapore',
    "csv",
  );
  assert.equal(jobs[0].company, "Fixture, Co");
  assert.equal(jobs[0].description, "Line one\nLine two");
});
test("CSV export escapes spreadsheet formulas and round-trips listings", () => {
  const s = new Store(":memory:");
  try {
    s.import([{ ...row(), title: "=Not a real vacancy" }]);
    const csv = exportCsv(s.all());
    assert.ok(csv.includes("'=Not a real vacancy"));
    assert.equal(readImport(csv, "csv").length, 1);
  } finally {
    s.close();
  }
});
test("invalid import rows and unsafe application URLs are rejected", () => {
  assert.throws(() => readImport([{ company: "X" }]));
  assert.throws(() =>
    normalize({ company: "X", title: "Y", url: "javascript:alert(1)" }),
  );
  assert.throws(() =>
    normalize({ company: "X", title: "Y", start_date: "2027-02-31" }),
  );
});
test("backup/restore retains notes, presets, source dates and custom stages", () => {
  const s = new Store(":memory:");
  try {
    s.import([row()]);
    s.track(s.all()[0].id, {
      notes: "Fixture note",
      status: "Custom stage",
      saved: true,
    });
    s.savePreset({
      id: "test",
      name: "Fixture preset",
      filters: { ...blankFilters(), search: "fixture" },
    });
    const b = s.backup();
    s.import([
      {
        ...row(),
        title: "Another synthetic fixture",
        url: "https://example.test/2",
      },
    ]);
    s.restore(b);
    assert.equal(s.all().length, 1);
    assert.equal(s.all()[0].notes, "Fixture note");
    assert.ok(s.presets().some((p) => p.id === "test"));
  } finally {
    s.close();
  }
});
test("failed restore rolls back without losing existing data", () => {
  const s = new Store(":memory:");
  try {
    s.import([row()]);
    const b = s.backup() as any;
    b.tables.jobs[0].company_id = "missing-company";
    assert.throws(() => s.restore(b));
    assert.equal(s.all().length, 1);
  } finally {
    s.close();
  }
});
test("SQLite persistence and migrations survive closing/reopening", () => {
  const dir = mkdtempSync(join(tmpdir(), "fieldwork-test-")),
    file = join(dir, "test.sqlite");
  let s = new Store(file);
  try {
    s.import([row()]);
    s.setting("preferences", { ...blankFilters(), search: "saved filter" });
    s.close();
    s = new Store(file);
    assert.equal(s.all().length, 1);
    assert.equal(s.setting("preferences").search, "saved filter");
    assert.equal(
      (s.db.prepare("SELECT COUNT(*) n FROM migrations").get() as any).n,
      1,
    );
  } finally {
    s.close();
    for (const f of readdirSync(dir)) unlinkSync(join(dir, f));
    rmdirSync(dir);
  }
});
test("research facts do not transfer the old short-window compatibility conclusion", () => {
  const j = normalize(
    investigationFacts(
      {
        company: "Fixture",
        role: "Summer fixture",
        job_url: "https://example.test/1",
      },
      {
        internship_period: {
          start: "2027-06-07",
          end: "2027-08-13",
          evidence_status: "employer_verified",
        },
        advertised_duration: {
          minimum: 10,
          maximum: 10,
          unit: "week",
          text: "10 weeks",
          evidence_status: "employer_verified",
        },
        availability_assessment: { status: "fits_exact_dates" },
      },
    ),
  );
  assert.equal(j.start.certainty, "verified");
  assert.equal(j.saved, false);
  assert.equal(j.start.flexible, false);
});
test("local HTTP API rejects foreign origins and exposes bootstrap/import/tracking", async () => {
  const s = new Store(":memory:"),
    server = createApp(s, 0);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port,
    base = `http://127.0.0.1:${port}`;
  try {
    assert.equal(
      (
        await fetch(base + "/api/bootstrap", {
          headers: { Origin: "https://foreign.example" },
        })
      ).status,
      403,
    );
    const r = await fetch(base + "/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "json",
        content: [
          {
            company: "API fixture",
            title: "Test fixture",
            url: "https://example.test/api",
          },
        ],
      }),
    });
    assert.equal(r.status, 200);
    const b = (await (await fetch(base + "/api/bootstrap")).json()) as any;
    assert.equal(b.jobs.length, 1);
    const saved = await fetch(base + `/api/jobs/${b.jobs[0].id}/tracking`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saved: true, status: "Applied" }),
    });
    assert.equal(saved.status, 200);
    assert.equal(s.all()[0].status, "Applied");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    s.close();
  }
});
