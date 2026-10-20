import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "./database.js";
import { readImport, normalize, investigationFacts } from "./ingest.js";
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const file = arg("--file");
if (!file) {
  console.error(
    "Usage: npm run import -- --file PATH [--facts internships.json] [--descriptions sanitized-text.json]",
  );
  process.exit(1);
}
const directory = resolve(process.env.DATA_DIR ?? "data");
mkdirSync(directory, { recursive: true });
const store = new Store(resolve(directory, "internships.sqlite"));
try {
  let jobs;
  const factsFile = arg("--facts");
  if (factsFile) {
    const data = JSON.parse(readFileSync(file, "utf8")),
      facts = JSON.parse(readFileSync(factsFile, "utf8"));
    const descriptions = arg("--descriptions")
      ? JSON.parse(readFileSync(arg("--descriptions")!, "utf8"))
      : {};
    jobs = (data.listings ?? data).map((r: any) => {
      const c = facts.candidates.find((c: any) => c.job_url === r.job_url);
      const enriched = investigationFacts(r, c);
      const text = descriptions[c?.candidate_id]?.page_text;
      if (text && !text.includes("Agree & Join LinkedIn"))
        enriched.description = text.split(
          /Apply for this job|Legal first name|Autofill my application/,
        )[0];
      return normalize(enriched);
    });
  } else
    jobs = readImport(
      readFileSync(file, "utf8"),
      file.toLowerCase().endsWith(".csv") ? "csv" : "json",
    );
  console.log(JSON.stringify(store.import(jobs)));
} finally {
  store.close();
}
