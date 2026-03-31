import { Router, type IRouter, type Request } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { gunzipSync } from "zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

const router: IRouter = Router();

// ── Device location data (from devices.json) ──
interface DeviceLocation {
  name: string; address: string;
  lat: number; lng: number; size: string; network: string;
}
let _deviceLocations: DeviceLocation[] | null = null;
function getDeviceLocations(): DeviceLocation[] {
  if (!_deviceLocations) {
    const f = path.join(dataDir, "devices.json");
    _deviceLocations = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf-8")) : [];
  }
  return _deviceLocations!;
}

interface HourlyEntry {
  hour: string;
  hourIndex: number;
  airportRoad: number;
  amman: number;
  temperature: number;
  precipitation: number;
  windspeed: number;
  weatherCode: number;
  weatherLabel: string;
}

const HOUR_ORDER = [
  "12am", "01am", "02am", "03am", "04am", "05am",
  "06am", "07am", "08am", "09am", "10am", "11am",
  "12pm", "01pm", "02pm", "03pm", "04pm", "05pm",
  "06pm", "07pm", "08pm", "09pm", "10pm", "11pm",
];

const ADMOBILIZE_AUTH = "https://xauth.admobilize.com/api/v1/users:login";
const ADMOBILIZE_BASE = "https://dashboard.admobilize.com/api/v1";
const PROJECT_ID = "R32b97837fad94bcc98e319309859a833";
const AR_RE = /AR-|^aura|^airport/i;

// In-memory cache: keyed by date string (YYYY-MM-DD)
interface HourlyCache {
  date: string;
  fetchedAt: number;
  arHour: number[];
  amHour: number[];
}
let hourlyCache: HourlyCache | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function todayAmman(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
}

async function getAdmobilizeToken(): Promise<string> {
  const r = await fetch(ADMOBILIZE_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMOBILIZE_EMAIL,
      password: process.env.ADMOBILIZE_PASSWORD,
    }),
  });
  const j = (await r.json()) as { accessToken?: string };
  if (!j.accessToken) throw new Error("Auth failed");
  return j.accessToken;
}

async function fetchHourlyFromApi(date: string): Promise<{ arHour: number[]; amHour: number[] }> {
  const token = await getAdmobilizeToken();

  const reportResp = await fetch(`${ADMOBILIZE_BASE}/projects/${PROJECT_ID}/report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMOBILIZE_EMAIL,
      startTime: `${date}T00:00:00Z`,
      endTime: `${date}T23:59:59Z`,
      timestampGranularity: "HOUR",
      timezone: "Asia/Amman",
      solutions: ["traffic"],
    }),
  });
  const reportJson = (await reportResp.json()) as { reportUrl?: string };
  if (!reportJson.reportUrl) throw new Error("No reportUrl");

  const buf = Buffer.from(
    await (await fetch(`${reportJson.reportUrl}?access_token=${token}`)).arrayBuffer()
  );
  let csv: string;
  try { csv = gunzipSync(buf).toString("utf-8"); } catch { csv = buf.toString("utf-8"); }

  const arHour = new Array(24).fill(0);
  const amHour = new Array(24).fill(0);

  const lines = csv.trim().split("\n");
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const ts = cols[0]?.trim();
    const name = cols[2]?.trim() ?? "";
    const count = parseFloat(cols[10]) || 0;
    if (!ts || isExcluded(name)) continue;
    // Timestamps are already in Amman local time (timezone: "Asia/Amman" in request)
    const localHour = parseInt(ts.slice(11, 13));
    if (AR_RE.test(name)) arHour[localHour] += count;
    else amHour[localHour] += count;
  }

  return { arHour, amHour };
}

function loadFallbackCSV(filename: string): number[] {
  try {
    const content = fs.readFileSync(path.join(dataDir, filename), "utf-8");
    const lines = content.trim().split("\n").slice(1);
    const map = new Map<string, number>();
    for (const line of lines) {
      const [hour, count] = line.split(",");
      map.set(hour.trim(), Number(count.trim()));
    }
    return HOUR_ORDER.map((h) => map.get(h) ?? 0);
  } catch {
    return new Array(24).fill(0);
  }
}

async function getHourlyData(date: string): Promise<{ arHour: number[]; amHour: number[] }> {
  const now = Date.now();
  if (hourlyCache && hourlyCache.date === date && now - hourlyCache.fetchedAt < CACHE_TTL_MS) {
    return { arHour: hourlyCache.arHour, amHour: hourlyCache.amHour };
  }

  try {
    const { arHour, amHour } = await fetchHourlyFromApi(date);
    hourlyCache = { date, fetchedAt: now, arHour, amHour };
    return { arHour, amHour };
  } catch {
    // Fall back to static CSVs (seeded with last known data)
    return {
      arHour: loadFallbackCSV("airport_road.csv"),
      amHour: loadFallbackCSV("amman.csv"),
    };
  }
}

function wmoLabel(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Unknown";
}

async function fetchWeather(date: string): Promise<{
  temperature: number[];
  precipitation: number[];
  windspeed: number[];
  weathercode: number[];
}> {
  const url =
    "https://archive-api.open-meteo.com/v1/archive" +
    `?latitude=31.9539&longitude=35.9106` +
    `&start_date=${date}&end_date=${date}` +
    "&hourly=temperature_2m,precipitation,windspeed_10m,weathercode" +
    "&timezone=Asia%2FAmman";

  const res = await fetch(url);
  const json = (await res.json()) as {
    hourly: {
      temperature_2m: number[];
      precipitation: number[];
      windspeed_10m: number[];
      weathercode: number[];
    };
  };

  return {
    temperature: json.hourly.temperature_2m,
    precipitation: json.hourly.precipitation,
    windspeed: json.hourly.windspeed_10m,
    weathercode: json.hourly.weathercode,
  };
}

function findEveningDropHour(data: HourlyEntry[], location: "airportRoad" | "amman"): string {
  const eveningStart = 17;
  let maxDropHour = HOUR_ORDER[eveningStart + 1];
  let maxDropPct = 0;
  for (let i = eveningStart; i < data.length - 1; i++) {
    const current = data[i][location];
    const next = data[i + 1][location];
    if (current > 0) {
      const dropPct = (current - next) / current;
      if (dropPct > maxDropPct) {
        maxDropPct = dropPct;
        maxDropHour = HOUR_ORDER[i + 1];
      }
    }
  }
  return maxDropHour;
}

// ── Device movers cache ──
interface DeviceTotal { name: string; total: number; }
interface MoverCache {
  todayDate: string;
  lastWeekDate: string;
  fetchedAt: number;
  today: DeviceTotal[];
  lastWeek: DeviceTotal[];
}
let moverCache: MoverCache | null = null;
const MOVER_CACHE_TTL_MS = 30 * 60 * 1000;

async function fetchDeviceDailyTotals(date: string, token: string): Promise<DeviceTotal[]> {
  const reportResp = await fetch(`${ADMOBILIZE_BASE}/projects/${PROJECT_ID}/report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMOBILIZE_EMAIL,
      startTime: `${date}T00:00:00Z`,
      endTime: `${date}T23:59:59Z`,
      timestampGranularity: "HOUR",
      timezone: "Asia/Amman",
      solutions: ["traffic"],
    }),
  });
  const reportJson = (await reportResp.json()) as { reportUrl?: string };
  if (!reportJson.reportUrl) throw new Error("No reportUrl");

  const buf = Buffer.from(
    await (await fetch(`${reportJson.reportUrl}?access_token=${token}`)).arrayBuffer()
  );
  let csv: string;
  try { csv = gunzipSync(buf).toString("utf-8"); } catch { csv = buf.toString("utf-8"); }

  const deviceMap = new Map<string, number>();
  for (const line of csv.trim().split("\n").slice(1)) {
    const cols = line.split(",");
    const name = cols[2]?.trim();
    const count = parseFloat(cols[10]) || 0;
    if (!name) continue;
    deviceMap.set(name, (deviceMap.get(name) ?? 0) + count);
  }
  return [...deviceMap.entries()].map(([name, total]) => ({ name, total: Math.round(total) }));
}

// ── Device health cache ──
interface DeviceHealthCache {
  fetchedAt: number;
  total: number;
  activeCount: number;
  offlineDevices: { id: string; name: string; lastSeen: string | null }[];
}
let deviceHealthCache: DeviceHealthCache | null = null;
const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const STREET_COUNT_RE = /^street\s*count/i;
function isExcluded(name: string): boolean {
  return STREET_COUNT_RE.test(name) || name === "Irbid";
}

async function fetchDeviceHealth(): Promise<DeviceHealthCache> {
  const now = Date.now();
  if (deviceHealthCache && now - deviceHealthCache.fetchedAt < HEALTH_CACHE_TTL_MS) {
    return deviceHealthCache;
  }

  const token = await getAdmobilizeToken();
  const r = await fetch(
    `${ADMOBILIZE_BASE}/projects/${PROJECT_ID}/devices?pageSize=200`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const j = (await r.json()) as {
    devices?: {
      id: string;
      displayName: string;
      state?: { online?: boolean; updateTime?: string };
    }[];
  };

  const devices = (j.devices ?? []).filter((d) => !isExcluded(d.displayName));
  const offlineDevices = devices
    .filter((d) => !d.state?.online)
    .map((d) => ({
      id: d.id,
      name: d.displayName,
      lastSeen: d.state?.updateTime ?? null,
    }));

  deviceHealthCache = {
    fetchedAt: now,
    total: devices.length,
    activeCount: devices.filter((d) => d.state?.online).length,
    offlineDevices,
  };
  return deviceHealthCache;
}

router.get("/devices/health", async (req: Request, res) => {
  try {
    const health = await fetchDeviceHealth();
    res.json({
      total: health.total,
      activeCount: health.activeCount,
      offlineCount: health.offlineDevices.length,
      offlineDevices: health.offlineDevices,
      checkedAt: new Date(health.fetchedAt).toISOString(),
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch device health" });
  }
});

router.get("/device-movers", async (req: Request, res) => {
  try {
    const todayDate = todayAmman();
    const lastWeekDate = (() => {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - 7);
      return d.toISOString().slice(0, 10);
    })();

    const now = Date.now();
    if (
      moverCache &&
      moverCache.todayDate === todayDate &&
      now - moverCache.fetchedAt < MOVER_CACHE_TTL_MS
    ) {
      return res.json(buildMoverResponse(moverCache));
    }

    const token = await getAdmobilizeToken();
    const [today, lastWeek] = await Promise.all([
      fetchDeviceDailyTotals(todayDate, token),
      fetchDeviceDailyTotals(lastWeekDate, token),
    ]);

    moverCache = { todayDate, lastWeekDate, fetchedAt: now, today, lastWeek };
    return res.json(buildMoverResponse(moverCache));
  } catch (err) {
    return res.status(502).json({ error: "Failed to fetch device movers" });
  }
});

function buildMoverResponse(cache: MoverCache) {
  const lastWeekMap = new Map(cache.lastWeek.map((d) => [d.name, d.total]));
  const movers = cache.today
    .filter((d) => !isExcluded(d.name) && lastWeekMap.has(d.name))
    .map((d) => {
      const lw = lastWeekMap.get(d.name)!;
      const pct = lw > 0 ? Math.round(((d.total - lw) / lw) * 100) : 0;
      return { name: d.name, today: d.total, lastWeek: lw, pct };
    })
    .filter((d) => d.lastWeek > 500); // ignore tiny devices that skew %

  const sorted = [...movers].sort((a, b) => b.pct - a.pct);
  return {
    today: cache.todayDate,
    lastWeek: cache.lastWeekDate,
    topGrowth: sorted.slice(0, 5),
    topDrop: [...sorted].reverse().slice(0, 5),
  };
}

router.get("/hourly", async (req: Request, res) => {
  const date = (req.query.date as string) || todayAmman();

  const [{ arHour, amHour }, weather] = await Promise.all([
    getHourlyData(date),
    fetchWeather(date).catch(() => ({
      temperature: Array<number>(24).fill(0),
      precipitation: Array<number>(24).fill(0),
      windspeed: Array<number>(24).fill(0),
      weathercode: Array<number>(24).fill(0),
    })),
  ]);

  const data: HourlyEntry[] = HOUR_ORDER.map((hour, index) => ({
    hour,
    hourIndex: index,
    airportRoad: Math.round(arHour[index]),
    amman: Math.round(amHour[index]),
    temperature: weather.temperature[index] ?? 0,
    precipitation: weather.precipitation[index] ?? 0,
    windspeed: weather.windspeed[index] ?? 0,
    weatherCode: weather.weathercode[index] ?? 0,
    weatherLabel: wmoLabel(weather.weathercode[index] ?? 0),
  }));

  const peakAirport = data.reduce((a, b) => (a.airportRoad > b.airportRoad ? a : b));
  const peakAmman = data.reduce((a, b) => (a.amman > b.amman ? a : b));
  const totalAirport = data.reduce((s, d) => s + d.airportRoad, 0);
  const totalAmman = data.reduce((s, d) => s + d.amman, 0);

  const temps = weather.temperature.filter(Boolean);
  const totalPrecip = weather.precipitation.reduce((s, v) => s + v, 0);
  const maxWind = Math.max(...weather.windspeed);

  const codeCount = new Map<number, number>();
  for (const c of weather.weathercode) {
    codeCount.set(c, (codeCount.get(c) ?? 0) + 1);
  }
  const dominantCode = [...codeCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

  res.json({
    date,
    data,
    peakHour: { airportRoad: peakAirport.hour, amman: peakAmman.hour },
    eveningDropHour: {
      airportRoad: findEveningDropHour(data, "airportRoad"),
      amman: findEveningDropHour(data, "amman"),
    },
    totalVehicles: { airportRoad: totalAirport, amman: totalAmman },
    weatherSummary: {
      maxTemp: temps.length ? Math.max(...temps) : 0,
      minTemp: temps.length ? Math.min(...temps) : 0,
      maxWind: Math.round(maxWind),
      totalPrecipitation: Math.round(totalPrecip * 10) / 10,
      dominantCondition: wmoLabel(dominantCode),
    },
  });
});

router.get("/devices/locations", async (req: Request, res) => {
  try {
    const locs = getDeviceLocations();
    const health = await fetchDeviceHealth();
    const offlineSet = new Set(health.offlineDevices.map((d) => d.name));
    const devices = locs.map((d) => ({
      name: d.name,
      address: d.address,
      lat: d.lat,
      lng: d.lng,
      size: d.size,
      network: d.network,
      status: offlineSet.has(d.name) ? "offline" : "online",
    }));
    res.json({ devices, checkedAt: new Date(health.fetchedAt).toISOString() });
  } catch {
    res.status(502).json({ error: "Failed to fetch device locations" });
  }
});

export default router;
