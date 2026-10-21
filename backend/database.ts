import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  blankFilters,
  PERSONAL_PRESET,
  STATUSES,
  type Job,
  type Preset,
} from "../shared/model.js";
import { canonicalUrl, identity, bounds } from "../shared/filter.js";
import { readyTalentJob } from "./readytalent.js";
const tables = [
  "companies",
  "categories",
  "levels",
  "locations",
  "sources",
  "statuses",
  "jobs",
  "job_categories",
  "job_levels",
  "job_locations",
  "job_sources",
  "job_dates",
  "job_durations",
  "tracking",
  "notes",
  "labels",
  "job_labels",
  "presets",
  "settings",
  "readytalent_jobs",
  "readytalent_refreshes",
];
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.migrate();
  }
  migrate() {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`,
    );
    if (
      !this.db.prepare("SELECT version FROM migrations WHERE version=1").get()
    )
      this.transaction(() => {
        this.db.exec(`
CREATE TABLE companies(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE categories(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE levels(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE locations(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE sources(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE statuses(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE jobs(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),title TEXT NOT NULL,description TEXT NOT NULL,posted_at TEXT,url TEXT NOT NULL,duplicate_key TEXT NOT NULL UNIQUE,collected_at TEXT NOT NULL,verified_at TEXT,availability TEXT NOT NULL,skills TEXT NOT NULL,eligibility TEXT NOT NULL,evidence TEXT NOT NULL);
CREATE TABLE job_categories(job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,category_id TEXT REFERENCES categories(id),PRIMARY KEY(job_id,category_id));
CREATE TABLE job_levels(job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,level_id TEXT REFERENCES levels(id),PRIMARY KEY(job_id,level_id));
CREATE TABLE job_locations(job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,location_id TEXT REFERENCES locations(id),PRIMARY KEY(job_id,location_id));
CREATE TABLE job_sources(job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,source_id TEXT REFERENCES sources(id),url TEXT NOT NULL,canonical_url TEXT NOT NULL UNIQUE,collected_at TEXT NOT NULL,source_page_url TEXT NOT NULL,PRIMARY KEY(job_id,source_id,url));
CREATE TABLE job_dates(job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,kind TEXT CHECK(kind IN ('start','end')),value TEXT,precision TEXT NOT NULL,certainty TEXT NOT NULL,flexible INTEGER NOT NULL,evidence TEXT NOT NULL,source_url TEXT,PRIMARY KEY(job_id,kind));
CREATE TABLE job_durations(job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,min REAL,max REAL,unit TEXT NOT NULL,qualifier TEXT NOT NULL,certainty TEXT NOT NULL,evidence TEXT NOT NULL);
CREATE TABLE tracking(job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,saved INTEGER NOT NULL DEFAULT 0,status_id TEXT NOT NULL REFERENCES statuses(id),reminder TEXT,deadline TEXT);
CREATE TABLE notes(job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,body TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE labels(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE job_labels(job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,label_id TEXT REFERENCES labels(id),PRIMARY KEY(job_id,label_id));
CREATE TABLE presets(id TEXT PRIMARY KEY,name TEXT NOT NULL,filters TEXT NOT NULL);
CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE INDEX jobs_posted ON jobs(posted_at);`);
        for (const name of STATUSES) this.named("statuses", name);
        this.savePreset(PERSONAL_PRESET);
        this.db
          .prepare("INSERT INTO migrations VALUES(1,?)")
          .run(new Date().toISOString());
      });
    if (
      !this.db.prepare("SELECT version FROM migrations WHERE version=2").get()
    )
      this.transaction(() => {
        this.db.exec(
          `CREATE TABLE readytalent_jobs(job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,source_job_id TEXT NOT NULL UNIQUE,payload TEXT NOT NULL);CREATE TABLE readytalent_refreshes(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,payload TEXT NOT NULL);`,
        );
        this.db
          .prepare("INSERT INTO migrations VALUES(2,?)")
          .run(new Date().toISOString());
      });
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  named(table: string, name: string): string {
    const found = this.db
      .prepare(`SELECT id FROM ${table} WHERE name=?`)
      .get(name) as any;
    if (found) return found.id;
    const id = randomUUID();
    this.db.prepare(`INSERT INTO ${table}(id,name) VALUES(?,?)`).run(id, name);
    return id;
  }
  import(rows: Omit<Job, "id">[]) {
    return this.transaction(() => {
      let inserted = 0,
        updated = 0;
      for (const row of rows) {
        const match = this.find(row);
        if (match) updated++;
        else inserted++;
        this.put(row, match);
      }
      return { inserted, updated, total: rows.length };
    });
  }
  find(row: Omit<Job, "id">): string | undefined {
    if (row.readyTalent) {
      return (
        this.db
          .prepare("SELECT job_id FROM readytalent_jobs WHERE source_job_id=?")
          .get(row.readyTalent.source_job_id) as any
      )?.job_id;
    }
    const c = canonicalUrl(row.url);
    const found =
      (c
        ? this.db
            .prepare(
              "SELECT job_id AS id FROM job_sources WHERE canonical_url=?",
            )
            .get(c)
        : null) ??
      this.db
        .prepare("SELECT id FROM jobs WHERE duplicate_key=?")
        .get(identity(row));
    return (found as any)?.id;
  }
  put(
    input: Omit<Job, "id">,
    existing?: string,
    preserveMissing = true,
  ): string {
    const id = existing ?? randomUUID(),
      old = existing ? this.get(existing) : null;
    // Refreshes preserve richer facts; an explicit edit may clear any field.
    const row = { ...input };
    if (old && preserveMissing) {
      for (const key of [
        "description",
        "url",
        "eligibility",
        "evidence",
      ] as const)
        if (!row[key]) row[key] = old[key];
      for (const key of ["postedAt", "verifiedAt"] as const)
        if (!row[key]) row[key] = old[key];
      for (const key of [
        "categories",
        "levels",
        "locations",
        "skills",
      ] as const)
        if (!row[key].length) row[key] = old[key];
      for (const key of ["start", "end"] as const)
        if (!row[key].value && !row[key].flexible) row[key] = old[key];
      if (row.duration.min === null && row.duration.max === null)
        row.duration = old.duration;
      if (row.availability === "unverified")
        row.availability = old.availability;
    }
    const company = this.named("companies", row.company);
    this.db
      .prepare(
        `INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,title=excluded.title,description=excluded.description,posted_at=excluded.posted_at,url=excluded.url,duplicate_key=excluded.duplicate_key,verified_at=excluded.verified_at,availability=excluded.availability,skills=excluded.skills,eligibility=excluded.eligibility,evidence=excluded.evidence`,
      )
      .run(
        id,
        company,
        row.title,
        row.description,
        row.postedAt,
        row.url,
        row.readyTalent
          ? `SIT ReadyTalent::${row.readyTalent.source_job_id}`
          : identity(row),
        row.collectedAt,
        row.verifiedAt,
        row.availability,
        JSON.stringify(row.skills),
        row.eligibility,
        row.evidence,
      );
    for (const [table, join, column, values] of [
      ["categories", "job_categories", "category_id", row.categories],
      ["levels", "job_levels", "level_id", row.levels],
      ["locations", "job_locations", "location_id", row.locations],
    ] as const) {
      this.db.prepare(`DELETE FROM ${join} WHERE job_id=?`).run(id);
      for (const name of [...new Set(values)])
        this.db
          .prepare(`INSERT INTO ${join} VALUES(?,?)`)
          .run(id, this.named(table, name));
    }
    const source = this.named("sources", row.source),
      sourceUrl = row.url || row.sourceUrl || `manual:${id}`;
    this.db
      .prepare(
        `INSERT INTO job_sources VALUES(?,?,?,?,?,?) ON CONFLICT(canonical_url) DO UPDATE SET source_id=excluded.source_id,collected_at=excluded.collected_at,source_page_url=excluded.source_page_url`,
      )
      .run(
        id,
        source,
        sourceUrl,
        row.readyTalent
          ? `readytalent:${row.readyTalent.source_job_id}`
          : canonicalUrl(row.url) || `manual:${id}:${source}`,
        row.collectedAt,
        row.sourceUrl,
      );

    for (const kind of ["start", "end"] as const) {
      const f = row[kind];
      this.db
        .prepare("INSERT OR REPLACE INTO job_dates VALUES(?,?,?,?,?,?,?,?)")
        .run(
          id,
          kind,
          f.value,
          f.precision,
          f.certainty,
          Number(f.flexible),
          f.evidence,
          f.sourceUrl ?? "",
        );
    }
    const d = row.duration;
    this.db
      .prepare("INSERT OR REPLACE INTO job_durations VALUES(?,?,?,?,?,?,?)")
      .run(id, d.min, d.max, d.unit, d.qualifier, d.certainty, d.evidence);
    if (!existing) {
      this.db
        .prepare("INSERT INTO tracking VALUES(?,0,?,NULL,?)")
        .run(id, this.named("statuses", "Not Started"), row.deadline);
      this.db
        .prepare("INSERT INTO notes VALUES(?,?,?)")
        .run(id, "", new Date().toISOString());
    } else if (row.deadline || !preserveMissing)
      this.db
        .prepare("UPDATE tracking SET deadline=? WHERE job_id=?")
        .run(row.deadline, id);
    if (row.readyTalent) {
      const previous = old?.readyTalent;
      const payload = { ...row.readyTalent };
      if (previous && preserveMissing) {
        for (const key of Object.keys(payload) as (keyof typeof payload)[]) {
          if (payload[key] === null) (payload as any)[key] = previous[key];
        }
      }
      if (
        previous &&
        preserveMissing &&
        payload.availability === "unverified"
      ) {
        payload.availability = previous.availability;
        payload.availability_evidence = previous.availability_evidence;
      }
      this.db
        .prepare(
          "INSERT INTO readytalent_jobs VALUES(?,?,?) ON CONFLICT(job_id) DO UPDATE SET source_job_id=excluded.source_job_id,payload=excluded.payload",
        )
        .run(id, payload.source_job_id, JSON.stringify(payload));
    }
    return id;
  }
  all(): Job[] {
    const rows = this.db
      .prepare(
        "SELECT jobs.*,companies.name AS company FROM jobs JOIN companies ON companies.id=jobs.company_id",
      )
      .all() as any[];
    return rows.map((r) => this.inflate(r));
  }
  get(id: string): Job | null {
    const r = this.db
      .prepare(
        "SELECT jobs.*,companies.name AS company FROM jobs JOIN companies ON companies.id=jobs.company_id WHERE jobs.id=?",
      )
      .get(id);
    return r ? this.inflate(r as any) : null;
  }
  inflate(r: any): Job {
    const names = (table: string, join: string, column: string) =>
      this.db
        .prepare(
          `SELECT name FROM ${table} t JOIN ${join} j ON t.id=j.${column} WHERE j.job_id=?`,
        )
        .all(r.id)
        .map((x: any) => x.name);
    const dates = this.db
      .prepare("SELECT * FROM job_dates WHERE job_id=?")
      .all(r.id) as any[];
    const fact = (kind: string) => {
      const f = dates.find((d) => d.kind === kind);
      return {
        value: f.value,
        precision: f.precision,
        certainty: f.certainty,
        flexible: !!f.flexible,
        evidence: f.evidence,
        sourceUrl: f.source_url,
      };
    };
    const dur = this.db
      .prepare("SELECT * FROM job_durations WHERE job_id=?")
      .get(r.id) as any;
    const t = this.db
      .prepare(
        "SELECT tracking.*,statuses.name AS status FROM tracking JOIN statuses ON statuses.id=tracking.status_id WHERE job_id=?",
      )
      .get(r.id) as any;
    const sources = this.db
      .prepare(
        "SELECT job_sources.*,sources.name FROM job_sources JOIN sources ON sources.id=source_id WHERE job_id=?",
      )
      .all(r.id) as any[];
    const rt = this.db
      .prepare("SELECT payload FROM readytalent_jobs WHERE job_id=?")
      .get(r.id) as any;
    const readyTalent = rt ? JSON.parse(rt.payload) : null;
    const job: Job = {
      sourceType: readyTalent ? "IWSP" : null,
      sourceJobId: readyTalent?.source_job_id ?? null,
      readyTalent,
      id: r.id,
      company: r.company,
      title: r.title,
      description: r.description,
      categories: names("categories", "job_categories", "category_id"),
      levels: names("levels", "job_levels", "level_id"),
      locations: names("locations", "job_locations", "location_id"),
      postedAt: r.posted_at,
      url: r.url,
      source: sources[0]?.name ?? "Manual",
      sourceUrl:
        sources.find((s) => s.url === r.url)?.source_page_url ??
        sources[0]?.source_page_url ??
        "",
      aliases: sources.map((s) => s.url),
      collectedAt: r.collected_at,
      verifiedAt: r.verified_at,
      availability: r.availability,
      start: fact("start"),
      end: fact("end"),
      duration: {
        min: dur.min,
        max: dur.max,
        unit: dur.unit,
        qualifier: dur.qualifier,
        certainty: dur.certainty,
        evidence: dur.evidence,
      },
      skills: JSON.parse(r.skills),
      eligibility: r.eligibility,
      evidence: r.evidence,
      saved: !!t.saved,
      status: t.status,
      reminder: t.reminder,
      deadline: t.deadline,
      notes:
        (
          this.db
            .prepare("SELECT body FROM notes WHERE job_id=?")
            .get(r.id) as any
        )?.body ?? "",
      labels: names("labels", "job_labels", "label_id"),
    };
    // Project preserved source payloads on read, including imports made by older builds.
    // Local tracking is never replaced by normalized source facts.
    if (readyTalent) {
      const derived = readyTalentJob(readyTalent);
      job.description = derived.description;
      job.postedAt = derived.postedAt ?? job.postedAt;
      job.skills = derived.skills;
      job.categories = derived.categories;
      if (derived.start.value) job.start = derived.start;
      if (derived.end.value) job.end = derived.end;
    }
    return job;
  }
  track(id: string, patch: Record<string, any>) {
    if (!this.get(id)) throw Error("Listing not found.");
    return this.transaction(() => {
      if (patch.saved !== undefined)
        this.db
          .prepare("UPDATE tracking SET saved=? WHERE job_id=?")
          .run(Number(!!patch.saved), id);
      if (patch.status !== undefined) {
        if (
          typeof patch.status !== "string" ||
          !patch.status.trim() ||
          patch.status.length > 80
        )
          throw Error("Status must be 1–80 characters.");
        this.db
          .prepare("UPDATE tracking SET status_id=? WHERE job_id=?")
          .run(this.named("statuses", patch.status.trim()), id);
      }
      for (const key of ["reminder", "deadline"])
        if (patch[key] !== undefined) {
          if (
            patch[key] &&
            !bounds({
              value: patch[key],
              precision: patch[key].length === 10 ? "day" : "month",
              certainty: "reported",
              flexible: false,
              evidence: "",
            })
          )
            throw Error("Reminder/deadline must be a date.");
          this.db
            .prepare(`UPDATE tracking SET ${key}=? WHERE job_id=?`)
            .run(patch[key] || null, id);
        }
      if (patch.notes !== undefined) {
        if (typeof patch.notes !== "string" || patch.notes.length > 100000)
          throw Error("Notes are too long.");
        this.db
          .prepare("UPDATE notes SET body=?,updated_at=? WHERE job_id=?")
          .run(patch.notes, new Date().toISOString(), id);
      }
      if (patch.labels !== undefined) {
        if (
          !Array.isArray(patch.labels) ||
          patch.labels.some((x: any) => typeof x !== "string" || x.length > 80)
        )
          throw Error("Labels must be short strings.");
        this.db.prepare("DELETE FROM job_labels WHERE job_id=?").run(id);
        for (const label of [...new Set(patch.labels as string[])])
          if (label.trim())
            this.db
              .prepare("INSERT INTO job_labels VALUES(?,?)")
              .run(id, this.named("labels", label.trim()));
      }
      return this.get(id);
    });
  }
  presets(): Preset[] {
    return (this.db.prepare("SELECT * FROM presets").all() as any[]).map(
      (p) => ({
        ...p,
        filters: { ...blankFilters(), ...JSON.parse(p.filters) },
      }),
    );
  }
  savePreset(p: Preset) {
    if (!p.name || p.name.length > 160)
      throw Error("Preset needs a name under 160 characters.");
    this.db
      .prepare("INSERT OR REPLACE INTO presets VALUES(?,?,?)")
      .run(
        p.id || randomUUID(),
        p.name,
        JSON.stringify({ ...blankFilters(), ...p.filters }),
      );
  }
  deletePreset(id: string) {
    this.db.prepare("DELETE FROM presets WHERE id=?").run(id);
  }
  setting(key: string, value?: any) {
    if (value !== undefined)
      this.db
        .prepare("INSERT OR REPLACE INTO settings VALUES(?,?)")
        .run(key, JSON.stringify(value));
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key) as any;
    return row ? JSON.parse(row.value) : null;
  }
  sources() {
    return this.db
      .prepare(
        "SELECT sources.id,sources.name,COUNT(DISTINCT job_id) AS count,MAX(collected_at) AS lastImported FROM sources LEFT JOIN job_sources ON sources.id=source_id GROUP BY sources.id HAVING COUNT(job_id)>0",
      )
      .all();
  }
  backup() {
    return {
      format: "fieldwork-backup",
      version: 2,
      createdAt: new Date().toISOString(),
      tables: Object.fromEntries(
        tables.map((t) => [t, this.db.prepare(`SELECT * FROM ${t}`).all()]),
      ),
    };
  }
  restore(snapshot: any) {
    if (
      snapshot?.format !== "fieldwork-backup" ||
      ![1, 2].includes(snapshot.version)
    )
      throw Error("Unsupported backup format/version.");
    if (snapshot.version === 1)
      snapshot = {
        ...snapshot,
        tables: {
          ...snapshot.tables,
          readytalent_jobs: [],
          readytalent_refreshes: [],
        },
      };
    for (const t of tables)
      if (
        !Array.isArray(snapshot.tables?.[t]) ||
        snapshot.tables[t].length > 100000
      )
        throw Error(`Invalid backup table ${t}.`);
    this.transaction(() => {
      for (const t of [...tables].reverse()) this.db.exec(`DELETE FROM ${t}`);
      for (const t of tables) {
        const columns = (
          this.db.prepare(`PRAGMA table_info(${t})`).all() as any[]
        ).map((c) => c.name);
        for (const row of snapshot.tables[t]) {
          if (
            Object.keys(row).some((k) => !columns.includes(k)) ||
            columns.some((k) => !(k in row))
          )
            throw Error(`Invalid columns in ${t}.`);
          this.db
            .prepare(
              `INSERT INTO ${t}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
            )
            .run(...columns.map((c) => row[c]));
        }
      }
      this.all();
      this.presets();
      this.setting("preferences");
    });
  }
  close() {
    this.db.close();
  }
}
