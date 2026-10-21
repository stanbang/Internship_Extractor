import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
const lockPath = (root: string) =>
  resolve(root, "data/readytalent/collector.lock");
export function collectionOwner(
  root = process.cwd(),
): { pid: number; started_at: string; running: boolean } | null {
  const file = lockPath(root);
  if (!existsSync(file)) return null;
  const owner = JSON.parse(readFileSync(file, "utf8"));
  if (!Number.isInteger(owner.pid) || owner.pid < 1)
    throw Error(
      "Invalid collector lock. Inspect data/readytalent/collector.lock before starting a new sync.",
    );
  let running = true;
  try {
    process.kill(owner.pid, 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") running = false;
  }
  return { ...owner, running };
}
export function acquireCollection(root = process.cwd()): () => void {
  const file = lockPath(root),
    owner = collectionOwner(root);
  if (owner?.running)
    throw Error(
      "A ReadyTalent collector is already running. Wait for the current sync to finish.",
    );
  if (owner) unlinkSync(file);
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, "wx");
  try {
    writeFileSync(
      fd,
      JSON.stringify({
        pid: process.pid,
        started_at: new Date().toISOString(),
      }),
    );
  } finally {
    closeSync(fd);
  }
  return () => {
    if (collectionOwner(root)?.pid === process.pid) unlinkSync(file);
  };
}
