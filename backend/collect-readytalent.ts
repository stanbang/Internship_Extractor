/** User-operated Chrome, normal UI only. Never reads auth/storage or calls portal APIs. */
import { chromium, type Page } from "playwright-core";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  RT_EMPLOYMENT,
  RT_PROGRAMME,
  RT_SOURCE,
  type ReadyTalentDataset,
  type ReadyTalentPosting,
} from "../shared/readytalent.js";
import { portalDate, readyTalentListingChanged } from "./readytalent.js";
import { acquireCollection } from "./source-lock.js";

const origin = "https://readytalent2.singaporetech.edu.sg";
const file = resolve("data/readytalent/readytalent-current.json");
const args = process.argv.slice(2),
  limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
const force = args.includes("--refresh-details");
let stopRequested = false;
process.once("SIGINT", () => {
  stopRequested = true;
});
process.once("SIGTERM", () => {
  stopRequested = true;
});
const labels = [
  "Employment Type",
  "Posting Date",
  "Deadline",
  "Acceptance Deadline",
  "Applicants",
  "Vacancies",
  "Job Duration",
  "Type of IWSP",
  "Work Location",
  "Work Week",
  "Working Hours",
  "Allowance",
  "Salary",
  "BTC Days",
  "Mode of BTC",
  "Additional Paid Leave (Excl. BTC)",
  "Medical Leave",
  "Compassionate Leave",
  "Other Benefits",
  "Annual Leave",
  "Allowance (Others)",
  "Remuneration Type",
  "Skill Set",
  "Rate",
  "Total Allowance",
];
const iso = () => new Date().toISOString();
function checkpoint(data: ReadyTalentDataset) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file + ".tmp", JSON.stringify(data, null, 2));
  renameSync(file + ".tmp", file);
}
function assertPortal(page: Page) {
  if (new URL(page.url()).origin !== origin)
    throw Error(
      "Login or external navigation requires manual attention. Collection stopped.",
    );
}
async function rowData(page: Page) {
  return page.locator("#Avail_Jobs tbody tr").evaluateAll((rows) =>
    rows.flatMap((row) => {
      const a = row.querySelector<HTMLAnchorElement>(
        'h3 a[href*="jobDetails"]',
      );
      if (!a) return [];
      const id = a
        .getAttribute("href")
        ?.match(
          /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
        )?.[0];
      if (!id) return [];
      const text = (row as HTMLElement).innerText;
      const title = a.innerText.trim();
      const lines = text
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      return [
        {
          id,
          title,
          text,
          lines,
          company:
            lines.find(
              (s) =>
                s !== title &&
                !/View Details|Closed on|Vacanc|Integrated Work Study|^\$/.test(
                  s,
                ),
            ) ?? "",
        },
      ];
    }),
  );
}
async function detail(page: Page) {
  return page.locator("#jobtitle").evaluate((title, labels) => {
    const metadata: Record<string, string | null> = {};
    for (const label of labels) {
      const node = [
        ...document.querySelectorAll("label,span,strong,b,div,p,td"),
      ].find(
        (e) =>
          !!(e as HTMLElement).offsetParent && e.textContent?.trim() === label,
      );
      let branch = node,
        value: string | null = null;
      for (let i = 0; branch?.parentElement && i < 5; i++) {
        const peers = [...branch.parentElement.children].filter(
          (e) => e !== branch && !!(e as HTMLElement).offsetParent,
        );
        const texts = peers
          .map((e) => (e as HTMLElement).innerText?.trim())
          .filter(Boolean);
        if (texts.length) {
          if (
            !texts.some((t) =>
              labels.some((l) => t === l || t.startsWith(l + "\n")),
            )
          )
            value = texts.join("\n");
          break;
        }
        branch = branch.parentElement;
      }
      metadata[label] = value;
    }
    const areas = [
      ...document.querySelectorAll<HTMLTextAreaElement>("textarea"),
    ].filter((e) => !!e.offsetParent);
    const description = areas[0]?.value ?? null,
      requirements = areas[1]?.value ?? null;
    const headings = [...document.querySelectorAll("h2,h3")].filter(
      (e) => !!(e as HTMLElement).offsetParent,
    );
    const qualificationHeading = headings.find(
      (h) => h.textContent?.trim() === "Qualifications",
    );
    const qualifications = qualificationHeading?.nextElementSibling
      ? [...qualificationHeading.nextElementSibling.querySelectorAll("li")]
          .map((e) => e.textContent?.trim() ?? "")
          .filter(Boolean)
      : [];
    return {
      title: (title as HTMLElement).innerText.trim(),
      description,
      requirements,
      metadata,
      qualifications,
    };
  }, labels);
}
async function collect() {
  const previous: ReadyTalentDataset | null = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : null;
  const prior = new Map(previous?.jobs.map((j) => [j.source_job_id, j]) ?? []);
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  const search =
    context
      .pages()
      .find((p) => p.url().startsWith(origin + "/rt-student-search")) ??
    context.pages().find((p) => p.url().startsWith(origin));
  if (!search)
    throw Error(
      "No ReadyTalent page is open. Log in manually in the dedicated Chrome window.",
    );
  const owned = new Set<Page>();
  const onPopup = (p: Page) => owned.add(p);
  search.on("popup", onPopup);
  try {
    await search.goto(origin + "/rt-student-search/", {
      waitUntil: "domcontentloaded",
    });
    assertPortal(search);
    await search
      .locator("#employmenttypes")
      .selectOption({ label: RT_EMPLOYMENT });
    await search.locator("#programmes").selectOption({ label: RT_PROGRAMME });
    await search.getByRole("button", { name: "Search", exact: true }).click();
    await search
      .locator("#Avail_Jobs_info")
      .waitFor({ state: "visible", timeout: 45000 });
    if (await search.locator("#sort-table").count()) {
      const options = await search
        .locator("#sort-table option")
        .allTextContents();
      const latest = options.find((s) => /latest.*date/i.test(s));
      if (latest)
        await search.locator("#sort-table").selectOption({ label: latest });
    }
    const info = await search.locator("#Avail_Jobs_info").innerText();
    const total = Number(
      info.match(/of\s+([\d,]+)\s+entries/i)?.[1]?.replaceAll(",", ""),
    );
    if (!Number.isInteger(total) || total < 1)
      throw Error("Could not verify filtered source count: " + info);
    const pages = Math.ceil(total / 20),
      rows: ReadyTalentPosting[] = [];
    const data: ReadyTalentDataset = {
      manifest: {
        source: RT_SOURCE,
        source_type: "IWSP",
        employment_type: RT_EMPLOYMENT,
        programme: RT_PROGRAMME,
        expected_count: total,
        expected_pages: pages,
        pages_processed: [],
        errors: [],
        started_at: iso(),
        finished_at: null,
        evidence_ids: ["normal-browser-ui:single-session"],
      },
      jobs: rows,
    };
    for (let p = 1; p <= pages; p++) {
      assertPortal(search);
      const current = await rowData(search);
      console.log(
        JSON.stringify({
          stage: "listing-page",
          page: p,
          count: current.length,
          total,
          first: p === 1 ? current[0] : undefined,
        }),
      );
      if (current.length !== Math.min(20, total - (p - 1) * 20))
        throw Error("Unexpected listing count on page " + p);
      for (const row of current) {
        const old = prior.get(row.id);
        if (!row.company && !old)
          throw Error("Company missing for source ID " + row.id);
        const url = new URL(origin + "/rt-student-search/");
        url.searchParams.set("q", row.title);
        url.searchParams.set("employmenttypes", RT_EMPLOYMENT);
        url.searchParams.set("programmes", RT_PROGRAMME);
        const closing = portalDate(
          row.text.match(/Closed on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1],
        );
        const advertised = row.text.match(/\$[\d,.]+/)?.[0] ?? null;
        rows.push(
          old
            ? {
                ...old,
                job_title: row.title,
                company_name: row.company || old.company_name,
                page: p,
                extracted_at: iso(),
                closing_date: closing ?? old.closing_date,
                original_metadata: {
                  ...old.original_metadata,
                  "Search row text": row.text,
                  "Advertised amount": advertised,
                },
              }
            : {
                source: RT_SOURCE,
                source_type: "IWSP",
                source_job_id: row.id,
                job_title: row.title,
                company_name: row.company,
                employment_type: RT_EMPLOYMENT,
                eligible_programmes: null,
                original_description: null,
                original_posting_text: null,
                responsibilities: null,
                minimum_requirements: null,
                preferred_qualifications: null,
                technical_skills: null,
                programming_languages: null,
                technologies: null,
                categories: null,
                monthly_allowance: null,
                vacancies: null,
                work_location: null,
                internship_period: null,
                closing_date: portalDate(
                  row.text.match(/Closed on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1],
                ),
                application_status: null,
                original_url: url.toString(),
                extracted_at: iso(),
                last_verified_at: null,
                page: p,
                evidence_id: null,
                original_metadata: {
                  "Search row text": row.text,
                  "Advertised amount": row.text.match(/\$[\d,.]+/)?.[0] ?? null,
                },
                availability: "unverified",
                availability_evidence: null,
              },
        );
      }
      data.manifest.pages_processed.push(p);
      if (p < pages) {
        const oldFirst = current[0].id;
        await search
          .getByRole("link", { name: "Next", exact: true })
          .first()
          .click();
        await search.waitForFunction(
          (id) => !document.querySelector(`#Avail_Jobs h3 a[href*="${id}"]`),
          oldFirst,
          { timeout: 15000 },
        );
      }
    }
    if (new Set(rows.map((j) => j.source_job_id)).size !== total)
      throw Error("Duplicate or missing source IDs across listing pages.");
    checkpoint(data);
    let processed = 0;
    // This portal's observed date ordering is oldest first. Capture the final
    // result pages first so newly added postings become useful early in a sync.
    for (const row of [...rows].reverse()) {
      if (processed >= limit || stopRequested) break;
      const previousRow = prior.get(row.source_job_id);
      const changed = readyTalentListingChanged(previousRow, row);
      if (row.original_description?.trim() && !force && !changed) continue;
      assertPortal(search);
      // Navigate through the DataTable's normal page links; never guess a detail URL.
      const desired = row.page!;
      const currentText = await search.locator("#Avail_Jobs_info").innerText();
      const first = Number(currentText.match(/Showing\s+(\d+)/i)?.[1] ?? 1);
      const currentPage = Math.floor((first - 1) / 20) + 1;
      if (currentPage !== desired) {
        if (currentPage > desired)
          await search
            .getByRole("link", { name: "First", exact: true })
            .first()
            .click();
        for (let p = currentPage > desired ? 1 : currentPage; p < desired; p++)
          await search
            .getByRole("link", { name: "Next", exact: true })
            .first()
            .click();
      }
      const link = search.locator(`h3 a[href*="${row.source_job_id}"]`);
      await link.waitFor({ state: "visible", timeout: 15000 });
      let popup: Page | undefined;
      let blocked: string | null = null;
      try {
        const [opened] = await Promise.all([
          search.waitForEvent("popup", { timeout: 12000 }),
          link.click({ timeout: 12000 }),
        ]);
        popup = opened;
        owned.add(popup);
        await popup.waitForLoadState("domcontentloaded");
        assertPortal(popup);
        await popup
          .locator("#jobtitle")
          .filter({ hasText: row.job_title })
          .waitFor({ state: "visible", timeout: 20000 });
        const d = await detail(popup);
        if (d.title !== row.job_title || !d.description?.trim())
          throw Error("Detail is blank or does not match the selected job.");
        row.original_description = d.description;
        row.minimum_requirements = d.requirements;
        if (d.qualifications.includes(RT_PROGRAMME))
          row.eligible_programmes = d.qualifications;
        row.original_metadata = {
          ...row.original_metadata,
          ...d.metadata,
          "Job Requirements": d.requirements,
        };
        row.original_posting_text = [
          row.job_title,
          row.company_name,
          "Job Description",
          d.description,
          "Job Requirements",
          d.requirements,
          "Qualifications",
          ...d.qualifications,
          ...Object.entries(d.metadata)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`),
        ]
          .filter(Boolean)
          .join("\n");
        row.work_location = d.metadata["Work Location"];
        row.internship_period = d.metadata["Job Duration"];
        row.closing_date =
          portalDate(d.metadata["Deadline"]) ?? row.closing_date;
        row.vacancies = /^\d+$/.test(d.metadata["Vacancies"] ?? "")
          ? Number(d.metadata["Vacancies"])
          : row.vacancies;
        row.last_verified_at = iso();
        row.evidence_id =
          "ui-sha256:" +
          createHash("sha256").update(row.original_posting_text).digest("hex");
        row.availability = "available";
        row.availability_evidence =
          "Listing and matching full job details were visible in the authenticated portal through normal UI.";
        console.log(
          JSON.stringify({
            stage: "detail-saved",
            done: processed + 1,
            title: row.job_title,
            posted: d.metadata["Posting Date"],
            characters: d.description.length,
            requirements: d.requirements?.length ?? 0,
            openOwned: owned.size,
          }),
        );
      } catch (e) {
        if (
          popup &&
          (new URL(popup.url()).origin !== origin ||
            (await popup
              .getByText(
                /verify you are human|too many requests|session expired|unusual traffic|complete the captcha|sign in to continue/i,
              )
              .first()
              .isVisible()
              .catch(() => false)))
        ) {
          blocked =
            "ReadyTalent requires manual login or verification, or has limited requests. Collection stopped; resolve it normally in Chrome before resuming.";
        }
        data.manifest.errors.push({
          page: row.page,
          job_id: row.source_job_id,
          message: blocked ?? (e as Error).message.slice(0, 500),
        });
        console.log(
          JSON.stringify({
            stage: "detail-error",
            title: row.job_title,
            error: (e as Error).message.slice(0, 220),
          }),
        );
      } finally {
        // Close only popups created by this run. Keep the user's search/session open.
        for (const p of owned) {
          if (!p.isClosed()) await p.close({ runBeforeUnload: false });
          owned.delete(p);
        }
        checkpoint(data);
        processed++;
        console.log(
          JSON.stringify({
            stage: "checkpoint",
            full: rows.filter((j) => j.original_description?.trim()).length,
            title: row.job_title,
          }),
        );
      }
      if (blocked) throw Error(blocked);
    }
    const missing = rows.filter((j) => !j.original_description?.trim()).length;
    if (missing)
      data.manifest.errors.push({
        page: null,
        job_id: null,
        message: `${missing} listings still require full details. Resume matching is blocked for those listings.`,
      });
    data.manifest.finished_at = iso();
    checkpoint(data);
    console.log(
      JSON.stringify({
        stage: "finished",
        total,
        full: total - missing,
        missing,
        errors: data.manifest.errors.length,
        ownedWindowsOpen: owned.size,
      }),
    );
  } finally {
    search.off("popup", onPopup);
    for (const p of owned)
      if (!p.isClosed())
        await p.close({ runBeforeUnload: false }).catch(() => {});
    // With a connected browser this disconnects our client; it does not quit Chrome.
    await browser.close();
  }
}
async function main() {
  const release = acquireCollection();
  try {
    await collect();
  } finally {
    release();
  }
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
