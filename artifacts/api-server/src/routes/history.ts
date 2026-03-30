import { Router, type IRouter } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

const router: IRouter = Router();

interface DailyTotal {
  date: string;
  amman: number;
  airportRoad: number;
}

interface CachedData {
  daily: DailyTotal[];
  loaded: boolean;
}

const cache: CachedData = { daily: [], loaded: false };

function isAirportRoad(deviceName: string): boolean {
  return /^AR-|Airport|Aura/i.test(deviceName);
}

function loadHistoricalData(): void {
  if (cache.loaded) return;
  const filePath = path.join(dataDir, "full_traffic.csv");
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const dailyMap = new Map<string, { amman: number; airportRoad: number }>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(",");
    const date = cols[0];
    const deviceName = cols[2];
    const count = parseInt(cols[10]) || 0;
    if (!date || !deviceName) continue;
    if (/^street\s*count/i.test(deviceName) || deviceName === "Irbid") continue;

    if (!dailyMap.has(date)) dailyMap.set(date, { amman: 0, airportRoad: 0 });
    const entry = dailyMap.get(date)!;
    if (isAirportRoad(deviceName)) entry.airportRoad += count;
    else entry.amman += count;
  }

  cache.daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
  cache.loaded = true;
}

const RAMADAN_PERIODS = [
  { year: 2022, start: "2022-04-02", end: "2022-05-01" },
  { year: 2023, start: "2023-03-23", end: "2023-04-21" },
  { year: 2024, start: "2024-03-11", end: "2024-04-09" },
  { year: 2025, start: "2025-03-01", end: "2025-03-29" },
  { year: 2026, start: "2026-02-18", end: "2026-03-19" },
];

const WAR_START = "2023-10-07";

const IRAN_EVENTS = [
  {
    id: "apr2024",
    label: "Iran Attack 1",
    date: "2024-04-13",
    description: "Iran launched ~300 drones & missiles at Israel via Jordan airspace. Jordan intercepted ~80 drones.",
    windowDays: 14,
  },
  {
    id: "oct2024",
    label: "Iran Attack 2",
    date: "2024-10-01",
    description: "Iran launched ~180 ballistic missiles at Israel through Jordan's airspace.",
    windowDays: 14,
  },
];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isRamadan(date: string): { isRamadan: boolean; year: number } {
  for (const p of RAMADAN_PERIODS) {
    if (date >= p.start && date <= p.end) return { isRamadan: true, year: p.year };
  }
  return { isRamadan: false, year: parseInt(date.slice(0, 4)) };
}

// ── Weather correlation cache ──
interface WeatherDay { tempMax: number; tempMin: number; precip: number; code: number; }
let weatherCorrelCache: { data: Map<string, WeatherDay>; fetchedAt: number } | null = null;
const WEATHER_TTL = 6 * 60 * 60 * 1000;

function weatherGroup(code: number): { label: string; emoji: string } {
  if (code === 0)                           return { label: "Clear",        emoji: "☀️"  };
  if (code <= 2)                            return { label: "Partly Cloudy",emoji: "🌤️" };
  if (code === 3)                           return { label: "Overcast",     emoji: "☁️"  };
  if (code <= 48)                           return { label: "Fog",          emoji: "🌫️" };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: "Rain",    emoji: "🌧️" };
  if (code <= 77 || (code >= 85 && code <= 86)) return { label: "Snow",    emoji: "❄️"  };
  return                                           { label: "Thunder",      emoji: "⛈️"  };
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(
    xs.reduce((s, x) => s + (x - mx) ** 2, 0) *
    ys.reduce((s, y) => s + (y - my) ** 2, 0)
  );
  return den === 0 ? 0 : Math.round((num / den) * 100) / 100;
}

router.get("/history/weather-correlation", async (_req, res) => {
  loadHistoricalData();
  const now = Date.now();

  if (!weatherCorrelCache || now - weatherCorrelCache.fetchedAt > WEATHER_TTL) {
    const endDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
    const url =
      `https://archive-api.open-meteo.com/v1/archive` +
      `?latitude=31.9539&longitude=35.9106` +
      `&start_date=2022-02-01&end_date=${endDate}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
      `&timezone=Asia/Amman`;
    const r = await fetch(url);
    const j = (await r.json()) as {
      daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[]; weathercode: number[] };
    };
    const map = new Map<string, WeatherDay>();
    j.daily.time.forEach((t, i) =>
      map.set(t, {
        tempMax:  j.daily.temperature_2m_max[i]  ?? 0,
        tempMin:  j.daily.temperature_2m_min[i]  ?? 0,
        precip:   j.daily.precipitation_sum[i]   ?? 0,
        code:     j.daily.weathercode[i]          ?? 0,
      })
    );
    weatherCorrelCache = { data: map, fetchedAt: now };
  }

  const wmap = weatherCorrelCache.data;
  const merged = cache.daily
    .filter((d) => d.amman > 0 && wmap.has(d.date))
    .map((d) => ({ ...d, ...(wmap.get(d.date)!) }));

  // ── By condition ──
  const condMap = new Map<string, { emoji: string; total: number; count: number }>();
  for (const d of merged) {
    const g = weatherGroup(d.code);
    const e = condMap.get(g.label) ?? { emoji: g.emoji, total: 0, count: 0 };
    e.total += d.amman; e.count++;
    condMap.set(g.label, e);
  }
  const clearAvg = (condMap.get("Clear")?.total ?? 0) / Math.max(condMap.get("Clear")?.count ?? 1, 1);
  const byCondition = [...condMap.entries()]
    .filter(([, v]) => v.count >= 3)
    .map(([label, v]) => ({
      label, emoji: v.emoji,
      avgTraffic: Math.round(v.total / v.count),
      days: v.count,
      pctVsClear: clearAvg > 0 ? Math.round(((v.total / v.count - clearAvg) / clearAvg) * 100) : 0,
    }))
    .sort((a, b) => b.avgTraffic - a.avgTraffic);

  // ── By temperature bucket ──
  const TEMP_BUCKETS = [
    { label: "Cold (<15°C)",   min: -99, max: 15,   order: 0 },
    { label: "Mild (15–25°C)", min: 15,  max: 25,   order: 1 },
    { label: "Warm (25–35°C)", min: 25,  max: 35,   order: 2 },
    { label: "Hot (>35°C)",    min: 35,  max: 99,   order: 3 },
  ];
  const tempMap = new Map<string, { total: number; count: number; order: number }>();
  for (const b of TEMP_BUCKETS) tempMap.set(b.label, { total: 0, count: 0, order: b.order });
  for (const d of merged) {
    const b = TEMP_BUCKETS.find((b) => d.tempMax >= b.min && d.tempMax < b.max);
    if (b) { const e = tempMap.get(b.label)!; e.total += d.amman; e.count++; }
  }
  const byTemp = [...tempMap.entries()]
    .filter(([, v]) => v.count > 0)
    .map(([label, v]) => ({ label, avgTraffic: Math.round(v.total / v.count), days: v.count, order: v.order }))
    .sort((a, b) => a.order - b.order);

  // ── By precipitation ──
  const PRECIP_BUCKETS = [
    { label: "No Rain (0mm)", min: 0, max: 0.1 },
    { label: "Drizzle (0.1–5mm)", min: 0.1, max: 5 },
    { label: "Rain (>5mm)", min: 5, max: 999 },
  ];
  const precipMap = new Map<string, { total: number; count: number }>();
  for (const b of PRECIP_BUCKETS) precipMap.set(b.label, { total: 0, count: 0 });
  for (const d of merged) {
    const b = PRECIP_BUCKETS.find((b) => d.precip >= b.min && d.precip < b.max);
    if (b) { const e = precipMap.get(b.label)!; e.total += d.amman; e.count++; }
  }
  const byPrecip = PRECIP_BUCKETS.map((b) => {
    const v = precipMap.get(b.label)!;
    return { label: b.label, avgTraffic: v.count > 0 ? Math.round(v.total / v.count) : 0, days: v.count };
  });

  // ── Monthly temp + traffic ──
  const monthlyMap = new Map<string, { traffic: number; tempMax: number; precip: number; count: number }>();
  for (const d of merged) {
    const m = d.date.slice(0, 7);
    const e = monthlyMap.get(m) ?? { traffic: 0, tempMax: 0, precip: 0, count: 0 };
    e.traffic += d.amman; e.tempMax += d.tempMax; e.precip += d.precip; e.count++;
    monthlyMap.set(m, e);
  }
  const monthly = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      label: (() => { const [yr, mo] = month.split("-"); return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+mo-1]} '${yr.slice(2)}`; })(),
      avgTraffic: Math.round(v.traffic / v.count),
      avgTempMax: Math.round((v.tempMax / v.count) * 10) / 10,
      avgPrecipDays: Math.round((v.precip / v.count) * 10) / 10,
    }));

  const pearsonTemp   = pearson(merged.map((d) => d.tempMax),  merged.map((d) => d.amman));
  const pearsonPrecip = pearson(merged.map((d) => d.precip),   merged.map((d) => d.amman));

  res.json({
    byCondition,
    byTemp,
    byPrecip,
    monthly,
    pearsonTemp,
    pearsonPrecip,
    totalDays: merged.length,
    rainyDays: merged.filter((d) => d.precip >= 0.1).length,
  });
});

router.get("/history/daily", (_req, res) => {
  loadHistoricalData();
  res.json({
    data: cache.daily,
    meta: {
      totalDays: cache.daily.length,
      dateRange: {
        start: cache.daily[0]?.date,
        end: cache.daily[cache.daily.length - 1]?.date,
      },
      airportRoadStartDate: "2025-06-03",
    },
  });
});

router.get("/history/monthly", (_req, res) => {
  loadHistoricalData();

  const monthMap = new Map<string, { amman: number; airportRoad: number; days: number }>();

  for (const day of cache.daily) {
    const month = day.date.slice(0, 7);
    if (!monthMap.has(month)) monthMap.set(month, { amman: 0, airportRoad: 0, days: 0 });
    const m = monthMap.get(month)!;
    m.amman += day.amman;
    m.airportRoad += day.airportRoad;
    m.days++;
  }

  const monthly = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      ammanTotal: v.amman,
      airportRoadTotal: v.airportRoad,
      ammanDailyAvg: Math.round(v.amman / v.days),
      airportRoadDailyAvg: v.airportRoad > 0 ? Math.round(v.airportRoad / v.days) : null,
      days: v.days,
    }));

  res.json({ data: monthly });
});

router.get("/history/analysis", (_req, res) => {
  loadHistoricalData();

  const ammanDays = cache.daily.filter((d) => d.amman > 0);

  const ramadanStats: Record<number, { ramadanAvg: number; normalAvg: number; days: number; ramadanDays: number }> = {};

  for (const year of [2022, 2023, 2024, 2025, 2026]) {
    const period = RAMADAN_PERIODS.find((p) => p.year === year)!;
    const yearDays = ammanDays.filter((d) => d.date.startsWith(String(year)));

    if (yearDays.length === 0) continue;

    const ramadanDays = yearDays.filter((d) => d.date >= period.start && d.date <= period.end);
    const normalDays = yearDays.filter((d) => d.date < period.start || d.date > period.end);

    ramadanStats[year] = {
      ramadanAvg: ramadanDays.length
        ? Math.round(ramadanDays.reduce((s, d) => s + d.amman, 0) / ramadanDays.length)
        : 0,
      normalAvg: normalDays.length
        ? Math.round(normalDays.reduce((s, d) => s + d.amman, 0) / normalDays.length)
        : 0,
      days: yearDays.length,
      ramadanDays: ramadanDays.length,
    };
  }

  const preWarDays = ammanDays.filter((d) => d.date < WAR_START);
  const postWarDays = ammanDays.filter((d) => d.date >= WAR_START);

  const preWarAvg = preWarDays.length
    ? Math.round(preWarDays.reduce((s, d) => s + d.amman, 0) / preWarDays.length)
    : 0;
  const postWarAvg = postWarDays.length
    ? Math.round(postWarDays.reduce((s, d) => s + d.amman, 0) / postWarDays.length)
    : 0;

  const monthlyPostWar: Record<string, number[]> = {};
  for (const d of postWarDays) {
    const m = d.date.slice(0, 7);
    if (!monthlyPostWar[m]) monthlyPostWar[m] = [];
    monthlyPostWar[m].push(d.amman);
  }

  const warTimeline = [...Object.entries(monthlyPostWar)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({
      month,
      avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    }));

  // ── Iran-Israel conflict analysis ──
  const iranAnalysis = IRAN_EVENTS.map((event) => {
    const beforeStart = addDays(event.date, -event.windowDays);
    const afterEnd = addDays(event.date, event.windowDays);

    const beforeDays = ammanDays.filter((d) => d.date >= beforeStart && d.date < event.date);
    const afterDays = ammanDays.filter((d) => d.date > event.date && d.date <= afterEnd);

    const beforeAvg = beforeDays.length
      ? Math.round(beforeDays.reduce((s, d) => s + d.amman, 0) / beforeDays.length)
      : 0;
    const afterAvg = afterDays.length
      ? Math.round(afterDays.reduce((s, d) => s + d.amman, 0) / afterDays.length)
      : 0;

    // Day-by-day data 14 before → event → 14 after
    const dayWindow = ammanDays.filter((d) => d.date >= beforeStart && d.date <= afterEnd);

    return {
      id: event.id,
      label: event.label,
      date: event.date,
      description: event.description,
      beforeAvg,
      afterAvg,
      changePercent: beforeAvg > 0 ? Math.round(((afterAvg - beforeAvg) / beforeAvg) * 100) : 0,
      beforeDays: beforeDays.length,
      afterDays: afterDays.length,
      dayWindow: dayWindow.map((d) => ({
        date: d.date,
        amman: d.amman,
        isEventDay: d.date === event.date,
      })),
    };
  });

  res.json({
    ramadan: Object.entries(ramadanStats).map(([year, s]) => ({
      year: parseInt(year),
      ramadanAvg: s.ramadanAvg,
      normalAvg: s.normalAvg,
      changePercent: s.normalAvg > 0 ? Math.round(((s.ramadanAvg - s.normalAvg) / s.normalAvg) * 100) : 0,
      ramadanDays: s.ramadanDays,
    })),
    war: {
      warStartDate: WAR_START,
      preWarAvgDaily: preWarAvg,
      postWarAvgDaily: postWarAvg,
      preWarDays: preWarDays.length,
      postWarDays: postWarDays.length,
      changePercent:
        preWarAvg > 0 ? Math.round(((postWarAvg - preWarAvg) / preWarAvg) * 100) : 0,
      timeline: warTimeline,
    },
    iran: iranAnalysis,
    ramadanPeriods: RAMADAN_PERIODS,
  });
});

export default router;
