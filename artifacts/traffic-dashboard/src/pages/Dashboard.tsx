import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetHourlyTraffic,
  useGetMonthlyTraffic,
  useGetTrafficAnalysis,
  useGetDeviceHealth,
  useGetDeviceMovers,
  useGetWeatherCorrelation,
} from "@workspace/api-client-react";
import { CSVLink } from "react-csv";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  RefreshCw, ChevronDown, Check,
  Sun, Moon, Download, Printer, Clock, TrendingUp, TrendingDown,
  BarChart2, Lightbulb, Monitor, Info,
} from "lucide-react";

const CHART_COLORS = {
  blue:   "#0079F2",
  purple: "#795EFF",
  green:  "#009118",
  red:    "#A60808",
  amber:  "#f59e0b",
  teal:   "#14b8a6",
};

const DATA_SOURCES = ["AdMobilize Live API", "Open-Meteo Weather API"];

const INTERVAL_OPTIONS = [
  { label: "Every 5 min",    ms: 5  * 60 * 1000 },
  { label: "Every 15 min",   ms: 15 * 60 * 1000 },
  { label: "Every 1 hour",   ms: 60 * 60 * 1000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60 * 1000 },
];

function formatCompact(v: number): string {
  if (v == null) return "--";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}
function formatNumber(v: number): string {
  if (v == null) return "--";
  return new Intl.NumberFormat("en-US").format(v);
}
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", borderRadius: 6, padding: "10px 14px", border: "1px solid #e0e0e0", color: "#1a1a1a", fontSize: 13 }}>
      <div style={{ marginBottom: 6, fontWeight: 500 }}>{label}</div>
      {payload.map((e: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: e.color, flexShrink: 0, display: "inline-block" }} />
          <span style={{ color: "#444" }}>{e.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>{typeof e.value === "number" ? e.value.toLocaleString() : e.value}</span>
        </div>
      ))}
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Info className="w-3.5 h-3.5 cursor-default" style={{ color: "#9ca3af", flexShrink: 0 }} />
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "#1f2937", color: "#f3f4f6", fontSize: 12, lineHeight: 1.5,
          borderRadius: 6, padding: "6px 10px", whiteSpace: "normal", width: 210,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 50, pointerEvents: "none",
        }}>
          {text}
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: "5px solid #1f2937",
          }} />
        </div>
      )}
    </div>
  );
}

function CustomLegend({ payload }: any) {
  if (!payload?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 16px", fontSize: 13 }}>
      {payload.map((e: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: e.color, display: "inline-block" }} />
          <span>{e.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: hourlyResponse, isLoading: hourlyLoading, isFetching: hourlyFetching, dataUpdatedAt } = useGetHourlyTraffic();
  const { data: monthlyResponse, isLoading: monthlyLoading } = useGetMonthlyTraffic();
  const { data: analysisResponse, isLoading: analysisLoading } = useGetTrafficAnalysis();
  const { data: healthResponse, isLoading: healthLoading } = useGetDeviceHealth({
    query: { refetchInterval: 5 * 60 * 1000 },
  });
  const { data: weatherData, isLoading: weatherLoading } = useGetWeatherCorrelation();
  const { data: moversResponse, isLoading: moversLoading } = useGetDeviceMovers({
    query: { staleTime: 30 * 60 * 1000 },
  });

  const loading = hourlyLoading || hourlyFetching;

  const [isDark, setIsDark] = useState(true);
  useEffect(() => { document.documentElement.classList.toggle("dark", isDark); }, [isDark]);

  const [autoRefresh, setAutoRefresh]     = useState(false);
  const [isSpinning, setIsSpinning]       = useState(false);
  const [dropdownOpen, setDropdownOpen]   = useState(false);
  const [selectedIntervalMs, setSelectedIntervalMs] = useState(INTERVAL_OPTIONS[0].ms);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) { setIsSpinning(true); }
    else { const t = setTimeout(() => setIsSpinning(false), 600); return () => clearTimeout(t); }
  }, [loading]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => queryClient.invalidateQueries({ queryKey: ["/api/traffic/hourly"] }), selectedIntervalMs);
    return () => clearInterval(id);
  }, [autoRefresh, selectedIntervalMs, queryClient]);

  const handleRefresh = () => queryClient.invalidateQueries({ queryKey: ["/api/traffic/hourly"] });

  const lastRefreshed = dataUpdatedAt
    ? (() => {
        const d = new Date(dataUpdatedAt);
        const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
        const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return `${time} on ${date}`;
      })()
    : null;

  const chartData    = hourlyResponse?.data || [];
  const gridColor    = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor    = isDark ? "#98999C" : "#71717a";

  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const YEAR_COLORS: Record<string, string> = {
    "2022": "#0079F2",
    "2023": "#795EFF",
    "2024": "#14b8a6",
    "2025": "#f59e0b",
    "2026": "#e55a5a",
  };
  const yearlyOverlay = (() => {
    const byMonth: Record<string, Record<string, number>> = {};
    MONTH_LABELS.forEach((m) => { byMonth[m] = {}; });
    for (const row of monthlyResponse?.data || []) {
      const [yr, mo] = row.month.split("-");
      const label = MONTH_LABELS[parseInt(mo) - 1];
      if (label) byMonth[label][yr] = row.ammanDailyAvg;
    }
    return MONTH_LABELS.map((m) => ({ month: m, ...byMonth[m] }));
  })();
  const years = ["2022", "2023", "2024", "2025", "2026"];
  const yearLabels: Record<string, string> = {
    "2022": "2022", "2023": "2023", "2024": "2024", "2025": "2025",
    "2026": "2026 (Q1 · Ramadan Feb–Mar)",
  };

  const RAMADAN_EXACT: Record<string, { start: string; end: string }> = {
    "2022": { start: "2022-04-02", end: "2022-05-01" },
    "2023": { start: "2023-03-23", end: "2023-04-21" },
    "2024": { start: "2024-03-11", end: "2024-04-09" },
    "2025": { start: "2025-03-01", end: "2025-03-29" },
    "2026": { start: "2026-02-18", end: "2026-03-19" },
  };
  function fmtRDate(s: string): string {
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const [, m, d] = s.split("-");
    return `${MONTHS[parseInt(m)-1]} ${parseInt(d)}`;
  }
  const ramadanData  = (analysisResponse?.ramadan || []).map((r) => ({
    year: String(r.year),
    "Ramadan Avg":    r.ramadanAvg,
    "Normal Day Avg": r.normalAvg,
    changePercent:    r.changePercent,
  }));
  const statBg = isDark ? "rgba(255,255,255,0.05)" : "#f5f5f5";

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <div className="max-w-[1400px] mx-auto">

        {/* ── Header ── */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="pt-1">
            <h1 className="font-bold text-[32px]">Traffic Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-[14px]">
              Jordan — Airport Road &amp; Amman · Hourly + 4-Year Historical Analysis
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[12px] text-muted-foreground shrink-0">Data Sources:</span>
              {DATA_SOURCES.map((s) => (
                <span key={s} className="text-[12px] font-bold rounded px-2 py-0.5"
                  style={{ background: isDark ? "rgba(255,255,255,0.1)" : "rgb(229,231,235)", color: isDark ? "#c8c9cc" : "rgb(75,85,99)" }}>
                  {s}
                </span>
              ))}
            </div>
            {lastRefreshed && <p className="text-[12px] text-muted-foreground mt-2">Last refresh: {lastRefreshed}</p>}
          </div>

          <div className="flex items-center gap-3 pt-2 print:hidden">
            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center rounded-[6px] overflow-hidden h-[26px] text-[12px]"
                style={{ background: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
                <button onClick={handleRefresh} disabled={loading}
                  className="flex items-center gap-1 px-2 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <div className="w-px h-4 shrink-0" style={{ background: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)" }} />
                <button onClick={() => setDropdownOpen((o) => !o)}
                  className="flex items-center justify-center px-1.5 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              {dropdownOpen && (
                <div className="absolute top-[30px] right-0 mt-1 w-48 rounded-md border shadow-md bg-popover text-popover-foreground z-50 text-sm py-1">
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <span className="font-medium text-xs">Auto-refresh</span>
                    <button onClick={() => setAutoRefresh(!autoRefresh)}
                      className={`w-8 h-4 rounded-full transition-colors relative ${autoRefresh ? "bg-primary" : "bg-muted-foreground/30"}`}>
                      <span className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${autoRefresh ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>
                  <div className="py-1">
                    {INTERVAL_OPTIONS.map((opt) => (
                      <button key={opt.ms} onClick={() => { setSelectedIntervalMs(opt.ms); setDropdownOpen(false); }}
                        className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center justify-between">
                        <span>{opt.label}</span>
                        {selectedIntervalMs === opt.ms && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => window.print()} disabled={loading}
              className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors disabled:opacity-50"
              style={{ background: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setIsDark((d) => !d)}
              className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors"
              style={{ background: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="overview">
          <TabsList className="mb-6 h-9 gap-1 px-1"
            style={{ background: isDark ? "rgba(255,255,255,0.07)" : "#f0f0f0" }}>
            <TabsTrigger value="overview" className="flex items-center gap-1.5 text-sm h-7 px-4 data-[state=active]:shadow-sm">
              <BarChart2 className="w-3.5 h-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-1.5 text-sm h-7 px-4 data-[state=active]:shadow-sm">
              <Lightbulb className="w-3.5 h-3.5" />
              Insights
            </TabsTrigger>
          </TabsList>

          {/* ════════════ OVERVIEW TAB ════════════ */}
          <TabsContent value="overview">

            {/* Screen Health Banner */}
            {healthLoading ? (
              <Skeleton className="w-full h-14 mb-4 rounded-xl" />
            ) : healthResponse && (
              (() => {
                const { total, activeCount, offlineCount, offlineDevices } = healthResponse;
                const allGood = offlineCount === 0;
                const bgColor  = allGood
                  ? (isDark ? "rgba(0,145,24,0.12)"  : "rgba(0,145,24,0.08)")
                  : (isDark ? "rgba(166,8,8,0.15)"   : "rgba(166,8,8,0.08)");
                const borderColor = allGood ? "rgba(0,145,24,0.35)" : "rgba(166,8,8,0.35)";
                const textColor   = allGood ? CHART_COLORS.green    : CHART_COLORS.red;
                return (
                  <div className="mb-4 rounded-xl px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2"
                    style={{ background: bgColor, border: `1px solid ${borderColor}` }}>
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${allGood ? "animate-ping bg-green-500" : "bg-red-500"}`} />
                        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${allGood ? "bg-green-500" : "bg-red-500"}`} />
                      </span>
                      <Monitor className="w-4 h-4" style={{ color: textColor }} />
                      <span className="font-bold text-[15px]" style={{ color: textColor }}>
                        {activeCount} / {total} Screens Active
                      </span>
                      {allGood && <span className="text-sm text-muted-foreground">— All screens reporting</span>}
                    </div>
                    {!allGood && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-muted-foreground">Offline:</span>
                        {offlineDevices.map((d) => (
                          <span key={d.id} className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{ background: "rgba(166,8,8,0.18)", color: CHART_COLORS.red }}>
                            {d.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            )}

            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-5">
              {[
                { label: "Total (Airport Road)", value: formatCompact(hourlyResponse?.totalVehicles?.airportRoad || 0), full: formatNumber(hourlyResponse?.totalVehicles?.airportRoad || 0), color: CHART_COLORS.blue,   icon: null },
                { label: "Total (Amman)",         value: formatCompact(hourlyResponse?.totalVehicles?.amman || 0),        full: formatNumber(hourlyResponse?.totalVehicles?.amman || 0),        color: CHART_COLORS.purple, icon: null },
                { label: "Peak (Airport Road)",   value: hourlyResponse?.peakHour?.airportRoad || "--",                  full: null, color: CHART_COLORS.blue,   icon: <Clock className="w-5 h-5 text-muted-foreground" /> },
                { label: "Peak (Amman)",           value: hourlyResponse?.peakHour?.amman || "--",                        full: null, color: CHART_COLORS.purple, icon: <Clock className="w-5 h-5 text-muted-foreground" /> },
                { label: "Drop (Airport Road)",   value: hourlyResponse?.eveningDropHour?.airportRoad || "--",            full: null, color: CHART_COLORS.blue,   icon: <Clock className="w-5 h-5 text-muted-foreground" /> },
                { label: "Drop (Amman)",           value: hourlyResponse?.eveningDropHour?.amman || "--",                  full: null, color: CHART_COLORS.purple, icon: <Clock className="w-5 h-5 text-muted-foreground" /> },
              ].map((kpi, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    {loading && !hourlyResponse ? (
                      <><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-8 w-32" /></>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground truncate" title={kpi.label}>{kpi.label}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {kpi.icon}
                          <p className="text-2xl font-bold" style={{ color: kpi.color }} title={kpi.full || undefined}>{kpi.value}</p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Hourly Area Chart */}
            <div className="mb-4">
              <Card>
                <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base flex items-center gap-1.5">Hourly Traffic Volume — Today <InfoTooltip text="Vehicle counts per hour for today, split by Airport Road sensors and the Amman city network. Refreshes every few minutes." /></CardTitle>
                  {!loading && chartData.length > 0 && (
                    <CSVLink data={chartData} filename="hourly-traffic-volume.csv"
                      className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] hover:opacity-80"
                      style={{ background: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
                      <Download className="w-3.5 h-3.5" />
                    </CSVLink>
                  )}
                </CardHeader>
                <CardContent>
                  {loading && !hourlyResponse ? (
                    <Skeleton className="w-full h-[340px]" />
                  ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={340} debounce={0}>
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradAR" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART_COLORS.blue}   stopOpacity={0.5} />
                            <stop offset="100%" stopColor={CHART_COLORS.blue}   stopOpacity={0.05} />
                          </linearGradient>
                          <linearGradient id="gradAM" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART_COLORS.purple} stopOpacity={0.5} />
                            <stop offset="100%" stopColor={CHART_COLORS.purple} stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis dataKey="hour" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} minTickGap={20} />
                        <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: "rgba(0,0,0,0.05)", stroke: "none" }} />
                        <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: 20 }} />
                        <Area type="monotone" dataKey="airportRoad" name="Airport Road" fill="url(#gradAR)" stroke={CHART_COLORS.blue}   strokeWidth={2} isAnimationActive={false} />
                        <Area type="monotone" dataKey="amman"       name="Amman"        fill="url(#gradAM)" stroke={CHART_COLORS.purple} strokeWidth={2} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-[340px] flex items-center justify-center text-muted-foreground">No data available</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Hourly Bar Chart */}
            <Card>
              <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-1.5">Traffic Comparison by Hour <InfoTooltip text="Compares today's hourly counts against the same day last week, for both Airport Road and the Amman network." /></CardTitle>
                {!loading && chartData.length > 0 && (
                  <CSVLink data={chartData} filename="traffic-comparison.csv"
                    className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] hover:opacity-80"
                    style={{ background: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}>
                    <Download className="w-3.5 h-3.5" />
                  </CSVLink>
                )}
              </CardHeader>
              <CardContent>
                {loading && !hourlyResponse ? (
                  <Skeleton className="w-full h-[300px]" />
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} debounce={0}>
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} minTickGap={20} />
                      <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={false} />
                      <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: 20 }} />
                      <Bar dataKey="airportRoad" name="Airport Road" fill={CHART_COLORS.blue}   fillOpacity={0.8} isAnimationActive={false} radius={[2,2,0,0]} />
                      <Bar dataKey="amman"       name="Amman"        fill={CHART_COLORS.purple} fillOpacity={0.8} isAnimationActive={false} radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-[300px] flex items-center justify-center text-muted-foreground">No data available</div>
                )}
              </CardContent>
            </Card>

            {/* ── Top Movers Card ── */}
            <div className="mt-5">
              <Card>
                <CardHeader className="px-4 pt-4 pb-2">
                  <CardTitle className="text-base flex items-center gap-1.5">📊 Screen Performance vs Last Week <InfoTooltip text="Ranks individual screens by how much their daily count changed vs 7 days ago. Screens with very low traffic last week are excluded to avoid skewed percentages." /></CardTitle>
                  {moversResponse && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Today ({moversResponse.today}) vs same day last week ({moversResponse.lastWeek}) · per screen total
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  {moversLoading ? (
                    <Skeleton className="w-full h-[200px]" />
                  ) : moversResponse ? (
                    <div className="grid grid-cols-2 gap-4">
                      {/* Top 5 Growth */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <TrendingUp className="w-4 h-4" style={{ color: CHART_COLORS.green }} />
                          <span className="text-sm font-semibold" style={{ color: CHART_COLORS.green }}>Top 5 Growth</span>
                        </div>
                        <div className="space-y-2">
                          {moversResponse.topGrowth.map((d) => (
                            <div key={d.name} className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate">{d.name}</div>
                                <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: isDark ? "rgba(255,255,255,0.08)" : "#f0f0f0" }}>
                                  <div className="h-full rounded-full" style={{
                                    width: `${Math.min(100, Math.abs(d.pct) / 2)}%`,
                                    background: CHART_COLORS.green,
                                  }} />
                                </div>
                              </div>
                              <div className="text-right shrink-0 w-14">
                                <span className="text-xs font-bold" style={{ color: CHART_COLORS.green }}>
                                  +{d.pct}%
                                </span>
                                <div className="text-[10px] text-muted-foreground">{d.today.toLocaleString()}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Bottom 5 Drop */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <TrendingDown className="w-4 h-4" style={{ color: CHART_COLORS.red }} />
                          <span className="text-sm font-semibold" style={{ color: CHART_COLORS.red }}>Bottom 5 Drop</span>
                        </div>
                        <div className="space-y-2">
                          {moversResponse.topDrop.map((d) => (
                            <div key={d.name} className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate">{d.name}</div>
                                <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: isDark ? "rgba(255,255,255,0.08)" : "#f0f0f0" }}>
                                  <div className="h-full rounded-full" style={{
                                    width: `${Math.min(100, Math.abs(d.pct) / 2)}%`,
                                    background: CHART_COLORS.red,
                                  }} />
                                </div>
                              </div>
                              <div className="text-right shrink-0 w-14">
                                <span className="text-xs font-bold" style={{ color: CHART_COLORS.red }}>
                                  {d.pct}%
                                </span>
                                <div className="text-[10px] text-muted-foreground">{d.today.toLocaleString()}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
                      Data unavailable
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

          </TabsContent>

          {/* ════════════ INSIGHTS TAB ════════════ */}
          <TabsContent value="insights">

            <div className="mb-5">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: isDark ? "rgba(255,255,255,0.12)" : "#e5e5e5" }} />
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                  4-Year Historical Analysis · 2022–2026 · Amman Network
                </span>
                <div className="flex-1 h-px" style={{ background: isDark ? "rgba(255,255,255,0.12)" : "#e5e5e5" }} />
              </div>
            </div>

            {/* Yearly Overlay Trend */}
            <div className="mb-5">
              <Card>
                <CardHeader className="px-4 pt-4 pb-2">
                  <CardTitle className="text-base flex items-center gap-1.5">📈 Year-over-Year Traffic — Amman (Daily Average) <InfoTooltip text="Each line is one full calendar year plotted Jan–Dec. Compare seasonality and trends across 2022–2026. 2026 is dashed since only Q1 data is available." /></CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Each line = one calendar year · overlaid by month for direct comparison
                  </p>
                </CardHeader>
                <CardContent>
                  {monthlyLoading ? (
                    <Skeleton className="w-full h-[300px]" />
                  ) : yearlyOverlay.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300} debounce={0}>
                      <LineChart data={yearlyOverlay} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} />
                        <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} axisLine={false} tickLine={false} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div style={{ background: "#fff", borderRadius: 6, padding: "10px 14px", border: "1px solid #e0e0e0", color: "#1a1a1a", fontSize: 13 }}>
                                <div style={{ marginBottom: 6, fontWeight: 500 }}>{label}</div>
                                {payload.map((e: any, i: number) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: 2, background: e.color, flexShrink: 0, display: "inline-block" }} />
                                    <span style={{ color: "#444" }}>{e.name}</span>
                                    <span style={{ marginLeft: "auto", fontWeight: 600 }}>{typeof e.value === "number" ? e.value.toLocaleString() : "--"}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          }}
                          isAnimationActive={false}
                        />
                        <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: 16 }} />
                        {years.map((yr) => (
                          <Line
                            key={yr}
                            type="monotone"
                            dataKey={yr}
                            name={yearLabels[yr]}
                            stroke={YEAR_COLORS[yr]}
                            strokeWidth={yr === "2026" ? 2.5 : 2}
                            strokeDasharray={yr === "2026" ? "6 3" : undefined}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-[300px] flex items-center justify-center text-muted-foreground">Loading…</div>
                  )}

                  {/* Ramadan date reference strip */}
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: gridColor }}>
                    <div className="text-xs text-muted-foreground mb-2.5 flex items-center gap-1">
                      <span>🌙</span> Ramadan window per year (exact dates)
                    </div>
                    <div className="grid grid-cols-5 gap-3">
                      {years.map((yr) => {
                        const r = RAMADAN_EXACT[yr];
                        return (
                          <div key={yr} style={{ borderLeft: `3px solid ${YEAR_COLORS[yr]}`, paddingLeft: 8 }}>
                            <div style={{ color: YEAR_COLORS[yr], fontWeight: 700, fontSize: 13 }}>{yr}</div>
                            <div style={{ fontSize: 11, color: tickColor, lineHeight: 1.5 }}>
                              {fmtRDate(r.start)}<br />
                              <span style={{ color: isDark ? "rgba(255,255,255,0.35)" : "#bbb" }}>to</span>{" "}
                              {fmtRDate(r.end)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Ramadan */}
            <div className="mb-5">
              <Card>
                <CardHeader className="px-4 pt-4 pb-2">
                  <CardTitle className="text-base flex items-center gap-1.5">🌙 Ramadan Impact on Traffic <InfoTooltip text="Compares the daily average count during each Ramadan period against normal days in that same year. Negative % means traffic dropped during Ramadan." /></CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Daily average during Ramadan vs normal days · Amman network</p>
                </CardHeader>
                <CardContent>
                  {analysisLoading ? (
                    <Skeleton className="w-full h-[280px]" />
                  ) : ramadanData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={220} debounce={0}>
                        <BarChart data={ramadanData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                          <XAxis dataKey="year" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} />
                          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} axisLine={false} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={false} />
                          <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: 12 }} />
                          <Bar dataKey="Ramadan Avg"    fill={CHART_COLORS.amber}  fillOpacity={0.85} isAnimationActive={false} radius={[2,2,0,0]} />
                          <Bar dataKey="Normal Day Avg" fill={CHART_COLORS.blue}   fillOpacity={0.7}  isAnimationActive={false} radius={[2,2,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="mt-3 grid grid-cols-5 gap-1.5">
                        {ramadanData.map((r) => {
                          const period = RAMADAN_EXACT[r.year];
                          return (
                            <div key={r.year} className="text-center p-2 rounded-md" style={{ background: statBg, borderTop: `2px solid ${YEAR_COLORS[r.year] || "#888"}` }}>
                              <div className="text-xs font-bold" style={{ color: YEAR_COLORS[r.year] || tickColor }}>{r.year}</div>
                              {period && (
                                <div className="text-xs text-muted-foreground mt-0.5" style={{ fontSize: 10, lineHeight: 1.4 }}>
                                  {fmtRDate(period.start)}<br />– {fmtRDate(period.end)}
                                </div>
                              )}
                              <div className="flex items-center justify-center gap-0.5 mt-1">
                                {r.changePercent > 0
                                  ? <TrendingUp   className="w-3 h-3" style={{ color: CHART_COLORS.green }} />
                                  : <TrendingDown className="w-3 h-3" style={{ color: CHART_COLORS.red   }} />}
                                <span className="text-xs font-bold" style={{ color: r.changePercent > 0 ? CHART_COLORS.green : CHART_COLORS.red }}>
                                  {r.changePercent > 0 ? "+" : ""}{r.changePercent}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 text-center">% change = Ramadan avg vs rest-of-year avg</p>
                    </>
                  ) : (
                    <div className="w-full h-[280px] flex items-center justify-center text-muted-foreground">Loading…</div>
                  )}
                </CardContent>
              </Card>

            </div>

            {/* ── Weather Correlation ── */}
            <div className="mt-8">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                <span>🌦️</span> Weather Impact on Traffic
              </h2>

              {weatherLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Skeleton className="h-[280px] rounded-xl" />
                  <Skeleton className="h-[280px] rounded-xl" />
                  <Skeleton className="h-[280px] rounded-xl" />
                  <Skeleton className="h-[280px] rounded-xl" />
                  <Skeleton className="h-[320px] rounded-xl md:col-span-2" />
                </div>
              ) : weatherData ? (
                <>
                  {/* Row 1 — by condition + by temp */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

                    {/* By condition */}
                    <Card style={{ background: isDark ? "#1a1b1e" : "#fff", border: isDark ? "1px solid rgba(255,255,255,0.08)" : undefined }}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-1.5">Traffic by Weather Condition <InfoTooltip text="Average daily traffic grouped by weather type. The % shows how each condition compares to clear-sky days." /></CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">Avg daily count per condition · Amman network · {weatherData.totalDays} days</p>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 mt-2">
                          {weatherData.byCondition.map((b) => {
                            const maxT = Math.max(...weatherData.byCondition.map((x) => x.avgTraffic));
                            const pct  = Math.round((b.avgTraffic / maxT) * 100);
                            const isUp  = (b.pctVsClear ?? 0) >= 0;
                            return (
                              <div key={b.label}>
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span>{b.emoji} {b.label} <span className="text-muted-foreground text-xs">({b.days}d)</span></span>
                                  <span className="font-semibold tabular-nums">{formatCompact(b.avgTraffic)}
                                    {b.label !== "Clear" && (
                                      <span className={`ml-2 text-xs font-normal ${isUp ? "text-green-500" : "text-red-500"}`}>
                                        {isUp ? "+" : ""}{b.pctVsClear}%
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="h-2 rounded-full" style={{ background: isDark ? "rgba(255,255,255,0.08)" : "#f0f0f0" }}>
                                  <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: CHART_COLORS.blue }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    {/* By temperature */}
                    <Card style={{ background: isDark ? "#1a1b1e" : "#fff", border: isDark ? "1px solid rgba(255,255,255,0.08)" : undefined }}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-1.5">Traffic by Temperature Band <InfoTooltip text="Average daily traffic grouped by the day's maximum temperature. Warmer days in Amman tend to see more movement." /></CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">Avg daily count by max daily temperature</p>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 mt-2">
                          {weatherData.byTemp.map((b) => {
                            const maxT = Math.max(...weatherData.byTemp.map((x) => x.avgTraffic));
                            const pct  = Math.round((b.avgTraffic / maxT) * 100);
                            const TEMP_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#f87171"];
                            const colorIdx = weatherData.byTemp.indexOf(b);
                            return (
                              <div key={b.label}>
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span>{b.label} <span className="text-muted-foreground text-xs">({b.days}d)</span></span>
                                  <span className="font-semibold tabular-nums">{formatCompact(b.avgTraffic)}</span>
                                </div>
                                <div className="h-2 rounded-full" style={{ background: isDark ? "rgba(255,255,255,0.08)" : "#f0f0f0" }}>
                                  <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: TEMP_COLORS[colorIdx] ?? CHART_COLORS.amber }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>

                  </div>

                  {/* Row 2 — by precipitation + key findings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

                    {/* By precipitation */}
                    <Card style={{ background: isDark ? "#1a1b1e" : "#fff", border: isDark ? "1px solid rgba(255,255,255,0.08)" : undefined }}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-1.5">Traffic by Rainfall <InfoTooltip text="Average daily traffic on dry, drizzly, and heavy-rain days. The % is relative to no-rain days." /></CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">Avg daily count by precipitation level</p>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 mt-2">
                          {weatherData.byPrecip.map((b) => {
                            const maxT = Math.max(...weatherData.byPrecip.map((x) => x.avgTraffic));
                            const pct  = maxT > 0 ? Math.round((b.avgTraffic / maxT) * 100) : 0;
                            const PRECIP_COLORS = ["#60a5fa", "#818cf8", "#a78bfa"];
                            const idx = weatherData.byPrecip.indexOf(b);
                            const noRain = weatherData.byPrecip.find((x) => x.label.startsWith("No Rain"));
                            const vsNoRain = noRain && noRain.avgTraffic > 0 && b.label !== noRain.label
                              ? Math.round(((b.avgTraffic - noRain.avgTraffic) / noRain.avgTraffic) * 100)
                              : null;
                            return (
                              <div key={b.label}>
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span>{b.label} <span className="text-muted-foreground text-xs">({b.days}d)</span></span>
                                  <span className="font-semibold tabular-nums">{b.avgTraffic > 0 ? formatCompact(b.avgTraffic) : "—"}
                                    {vsNoRain !== null && (
                                      <span className={`ml-2 text-xs font-normal ${vsNoRain >= 0 ? "text-green-500" : "text-red-500"}`}>
                                        {vsNoRain >= 0 ? "+" : ""}{vsNoRain}%
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="h-2 rounded-full" style={{ background: isDark ? "rgba(255,255,255,0.08)" : "#f0f0f0" }}>
                                  <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: PRECIP_COLORS[idx] ?? CHART_COLORS.blue }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Key findings */}
                    <Card style={{ background: isDark ? "#1a1b1e" : "#fff", border: isDark ? "1px solid rgba(255,255,255,0.08)" : undefined }}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-1.5">Key Findings <InfoTooltip text="Pearson r measures linear correlation from −1 to +1. Values near ±1 indicate a strong relationship; near 0 means little connection." /></CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">Statistical relationship between weather and traffic</p>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4 mt-2">
                          {/* Pearson temp */}
                          <div className="p-3 rounded-lg" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f8f9fa" }}>
                            <div className="text-xs text-muted-foreground mb-1">Temperature Correlation (Pearson r)</div>
                            <div className="text-2xl font-bold tabular-nums" style={{ color: weatherData.pearsonTemp < 0 ? CHART_COLORS.red : CHART_COLORS.green }}>
                              {weatherData.pearsonTemp > 0 ? "+" : ""}{weatherData.pearsonTemp}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {Math.abs(weatherData.pearsonTemp) < 0.2 ? "Weak correlation" :
                               Math.abs(weatherData.pearsonTemp) < 0.5 ? "Moderate correlation" : "Strong correlation"}
                              {weatherData.pearsonTemp < 0 ? " — traffic drops on hotter days" : " — traffic rises with temperature"}
                            </div>
                          </div>
                          {/* Pearson precip */}
                          <div className="p-3 rounded-lg" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f8f9fa" }}>
                            <div className="text-xs text-muted-foreground mb-1">Rainfall Correlation (Pearson r)</div>
                            <div className="text-2xl font-bold tabular-nums" style={{ color: weatherData.pearsonPrecip < 0 ? CHART_COLORS.red : CHART_COLORS.green }}>
                              {weatherData.pearsonPrecip > 0 ? "+" : ""}{weatherData.pearsonPrecip}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {Math.abs(weatherData.pearsonPrecip) < 0.2 ? "Weak correlation" :
                               Math.abs(weatherData.pearsonPrecip) < 0.5 ? "Moderate correlation" : "Strong correlation"}
                              {weatherData.pearsonPrecip < 0 ? " — traffic drops on rainy days" : " — rain days show more traffic"}
                            </div>
                          </div>
                          <div className="flex gap-3 text-sm">
                            <div className="flex-1 text-center p-2 rounded-lg" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f8f9fa" }}>
                              <div className="text-lg font-bold tabular-nums">{weatherData.rainyDays}</div>
                              <div className="text-xs text-muted-foreground">Rainy days analysed</div>
                            </div>
                            <div className="flex-1 text-center p-2 rounded-lg" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f8f9fa" }}>
                              <div className="text-lg font-bold tabular-nums">{weatherData.totalDays}</div>
                              <div className="text-xs text-muted-foreground">Total days</div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                  </div>

                  {/* Row 3 — Monthly temp + traffic dual-axis */}
                  <Card style={{ background: isDark ? "#1a1b1e" : "#fff", border: isDark ? "1px solid rgba(255,255,255,0.08)" : undefined }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-1.5">Monthly Traffic vs Temperature Trend <InfoTooltip text="Monthly average daily traffic (bars) alongside average daily max temperature (line), covering 2022–2026." /></CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">Avg daily traffic (bars) vs avg daily max temperature (line) · 2022–2026</p>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={weatherData.monthly} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.06)" : "#e5e7eb"} />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2}
                            stroke={isDark ? "rgba(255,255,255,0.3)" : "#9ca3af"} />
                          <YAxis yAxisId="traffic" orientation="left"
                            tickFormatter={(v) => formatCompact(v)}
                            tick={{ fontSize: 11 }} stroke={isDark ? "rgba(255,255,255,0.3)" : "#9ca3af"} />
                          <YAxis yAxisId="temp" orientation="right"
                            tickFormatter={(v) => `${v}°`}
                            tick={{ fontSize: 11 }} stroke="#f87171"
                            domain={[0, 50]} />
                          <Tooltip
                            formatter={(value: number, name: string) =>
                              name === "Avg Daily Traffic"
                                ? [formatNumber(value), name]
                                : [`${value}°C`, name]
                            }
                            contentStyle={{ background: isDark ? "#1a1b1e" : "#fff", border: "1px solid #e0e0e0", fontSize: 12 }}
                          />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                          <Bar yAxisId="traffic" dataKey="avgTraffic" name="Avg Daily Traffic"
                            fill={CHART_COLORS.blue} fillOpacity={0.75} isAnimationActive={false} radius={[2,2,0,0]} />
                          <Line yAxisId="temp" type="monotone" dataKey="avgTempMax" name="Max Temp (°C)"
                            stroke="#f87171" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                </>
              ) : (
                <div className="w-full h-24 flex items-center justify-center text-muted-foreground text-sm">
                  Weather data unavailable
                </div>
              )}
            </div>

          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
