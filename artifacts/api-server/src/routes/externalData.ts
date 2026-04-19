import { Router, type IRouter } from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const cacheFile = path.join(dataDir, "third-party-data.json");

const router: IRouter = Router();

/**
 * POST /api/external-data/refresh
 * Writes the request JSON body to `data/third-party-data.json`.
 * Each successful refresh removes any previous cache file and writes only the new payload (full replace),
 * with `updatedAt` set by the server.
 */
router.post("/external-data/refresh", async (req, res) => {
  const payload = req.body;
  if (payload === undefined) {
    res.status(400).json({ error: "Request body is required and must be valid JSON" });
    return;
  }

  try {
    const payloadWithTimestamp =
      payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? { ...(payload as Record<string, unknown>), updatedAt: new Date().toISOString() }
        : { data: payload, updatedAt: new Date().toISOString() };

    await fs.mkdir(dataDir, { recursive: true });
    await fs.rm(cacheFile, { force: true });
    await fs.writeFile(cacheFile, JSON.stringify(payloadWithTimestamp, null, 2), { encoding: "utf-8", flag: "w" });
    res.json({ ok: true, file: "third-party-data.json" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Refresh failed" });
  }
});

/**
 * GET /api/external-data
 * Read-only: returns the cached JSON file if it exists.
 */
router.get("/external-data", async (_req, res) => {
  try {
    const raw = await fs.readFile(cacheFile, "utf-8");
    res.type("application/json").send(raw);
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      res.status(404).json({ error: "No cached file yet; call POST /api/external-data/refresh first" });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Read failed" });
  }
});

export default router;
