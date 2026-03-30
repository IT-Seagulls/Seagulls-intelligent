import { Router, type IRouter } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

const router: IRouter = Router();

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

function parseCSV(filePath: string): Map<string, number> {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n").slice(1);
  const map = new Map<string, number>();
  for (const line of lines) {
    const [hour, count] = line.split(",");
    map.set(hour.trim(), Number(count.trim()));
  }
  return map;
}

const HOUR_ORDER = [
  "12am", "01am", "02am", "03am", "04am", "05am",
  "06am", "07am", "08am", "09am", "10am", "11am",
  "12pm", "01pm", "02pm", "03pm", "04pm", "05pm",
  "06pm", "07pm", "08pm", "09pm", "10pm", "11pm",
];

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

async function fetchWeather(): Promise<{
  temperature: number[];
  precipitation: number[];
  windspeed: number[];
  weathercode: number[];
}> {
  const url =
    "https://archive-api.open-meteo.com/v1/archive" +
    "?latitude=31.9539&longitude=35.9106" +
    "&start_date=2026-03-30&end_date=2026-03-30" +
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

router.get("/hourly", async (_req, res) => {
  const airportMap = parseCSV(path.join(dataDir, "airport_road.csv"));
  const ammanMap = parseCSV(path.join(dataDir, "amman.csv"));

  let weather: Awaited<ReturnType<typeof fetchWeather>>;
  try {
    weather = await fetchWeather();
  } catch {
    weather = {
      temperature: Array(24).fill(0),
      precipitation: Array(24).fill(0),
      windspeed: Array(24).fill(0),
      weathercode: Array(24).fill(0),
    };
  }

  const data: HourlyEntry[] = HOUR_ORDER.map((hour, index) => ({
    hour,
    hourIndex: index,
    airportRoad: airportMap.get(hour) ?? 0,
    amman: ammanMap.get(hour) ?? 0,
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

  // Find dominant weather condition by most frequent code
  const codeCount = new Map<number, number>();
  for (const c of weather.weathercode) {
    codeCount.set(c, (codeCount.get(c) ?? 0) + 1);
  }
  const dominantCode = [...codeCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

  res.json({
    data,
    peakHour: { airportRoad: peakAirport.hour, amman: peakAmman.hour },
    eveningDropHour: {
      airportRoad: findEveningDropHour(data, "airportRoad"),
      amman: findEveningDropHour(data, "amman"),
    },
    totalVehicles: { airportRoad: totalAirport, amman: totalAmman },
    weatherSummary: {
      maxTemp: Math.max(...temps),
      minTemp: Math.min(...temps),
      maxWind: Math.round(maxWind),
      totalPrecipitation: Math.round(totalPrecip * 10) / 10,
      dominantCondition: wmoLabel(dominantCode),
    },
  });
});

export default router;
