import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetHourlyTraffic } from "@workspace/api-client-react";
import { CSVLink } from "react-csv";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, ChevronDown, Check,
  Sun, Moon, Download, Printer, Clock
} from "lucide-react";

const CHART_COLORS = {
  blue: "#0079F2",
  purple: "#795EFF",
  green: "#009118",
  red: "#A60808",
  pink: "#ec4899",
};

const DATA_SOURCES: string[] = ["Traffic API"];

const INTERVAL_OPTIONS = [
  { label: "Every 15 sec", ms: 15 * 1000 },
  { label: "Every 30 sec", ms: 30 * 1000 },
  { label: "Every 1 min", ms: 60 * 1000 },
];

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "6px",
        padding: "10px 14px",
        border: "1px solid #e0e0e0",
        color: "#1a1a1a",
        fontSize: "13px",
      }}
    >
      <div style={{ marginBottom: "6px", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
        {label}
      </div>
      {payload.map((entry: any, index: number) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
          {entry.color && entry.color !== "#ffffff" && (
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color, flexShrink: 0 }} />
          )}
          <span style={{ color: "#444" }}>{entry.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            {typeof entry.value === "number" ? formatNumber(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function CustomLegend({ payload }: any) {
  if (!payload || payload.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 16px", fontSize: "13px" }}>
      {payload.map((entry: any, index: number) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color, flexShrink: 0 }} />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data: trafficData, isLoading, isFetching, dataUpdatedAt, refetch } = useGetHourlyTraffic();
  const loading = isLoading || isFetching;

  const [isDark, setIsDark] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedIntervalMs, setSelectedIntervalMs] = useState(INTERVAL_OPTIONS[0].ms);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    if (loading) {
      setIsSpinning(true);
    } else {
      const t = setTimeout(() => setIsSpinning(false), 600);
      return () => clearTimeout(t);
    }
  }, [loading]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const intervalId = setInterval(() => {
      refetch();
    }, selectedIntervalMs);
    return () => clearInterval(intervalId);
  }, [autoRefresh, selectedIntervalMs, refetch]);

  const lastRefreshed = dataUpdatedAt
    ? (() => {
        const d = new Date(dataUpdatedAt);
        const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
        const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return `${time} on ${date}`;
      })()
    : null;

  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  const hourlyData = trafficData?.data || [];
  const airportTotal = trafficData?.totalVehicles?.airportRoad;
  const ammanTotal = trafficData?.totalVehicles?.amman;
  const airportPeak = trafficData?.peakHour?.airportRoad;
  const ammanPeak = trafficData?.peakHour?.amman;
  const airportEveningDrop = trafficData?.eveningDropHour?.airportRoad;
  const ammanEveningDrop = trafficData?.eveningDropHour?.amman;

  return (
    <div className="min-h-screen bg-background px-5 py-4 pt-[32px] pb-[32px] pl-[24px] pr-[24px]">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="pt-2">
            <h1 className="font-bold text-[32px]">Traffic Overview</h1>
            <p className="text-muted-foreground mt-1.5 text-[14px]">Hourly vehicle count data for Airport Road and Amman</p>
            {DATA_SOURCES.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[12px] text-muted-foreground shrink-0">Data Sources:</span>
                {DATA_SOURCES.map((source) => (
                  <span
                    key={source}
                    className="text-[12px] font-bold rounded px-2 py-0.5 truncate print:!bg-[rgb(229,231,235)] print:!text-[rgb(75,85,99)]"
                    title={source}
                    style={{
                      maxWidth: "20ch",
                      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgb(229, 231, 235)",
                      color: isDark ? "#c8c9cc" : "rgb(75, 85, 99)",
                    }}
                  >
                    {source}
                  </span>
                ))}
              </div>
            )}
            {lastRefreshed && <p className="text-[12px] text-muted-foreground mt-3">Last refresh: {lastRefreshed}</p>}
          </div>
          
          <div className="flex items-center gap-3 pt-2 print:hidden">
            <div className="relative" ref={dropdownRef}>
              <div
                className="flex items-center rounded-[6px] overflow-hidden h-[26px] text-[12px]"
                style={{
                  backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2",
                  color: isDark ? "#c8c9cc" : "#4b5563",
                }}
              >
                <button
                  onClick={() => refetch()}
                  disabled={loading}
                  className="flex items-center gap-1 px-2 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <div className="w-px h-4 shrink-0" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)" }} />
                <button
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="flex items-center justify-center px-1.5 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {dropdownOpen && (
                <div className="absolute right-0 top-[30px] w-48 rounded-md border shadow-lg bg-popover text-popover-foreground z-50 overflow-hidden">
                  <div className="p-2 border-b">
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        className="rounded border-input bg-background accent-primary"
                      />
                      Auto-refresh
                    </label>
                  </div>
                  <div className="p-1">
                    {INTERVAL_OPTIONS.map((opt) => (
                      <button
                        key={opt.ms}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-muted text-left transition-colors"
                        onClick={() => {
                          setSelectedIntervalMs(opt.ms);
                          setAutoRefresh(true);
                          setDropdownOpen(false);
                        }}
                      >
                        {opt.label}
                        {selectedIntervalMs === opt.ms && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => window.print()}
              disabled={loading}
              className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors disabled:opacity-50"
              style={{
                backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2",
                color: isDark ? "#c8c9cc" : "#4b5563",
              }}
              aria-label="Export as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsDark((d) => !d)}
              className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors"
              style={{
                backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2",
                color: isDark ? "#c8c9cc" : "#4b5563",
              }}
              aria-label="Toggle dark mode"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground font-medium">Total (Airport Rd)</p>
              {loading ? (
                <Skeleton className="h-8 w-24 mt-2" />
              ) : (
                <p className="text-2xl font-bold mt-1" style={{ color: CHART_COLORS.blue }}>
                  {airportTotal ? formatCompact(airportTotal) : "--"}
                </p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground font-medium">Total (Amman)</p>
              {loading ? (
                <Skeleton className="h-8 w-24 mt-2" />
              ) : (
                <p className="text-2xl font-bold mt-1" style={{ color: CHART_COLORS.blue }}>
                  {ammanTotal ? formatCompact(ammanTotal) : "--"}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground font-medium">Peak (Airport Rd)</p>
              {loading ? (
                <Skeleton className="h-8 w-24 mt-2" />
              ) : (
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <p className="text-xl font-bold text-foreground">{airportPeak || "--"}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground font-medium">Peak (Amman)</p>
              {loading ? (
                <Skeleton className="h-8 w-24 mt-2" />
              ) : (
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <p className="text-xl font-bold text-foreground">{ammanPeak || "--"}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground font-medium">Evening Drop (Airport Rd)</p>
              {loading ? (
                <Skeleton className="h-8 w-24 mt-2" />
              ) : (
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <p className="text-xl font-bold text-foreground">{airportEveningDrop || "--"}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground font-medium">Evening Drop (Amman)</p>
              {loading ? (
                <Skeleton className="h-8 w-24 mt-2" />
              ) : (
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <p className="text-xl font-bold text-foreground">{ammanEveningDrop || "--"}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Traffic Volume Over Time</CardTitle>
              {!loading && hourlyData.length > 0 && (
                <CSVLink
                  data={hourlyData}
                  filename="traffic-volume.csv"
                  className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80"
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
                  aria-label="Export chart data as CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {loading ? (
                <Skeleton className="w-full h-[400px]" />
              ) : hourlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400} debounce={0}>
                  <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradientAirport" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.blue} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={CHART_COLORS.blue} stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gradientAmman" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.purple} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={CHART_COLORS.purple} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} minTickGap={20} />
                    <YAxis 
                      tickFormatter={formatCompact} 
                      tick={{ fontSize: 12, fill: tickColor }} 
                      stroke={tickColor} 
                      tickMargin={10} 
                      axisLine={false} 
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)', stroke: 'none' }} />
                    <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: "20px" }} />
                    <Area type="monotone" dataKey="airportRoad" name="Airport Road" fill="url(#gradientAirport)" stroke={CHART_COLORS.blue} fillOpacity={1} strokeWidth={2} activeDot={{ r: 5, fill: CHART_COLORS.blue, stroke: '#ffffff', strokeWidth: 3 }} isAnimationActive={false} />
                    <Area type="monotone" dataKey="amman" name="Amman" fill="url(#gradientAmman)" stroke={CHART_COLORS.purple} fillOpacity={1} strokeWidth={2} activeDot={{ r: 5, fill: CHART_COLORS.purple, stroke: '#ffffff', strokeWidth: 3 }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-[400px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Hourly Comparison</CardTitle>
              {!loading && hourlyData.length > 0 && (
                <CSVLink
                  data={hourlyData}
                  filename="hourly-comparison.csv"
                  className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80"
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
                  aria-label="Export chart data as CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {loading ? (
                <Skeleton className="w-full h-[350px]" />
              ) : hourlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350} debounce={0}>
                  <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} minTickGap={20} />
                    <YAxis 
                      tickFormatter={formatCompact} 
                      tick={{ fontSize: 12, fill: tickColor }} 
                      stroke={tickColor} 
                      tickMargin={10}
                      axisLine={false} 
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={false} />
                    <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: "20px" }} />
                    <Bar dataKey="airportRoad" name="Airport Road" fill={CHART_COLORS.blue} fillOpacity={0.8} activeBar={{ fillOpacity: 1 }} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="amman" name="Amman" fill={CHART_COLORS.purple} fillOpacity={0.8} activeBar={{ fillOpacity: 1 }} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-[350px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
