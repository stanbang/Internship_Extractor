import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { Store } from "../backend/database.js";
import { normalize } from "../backend/ingest.js";
import {
  importReadyTalent,
  latestCoverage,
  exportReadyTalent,
  exportReadyTalentCsv,
  normalizeReadyTalent,
} from "../backend/readytalent.js";
import {
  blankIWSPFilters,
  filterIWSP,
  RT_SOURCE,
  RT_EMPLOYMENT,
  RT_PROGRAMME,
  type ReadyTalentDataset,
} from "../shared/readytalent.js";
import {
  discoverResumes,
  loadResume,
  skillStatus,
  digest,
  postingHash,
  evidenceMatch,
  importAgentReview,
  resumeState,
  reviewPacket,
  docxText,
} from "../backend/resume.js";
import { createApp } from "../backend/server.js";

const timestamp = "2026-10-21T08:00:00Z";
function posting(id = "synthetic-iwsp-a", patch: Record<string, unknown> = {}) {
  return normalizeReadyTalent({
    source: RT_SOURCE,
    source_type: "IWSP",
    source_job_id: id,
    job_title: "Synthetic Software Intern",
    company_name: "Example Test Company",
    employment_type: RT_EMPLOYMENT,
    eligible_programmes: [RT_PROGRAMME],
    original_description:
      "Build C++ graphics projects. Python preferred.\nWork in Singapore.",
    monthly_allowance: {
      min: 1800,
      max: 2000,
      currency: "SGD",
      text: "SGD 1,800–2,000 per month",
    },
    technical_skills: ["C++", "Python"],
    categories: ["Software engineering"],
    original_url:
      "https://readytalent2.singaporetech.edu.sg/rt-student-search/",
    page: 1,
    extracted_at: timestamp,
    availability: "unverified",
    ...patch,
  });
}
function dataset(
  jobs = [posting()],
  patch: Record<string, unknown> = {},
): ReadyTalentDataset {
  return {
    jobs,
    manifest: {
      source: RT_SOURCE,
      source_type: "IWSP",
      employment_type: RT_EMPLOYMENT,
      programme: RT_PROGRAMME,
      expected_count: jobs.length,
      expected_pages: 1,
      pages_processed: [1],
      errors: [],
      started_at: timestamp,
      finished_at: timestamp,
      evidence_ids: ["synthetic-evidence"],
      ...patch,
    },
  };
}

test("IWSP stable IDs distinguish identical roles and isolate public imports", () => {
  const s = new Store(":memory:");
  try {
    importReadyTalent(s, dataset([posting("a"), posting("b")]));
    const j = s.all()[0];
    s.import([normalize({ ...j, source: "Public source" })]);
    assert.equal(s.all().length, 3);
    assert.equal(s.all().filter((j) => j.readyTalent).length, 2);
    importReadyTalent(
      s,
      dataset([posting("a", { job_title: "Updated synthetic role" })]),
    );
    assert.equal(s.all().length, 3);
    assert.equal(
      s.all().find((j) => j.sourceJobId === "a")?.title,
      "Updated synthetic role",
    );
  } finally {
    s.close();
  }
});
test("refresh preserves verbatim descriptions, bookmarks, notes and unknown provenance", () => {
  const s = new Store(":memory:");
  try {
    const raw = "  Complete text\n\nwith exact whitespace and C++  ";
    importReadyTalent(
      s,
      dataset([posting("a", { original_description: raw })]),
    );
    const j = s.all()[0];
    s.track(j.id, {
      saved: true,
      notes: "My private note",
      status: "Researching",
    });
    importReadyTalent(
      s,
      dataset([
        posting("a", { original_description: null, monthly_allowance: null }),
      ]),
    );
    const refreshed = s.get(j.id)!;
    assert.equal(refreshed.description, raw);
    assert.equal(refreshed.readyTalent?.original_description, raw);
    assert.equal(refreshed.notes, "My private note");
    assert.equal(refreshed.status, "Researching");
    assert.equal(refreshed.saved, true);
    assert.equal(refreshed.start.value, null);
    assert.equal(refreshed.duration.min, null);
    assert.equal(refreshed.postedAt, null);
    assert.equal(latestCoverage(s)?.complete, false);
    assert.equal(latestCoverage(s)?.missing_descriptions, 1);
  } finally {
    s.close();
  }
});
test("completeness requires all pages, row counts and full descriptions, and remembers last complete refresh", () => {
  const s = new Store(":memory:");
  try {
    const full = importReadyTalent(s, dataset());
    assert.equal(full.coverage.complete, true);
    assert.equal(
      importReadyTalent(
        s,
        dataset([posting()], { expected_pages: 2, expected_count: 2 }),
      ).coverage.complete,
      false,
    );
    assert.equal(
      importReadyTalent(s, dataset([posting("a", { page: null })])).coverage
        .complete,
      false,
    );
    assert.equal(
      importReadyTalent(
        s,
        dataset([posting("a", { original_description: "" })]),
      ).coverage.complete,
      false,
    );
    assert.equal(
      importReadyTalent(
        s,
        dataset([posting()], {
          errors: [{ page: 1, job_id: null, message: "Synthetic failure" }],
        }),
      ).coverage.complete,
      false,
    );
    assert.equal(latestCoverage(s)?.last_successful_refresh, timestamp);
    assert.throws(() =>
      importReadyTalent(s, dataset([posting("a"), posting("a")])),
    );
    assert.throws(() =>
      importReadyTalent(s, dataset([posting()], { pages_processed: [1, 1] })),
    );
    assert.throws(() =>
      importReadyTalent(
        s,
        dataset([posting()], { programme: "Other programme" }),
      ),
    );
  } finally {
    s.close();
  }
});
test("absence never expires a job; explicit unavailable verification requires evidence", () => {
  const s = new Store(":memory:");
  try {
    const available = posting("a", {
      availability: "available",
      availability_evidence: "Synthetic source listed it",
      last_verified_at: timestamp,
    });
    importReadyTalent(s, dataset([available]));
    importReadyTalent(s, dataset([posting("b")]));
    assert.equal(
      s.all().find((j) => j.sourceJobId === "a")?.availability,
      "available",
    );
    assert.throws(() => posting("a", { availability: "unavailable" }));
    importReadyTalent(
      s,
      dataset([
        posting("a", {
          availability: "unavailable",
          last_verified_at: timestamp,
          availability_evidence:
            "Synthetic employer explicitly removed posting",
        }),
      ]),
    );
    assert.equal(
      s.all().find((j) => j.sourceJobId === "a")?.availability,
      "unavailable",
    );
  } finally {
    s.close();
  }
});
test("metadata validation rejects auth material and unsafe URLs; exports retain full original fields", () => {
  assert.throws(() =>
    posting("a", { original_metadata: { token: "synthetic" } }),
  );
  assert.throws(() => posting("a", { original_url: "javascript:alert(1)" }));
  const s = new Store(":memory:");
  try {
    importReadyTalent(
      s,
      dataset([posting("a", { company_name: "=SYNTHETIC()" })]),
    );
    assert.equal(exportReadyTalent(s)?.jobs[0].source_job_id, "a");
    assert.match(exportReadyTalentCsv(s), /'=SYNTHETIC/);
  } finally {
    s.close();
  }
});
test("IWSP search spans full text, salary and date unknowns stay user controlled, resume nulls stay visible", () => {
  const s = new Store(":memory:");
  try {
    importReadyTalent(
      s,
      dataset([
        posting("a", { closing_date: "2027-02-27" }),
        posting("b", {
          monthly_allowance: null,
          closing_date: null,
          job_title: "Other intern",
        }),
      ]),
    );
    const js = s.all(),
      f = blankIWSPFilters();
    assert.equal(filterIWSP(js, f).length, 2);
    assert.equal(filterIWSP(js, { ...f, search: "graphics" }).length, 2);
    assert.equal(
      filterIWSP(js, { ...f, minSalary: "1900", includeUnknownSalary: false })
        .length,
      1,
    );
    assert.equal(
      filterIWSP(js, {
        ...f,
        closingThrough: "2027-03-01",
        includeUnknownClosing: false,
      }).length,
      1,
    );
    const b = js.find((j) => j.sourceJobId === "b")!;
    assert.equal(
      filterIWSP(js, { ...f, sort: "resume" }, { [b.id]: 85 })[0].id,
      b.id,
    );
    assert.equal(filterIWSP(js, { ...f, sort: "resume" }).length, 2);
    assert.equal(filterIWSP(js, { ...f, skills: ["C++"] }).length, 2);
  } finally {
    s.close();
  }
});
test("v2 backup restores IWSP source facts and v1 backup remains compatible", () => {
  const s = new Store(":memory:");
  try {
    importReadyTalent(s, dataset());
    const backup = s.backup();
    assert.equal(backup.version, 2);
    s.restore(backup);
    assert.equal(s.all()[0].sourceJobId, "synthetic-iwsp-a");
    assert.equal(latestCoverage(s)?.complete, true);
    const old: any = { ...backup, version: 1, tables: { ...backup.tables } };
    delete old.tables.readytalent_jobs;
    delete old.tables.readytalent_refreshes;
    s.restore(old);
    assert.equal(latestCoverage(s), null);
    assert.equal(s.all()[0].readyTalent, null);
  } finally {
    s.close();
  }
});
test("root resume discovery is explicit, parsing DOCX preserves paragraphs, no unrelated files loaded", async () => {
  const root = mkdtempSync(join(tmpdir(), "fieldwork-resume-")),
    s = new Store(":memory:");
  try {
    writeFileSync(
      join(root, "resume.txt"),
      "Synthetic candidate resume\nBuilt a C++ renderer project with tests.",
    );
    writeFileSync(join(root, "secret.txt"), "Unrelated");
    assert.deepEqual(discoverResumes(root), ["resume.txt"]);
    await assert.rejects(loadResume(s, "../secret.txt", root));
    const r = await loadResume(s, "resume.txt", root);
    assert.equal(r.hash, digest(r.text));
    const xml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Built C++ &amp; Python</w:t></w:r></w:p><w:p><w:r><w:t>Project</w:t></w:r></w:p></w:body></w:document>';
    assert.equal(
      docxText(zipSync({ "word/document.xml": strToU8(xml) })),
      "Built C++ & Python\nProject\n",
    );
  } finally {
    s.close();
    rmSync(root, { recursive: true });
  }
});
test("PDF resume loading extracts actual text without a cloud service", async () => {
  const root = mkdtempSync(join(tmpdir(), "fieldwork-pdf-")),
    s = new Store(":memory:");
  try {
    const content =
      "BT /F1 12 Tf 72 720 Td (Synthetic resume: Built a C++ renderer project with tests.) Tj ET";
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((value, i) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${i + 1} 0 obj\n${value}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((o) => String(o).padStart(10, "0") + " 00000 n ")
      .join(
        "\n",
      )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    writeFileSync(join(root, "resume.pdf"), pdf);
    const r = await loadResume(s, "resume.pdf", root);
    assert.match(r.text, /Built a C\+\+ renderer project/);
  } finally {
    s.close();
    rmSync(root, { recursive: true });
  }
});

test("keyword evidence distinguishes Java/JavaScript and C/C++, and never invents overall fit", () => {
  const s = new Store(":memory:");
  try {
    importReadyTalent(
      s,
      dataset([
        posting("a", {
          technical_skills: ["Java", "JavaScript", "C", "C++"],
          original_description: "Build Java and JavaScript with C and C++.",
        }),
      ]),
    );
    const r = {
      name: "synthetic.txt",
      text: "Built a JavaScript and C++ project.",
      hash: "synthetic",
      loaded_at: timestamp,
    };
    const result = evidenceMatch(
      s.all()[0],
      r,
      {
        cleaned: s.all()[0].description,
        findings: { verdict: "posting_guard: clean" },
      },
      null,
    );
    assert.deepEqual(
      result.matched.map((m) => m.skill),
      ["JavaScript", "C++"],
    );
    assert.deepEqual(result.not_evidenced, ["Java", "C"]);
    assert.equal(result.agent_review, null);
    const flagged = evidenceMatch(
      s.all()[0],
      r,
      { cleaned: "", findings: { verdict: "posting_guard: ⚠ instruction" } },
      null,
    );
    assert.equal(flagged.technical_coverage, null);
    assert.deepEqual(flagged.matched, []);
  } finally {
    s.close();
  }
});
function syntheticSkillRoot() {
  const root = mkdtempSync(join(tmpdir(), "fieldwork-skills-"));
  // Isolated test fixture: never reads the real candidate profile.
  mkdirSync(join(root, ".claude/skills/job-application-assistant"), {
    recursive: true,
  });
  mkdirSync(join(root, "tools"));
  writeFileSync(
    join(root, ".claude/skills/job-application-assistant/SKILL.md"),
    "Synthetic skill fixture",
  );
  writeFileSync(
    join(root, ".claude/skills/job-application-assistant/04-job-evaluation.md"),
    "framework_version: synthetic\n- Technical Skills: 30%\n- Experience Match: 25%\n- Behavioral Fit: 15%\n- Career Alignment: 30%\n",
  );
  writeFileSync(
    join(root, "tools/posting_guard.py"),
    "def guard(raw, mode):\n return raw, {'verdict':'posting_guard: clean'}\n",
  );
  return root;
}
test("canonical skill bridge prepares packets; agent imports check hashes, quotes and weighted scores", async () => {
  const s = new Store(":memory:"),
    root = syntheticSkillRoot(),
    previous = process.env.AI_JOB_SEARCH_DIR;
  process.env.AI_JOB_SEARCH_DIR = root;
  try {
    importReadyTalent(s, dataset());
    const j = s.all()[0];
    s.setting("resume", {
      name: "synthetic",
      text: "Built C++ graphics projects.",
      hash: digest("Built C++ graphics projects."),
      loaded_at: timestamp,
    });
    assert.throws(
      () =>
        importAgentReview(s, {
          job_id: j.id,
          resume_hash: "stale",
          posting_hash: postingHash(j),
        }),
      /stale|canonical framework/,
    );
    assert.equal(skillStatus(root).framework_version, "synthetic");
    const state = await resumeState(s, root);
    assert.equal(state.results.length, 1);
    assert.equal(state.results[0].technical_coverage, 50);
    const packet = await reviewPacket(s, j.id, root);
    assert.equal(packet.posting.posting_hash, postingHash(j));
    const response: any = packet.response_template;
    for (const d of Object.values(response.dimensions) as any[]) {
      d.score = 80;
      d.resume_quote = "Built C++ graphics projects.";
      d.job_quote = "Build C++ graphics projects.";
    }
    assert.equal(importAgentReview(s, response, root).overall, 80);
    response.dimensions.technical.resume_quote = "Invented certified skill";
    assert.throws(
      () => importAgentReview(s, response, root),
      /not in the supplied/,
    );
    response.dimensions.technical.resume_quote = "Built C++ graphics projects.";
    response.dimensions.behavioral.score = null;
    assert.equal(importAgentReview(s, response, root).overall, null);
    importReadyTalent(
      s,
      dataset([
        posting("synthetic-iwsp-a", {
          original_description: "Changed posting",
        }),
      ]),
    );
    assert.throws(() => importAgentReview(s, response, root), /stale/);
  } finally {
    s.close();
    if (previous === undefined) delete process.env.AI_JOB_SEARCH_DIR;
    else process.env.AI_JOB_SEARCH_DIR = previous;
    rmSync(root, { recursive: true });
  }
});
test("IWSP HTTP import, source-fact protection, local tracking and exports work together", async () => {
  const s = new Store(":memory:"),
    app = createApp(s, 0);
  await new Promise<void>((ok) => app.listen(0, "127.0.0.1", ok));
  const address = app.address() as { port: number },
    base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, method = "GET", body?: unknown) =>
    fetch(base + "/api" + path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    assert.equal(
      (await request("/readytalent/import", "POST", dataset())).status,
      200,
    );
    const j = s.all()[0];
    assert.equal(
      (await request(`/jobs/${j.id}`, "PUT", { description: "Overwrite" }))
        .status,
      400,
    );
    assert.equal(
      (await request(`/jobs/${j.id}/tracking`, "PATCH", { saved: true }))
        .status,
      200,
    );
    assert.equal(s.get(j.id)?.saved, true);
    assert.equal(
      (await (await request("/readytalent")).json()).coverage.complete,
      true,
    );
    assert.match(
      await (await request("/readytalent/export?format=csv")).text(),
      /source_job_id/,
    );
    assert.equal((await (await request("/bootstrap")).json()).jobs.length, 1);
  } finally {
    await new Promise<void>((ok) => app.close(() => ok()));
    s.close();
  }
});
