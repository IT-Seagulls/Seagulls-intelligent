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

function findEveningDropHour(data: HourlyEntry[], location: "airportRoad" | "amman"): string {
  // Look for the first significant drop after 5pm (index 17)
  const eveningStart = 17; // 05pm index
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

router.get("/hourly", (_req, res) => {
  const airportMap = parseCSV(path.join(dataDir, "airport_road.csv"));
  const ammanMap = parseCSV(path.join(dataDir, "amman.csv"));

  const data: HourlyEntry[] = HOUR_ORDER.map((hour, index) => ({
    hour,
    hourIndex: index,
    airportRoad: airportMap.get(hour) ?? 0,
    amman: ammanMap.get(hour) ?? 0,
  }));

  const peakAirport = data.reduce((a, b) => (a.airportRoad > b.airportRoad ? a : b));
  const peakAmman = data.reduce((a, b) => (a.amman > b.amman ? a : b));

  const totalAirport = data.reduce((s, d) => s + d.airportRoad, 0);
  const totalAmman = data.reduce((s, d) => s + d.amman, 0);

  res.json({
    data,
    peakHour: {
      airportRoad: peakAirport.hour,
      amman: peakAmman.hour,
    },
    eveningDropHour: {
      airportRoad: findEveningDropHour(data, "airportRoad"),
      amman: findEveningDropHour(data, "amman"),
    },
    totalVehicles: {
      airportRoad: totalAirport,
      amman: totalAmman,
    },
  });
});

export default router;
