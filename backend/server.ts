import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  mkdirSync,
  readFileSync,
  existsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve, extname, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./database.js";
import { normalize, readImport, exportCsv } from "./ingest.js";
import type { Preset } from "../shared/model.js";
export const dataDir = resolve(process.env.DATA_DIR ?? "data");
export function createApp(store: Store, port = 4317) {
  const send = (res: ServerResponse, status: number, value: any) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  const body = async (req: IncomingMessage) => {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw Error("Use application/json.");
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const c of req) {
      size += c.length;
      if (size > 20 * 1024 * 1024) throw Error("Request exceeds 20 MB.");
      chunks.push(c);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  };
  return createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    try {
      const requestPort = port || req.socket.localPort;
      const host = req.headers.host ?? "";
      if (
        !new RegExp(`^(127\\.0\\.0\\.1|localhost):${requestPort}$`).test(host)
      )
        return send(res, 403, {
          error: "Only the local application host is allowed.",
        });
      const origin = req.headers.origin;
      if (
        origin &&
        !new Set([
          `http://127.0.0.1:${requestPort}`,
          `http://localhost:${requestPort}`,
          "http://127.0.0.1:5173",
          "http://localhost:5173",
        ]).has(origin)
      )
        return send(res, 403, { error: "Untrusted request origin." });
      const u = new URL(req.url ?? "/", `http://${host}`),
        path = u.pathname,
        method = req.method ?? "GET";
      if (path === "/api/bootstrap" && method === "GET")
        return send(res, 200, {
          jobs: store.all(),
          presets: store.presets(),
          preferences: store.setting("preferences"),
          statuses: store.db
            .prepare("SELECT name FROM statuses ORDER BY rowid")
            .all()
            .map((r: any) => r.name),
          sources: store.sources(),
        });
      if (path === "/api/jobs" && method === "POST") {
        const data = await body(req);
        return send(res, 200, store.import([normalize(data)]));
      }
      const tracking = path.match(/^\/api\/jobs\/([^/]+)\/tracking$/);
      if (tracking && method === "PATCH")
        return send(
          res,
          200,
          store.track(decodeURIComponent(tracking[1]), await body(req)),
        );
      const job = path.match(/^\/api\/jobs\/([^/]+)$/);
      if (job && method === "PUT") {
        const id = decodeURIComponent(job[1]),
          old = store.get(id);
        if (!old) return send(res, 404, { error: "Listing not found." });
        const update = normalize({ ...old, ...(await body(req)) });
        store.transaction(() => store.put(update, id, false));
        return send(res, 200, store.get(id));
      }
      if (path === "/api/import" && method === "POST") {
        const data = await body(req);
        return send(
          res,
          200,
          store.import(readImport(data.content, data.format)),
        );
      }
      if (path === "/api/presets" && method === "POST") {
        store.savePreset((await body(req)) as Preset);
        return send(res, 200, store.presets());
      }
      if (path.startsWith("/api/presets/") && method === "DELETE") {
        store.deletePreset(decodeURIComponent(path.split("/").pop()!));
        return send(res, 200, store.presets());
      }
      if (path === "/api/preferences" && method === "PUT") {
        store.setting("preferences", await body(req));
        return send(res, 200, { ok: true });
      }
      if (path === "/api/export" && method === "GET") {
        res.writeHead(200, {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="internships.csv"',
          "cache-control": "no-store",
        });
        return res.end(exportCsv(store.all()));
      }
      if (path === "/api/backup" && method === "GET") {
        res.writeHead(200, {
          "content-type": "application/json",
          "content-disposition": 'attachment; filename="fieldwork-backup.json"',
          "cache-control": "no-store",
        });
        return res.end(JSON.stringify(store.backup(), null, 2));
      }
      if (path === "/api/restore" && method === "POST") {
        const snapshot = await body(req);
        mkdirSync(resolve(dataDir, "backups"), { recursive: true });
        const backupPath = resolve(
          dataDir,
          "backups",
          `pre-restore-${Date.now()}.json`,
        );
        writeFileSync(backupPath, JSON.stringify(store.backup()));
        store.restore(snapshot);
        return send(res, 200, {
          ok: true,
          note: "A pre-restore backup was saved in the local data/backups folder.",
        });
      }
      if (path.startsWith("/api/"))
        return send(res, 404, { error: "API route not found." });
      const root = resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../frontend",
      );
      let file = resolve(root, "." + decodeURIComponent(path));
      if (file !== root && !file.startsWith(root + sep))
        return send(res, 403, { error: "Invalid path." });
      if (!existsSync(file) || !statSync(file).isFile())
        file = resolve(root, "index.html");
      if (!existsSync(file))
        return send(res, 404, {
          error: "Run npm run dev, or build the frontend first.",
        });
      const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
      };
      res.setHeader(
        "Content-Type",
        types[extname(file)] ?? "application/octet-stream",
      );
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
      );
      res.end(readFileSync(file));
    } catch (e) {
      if (!res.headersSent) send(res, 400, { error: (e as Error).message });
      else res.end();
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  mkdirSync(dataDir, { recursive: true });
  const port = Number(process.env.PORT ?? 4317);
  const store = new Store(resolve(dataDir, "internships.sqlite"));
  const server = createApp(store, port);
  server.listen(port, "127.0.0.1", () =>
    console.log(`Fieldwork running locally at http://127.0.0.1:${port}`),
  );
  const shutdown = () =>
    server.close(() => {
      store.close();
      process.exit(0);
    });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
