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
 * Calls the configured third-party URL with POST, expects JSON, writes it to `data/third-party-data.json`.
 * Each successful refresh removes any previous cache file and writes only the new response (full replace).
 *
 * Env:
 * - THIRD_PARTY_DATA_URL (required): outbound POST target
 * - THIRD_PARTY_AUTH_BEARER (optional): sets Authorization: Bearer …
 */
router.post("/external-data/refresh", async (req, res) => {
  const url = process.env.THIRD_PARTY_DATA_URL?.trim();
  if (!url) {
    res.status(503).json({ error: "THIRD_PARTY_DATA_URL is not configured" });
    return;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const bearer = process.env.THIRD_PARTY_AUTH_BEARER?.trim();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const payload =
    req.body !== undefined && req.body !== null && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      res.status(502).json({
        error: "Third-party request failed",
        status: upstream.status,
        body: text.slice(0, 2000),
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      res.status(502).json({ error: "Third-party response was not valid JSON" });
      return;
    }

    await fs.mkdir(dataDir, { recursive: true });
    await fs.rm(cacheFile, { force: true });
    await fs.writeFile(cacheFile, JSON.stringify(parsed, null, 2), { encoding: "utf-8", flag: "w" });
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
