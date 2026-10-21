import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Store } from "./database.js";
import { importReadyTalent } from "./readytalent.js";
import type { SourceSync } from "../shared/readytalent.js";
import { collectionOwner } from "./source-lock.js";

const states = new WeakMap<Store, SourceSync>();
const importedCheckpoints = new WeakMap<Store, number>();
export const syncState = (store: Store, root = process.cwd()): SourceSync => {
  const own = states.get(store);
  if (own?.status === "running") return own;
  const owner = collectionOwner(root);
  if (owner) {
    const file = resolve(root, "data/readytalent/readytalent-current.json");
    const modified = existsSync(file) ? statSync(file).mtimeMs : null;
    const snapshot = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : null;
    if (
      snapshot &&
      modified !== null &&
      importedCheckpoints.get(store) !== modified
    ) {
      importReadyTalent(store, snapshot);
      importedCheckpoints.set(store, modified);
    }
    const full =
      snapshot?.jobs.filter((j: any) => j.original_description?.trim())
        .length ?? 0;
    const complete =
      !!snapshot?.manifest.finished_at &&
      full === snapshot?.manifest.expected_count &&
      !snapshot.manifest.errors.length;
    return {
      status: owner.running ? "running" : complete ? "complete" : "error",
      page: snapshot?.manifest.pages_processed.at(-1) ?? 0,
      total: snapshot?.manifest.expected_count ?? 0,
      full,
      title: null,
      error:
        owner.running || complete
          ? null
          : "The previous collector stopped before all job details were captured. Sync again to resume from the saved checkpoint.",
      started_at: owner.started_at,
      finished_at: snapshot?.manifest.finished_at ?? null,
    };
  }
  return (
    own ?? {
      status: "idle",
      page: 0,
      total: 0,
      full: 0,
      title: null,
      error: null,
      started_at: null,
      finished_at: null,
    }
  );
};
export function startSourceSync(
  store: Store,
  refreshDetails = false,
): SourceSync {
  const old = syncState(store);
  if (old.status === "running") return old;
  const state: SourceSync = {
    status: "running",
    page: 0,
    total: 0,
    full: 0,
    title: null,
    error: null,
    started_at: new Date().toISOString(),
    finished_at: null,
  };
  states.set(store, state);
  const compiled = fileURLToPath(
    new URL("./collect-readytalent.js", import.meta.url),
  );
  const script = existsSync(compiled)
    ? [compiled]
    : [
        resolve("node_modules/tsx/dist/cli.mjs"),
        resolve("backend/collect-readytalent.ts"),
      ];
  const child = spawn(
    process.execPath,
    [...script, ...(refreshDetails ? ["--refresh-details"] : [])],
    {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let pending = "",
    error = "";
  child.stdout.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.stage === "listing-page") {
          state.page = event.page;
          state.total = event.total;
        }
        if (event.stage === "checkpoint") {
          state.full = event.full;
          state.title = event.title;
          importReadyTalent(
            store,
            JSON.parse(
              readFileSync(
                resolve("data/readytalent/readytalent-current.json"),
                "utf8",
              ),
            ),
          );
        }
        if (event.stage === "finished") state.full = event.full;
      } catch {}
    }
  });
  child.stderr.on("data", (c) => {
    error = (error + c).slice(-1500);
  });
  child.on("error", (e) => {
    state.status = "error";
    state.error = e.message;
    state.finished_at = new Date().toISOString();
  });
  child.on("close", (code) => {
    try {
      const file = resolve("data/readytalent/readytalent-current.json");
      if (existsSync(file))
        importReadyTalent(store, JSON.parse(readFileSync(file, "utf8")));
      if (code !== 0)
        throw Error(
          /ECONNREFUSED|connectOverCDP/i.test(error)
            ? "ReadyTalent Chrome is unavailable. Open the dedicated debugging Chrome session and log in manually, then retry."
            : error ||
                "ReadyTalent sync stopped. Completed records were retained.",
        );
      state.status = "complete";
    } catch (e) {
      state.status = "error";
      state.error = (e as Error).message;
    }
    state.finished_at = new Date().toISOString();
  });
  return state;
}
