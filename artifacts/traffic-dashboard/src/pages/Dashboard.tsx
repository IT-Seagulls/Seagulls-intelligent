import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetHourlyTraffic,
  useGetMonthlyTraffic,
  useGetTrafficAnalysis,
} from "@workspace/api-client-react";
import { CSVLink } from "react-csv";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, ChevronDown, Check,
  Sun, Moon, Download, Printer, Clock, TrendingUp, TrendingDown,
} from "lucide-react";

const CHART_COLORS = {
  blue: "#0079F2",
  purple: "#795EFF",
  green: "#009118",
  red: "#A60808",
  pink: "#ec4899",
  amber: "#f59e0b",
  teal: "#14b8a6",
};

const DATA_SOURCES: string[] = ["AdMobilize Live API", "Open-Meteo Weather API"];

const INTERVAL_OPTIONS = [
  { label: "Every 5 min", ms: 5 * 60 * 1000 },
  { label: "Every 15 min", ms: 15 * 60 * 1000 },
  { label: "Every 1 hour", ms: 60 * 60 * 1000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60 * 1000 },
];

function formatCompact(value: number): string {
  if (value === undefined || value === null) return "--";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number): string {
  if (value === undefined || value === null) return "--";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} '${y.slice(2)}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: "6px", padding: "10px 14px", border: "1px solid #e0e0e0", color: "#1a1a1a", fontSize: "13px" }}>
      <div style={{ marginBottom: "6px", fontWeight: 500 }}>{label}</div>
      {payload.map((entry: any, index: number) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color, flexShrink: 0 }} />
          <span style={{ color: "#444" }}>{entry.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
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
  const queryClient = useQueryClient();
  const { data: hourlyResponse, isLoading: hourlyLoading, isFetching: hourlyFetching, dataUpdatedAt } = useGetHourlyTraffic();
  const { data: monthlyResponse, isLoading: monthlyLoading } = useGetMonthlyTraffic();
  const { data: analysisResponse, isLoading: analysisLoading } = useGetTrafficAnalysis();

  const loading = hourlyLoading || hourlyFetching;

  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIntervalMs, setSelectedIntervalMs] = useState(INTERVAL_OPTIONS[0].ms);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) { setIsSpinning(true); }
    else { const t = setTimeout(() => setIsSpinning(false), 600); return () => clearTimeout(t); }
  }, [loading]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const intervalId = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/traffic/hourly"] });
    }, selectedIntervalMs);
    return () => clearInterval(intervalId);
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

  const chartData = hourlyResponse?.data || [];
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  // Monthly chart data – show abbreviated labels and daily avg
  const monthlyData = (monthlyResponse?.data || []).map((m) => ({
    ...m,
    label: formatMonth(m.month),
  }));

  // War timeline data
  const warTimeline = (analysisResponse?.war?.timeline || []).map((t) => ({
    label: formatMonth(t.month),
    avg: t.avg,
    month: t.month,
  }));

  // Iran conflict data
  const iranEvents = analysisResponse?.iran || [];

  // Ramadan chart data
  const ramadanData = (analysisResponse?.ramadan || []).map((r) => ({
    year: String(r.year),
    "Ramadan Avg": r.ramadanAvg,
    "Normal Day Avg": r.normalAvg,
    changePercent: r.changePercent,
    ramadanDays: r.ramadanDays,
  }));

  const war = analysisResponse?.war;

  return (
    <div className="min-h-screen bg-background px-5 py-4 pt-[32px] pb-[32px] pl-[24px] pr-[24px]">
      <div className="max-w-[1400px] mx-auto">

        {/* ── Header ── */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="pt-2">
            <h1 className="font-bold text-[32px]">Traffic Dashboard</h1>
            <p className="text-muted-foreground mt-1.5 text-[14px]">
              Jordan — Airport Road &amp; Amman · Hourly + 4-Year Historical Analysis
            </p>
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
                <button onClick={handleRefresh} disabled={loading} className="flex items-center gap-1 px-2 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <div className="w-px h-4 shrink-0" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)" }} />
                <button onClick={() => setDropdownOpen((o) => !o)} className="flex items-center justify-center px-1.5 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              {dropdownOpen && (
                <div className="absolute top-[30px] right-0 mt-1 w-48 rounded-md border shadow-md bg-popover text-popover-foreground z-50 text-sm overflow-hidden py-1">
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <span className="font-medium text-xs">Auto-refresh</span>
                    <button
                      onClick={() => setAutoRefresh(!autoRefresh)}
                      className={`w-8 h-4 rounded-full transition-colors relative ${autoRefresh ? "bg-primary" : "bg-muted-foreground/30"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${autoRefresh ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </div>
                  <div className="py-1">
                    {INTERVAL_OPTIONS.map((opt) => (
                      <button
                        key={opt.ms}
                        onClick={() => { setSelectedIntervalMs(opt.ms); setDropdownOpen(false); }}
                        className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center justify-between"
                      >
                        <span>{opt.label}</span>
                        {selectedIntervalMs === opt.ms && <Check className="w-3.5 h-3.5 text-primary" />}
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
              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
              aria-label="Export as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsDark((d) => !d)}
              className="flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors"
              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
              aria-label="Toggle dark mode"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* ── Today's KPI Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
          {[
            {
              label: "Total (Airport Road)",
              value: formatCompact(hourlyResponse?.totalVehicles?.airportRoad || 0),
              full: formatNumber(hourlyResponse?.totalVehicles?.airportRoad || 0),
              color: CHART_COLORS.blue,
              icon: null,
            },
            {
              label: "Total (Amman)",
              value: formatCompact(hourlyResponse?.totalVehicles?.amman || 0),
              full: formatNumber(hourlyResponse?.totalVehicles?.amman || 0),
              color: CHART_COLORS.purple,
              icon: null,
            },
            { label: "Peak (Airport Road)", value: hourlyResponse?.peakHour?.airportRoad || "--", full: null, color: CHART_COLORS.blue, icon: <Clock className="w-5 h-5 text-muted-foreground" /> },
            { label: "Peak (Amman)", value: hourlyResponse?.peakHour?.amman || "--", full: null, color: CHART_COLORS.purple, icon: <Clock className="w-5 h-5 text-muted-foreground" /> },
            { label: "Drop (Airport Road)", value: hourlyResponse?.eveningDropHour?.airportRoad || "--", full: null, color: CHART_COLORS.blue, icon: <Clock className="w-5 h-5 text-muted-foreground" /> },
            { label: "Drop (Amman)", value: hourlyResponse?.eveningDropHour?.amman || "--", full: null, color: CHART_COLORS.purple, icon: <Clock className="w-5 h-5 text-muted-foreground" /> },
          ].map((kpi, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                {loading && !hourlyResponse ? (
                  <><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-8 w-32" /></>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis" title={kpi.label}>{kpi.label}</p>
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

        {/* ── Today's Hourly Chart ── */}
        <div className="mb-4">
          <Card>
            <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Hourly Traffic Volume — Today (Mar 30, 2026)</CardTitle>
              {!loading && chartData.length > 0 && (
                <CSVLink data={chartData} filename="hourly-traffic-volume.csv"
                  className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80"
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
                >
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
                        <stop offset="0%" stopColor={CHART_COLORS.blue} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={CHART_COLORS.blue} stopOpacity={0.05} />
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
                    <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: "20px" }} />
                    <Area type="monotone" dataKey="airportRoad" name="Airport Road" fill="url(#gradAR)" stroke={CHART_COLORS.blue} strokeWidth={2} isAnimationActive={false} />
                    <Area type="monotone" dataKey="amman" name="Amman" fill="url(#gradAM)" stroke={CHART_COLORS.purple} strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-[340px] flex items-center justify-center text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Hourly Bar Chart ── */}
        <div className="grid grid-cols-1 mb-6">
          <Card>
            <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Traffic Comparison by Hour</CardTitle>
              {!loading && chartData.length > 0 && (
                <CSVLink data={chartData} filename="traffic-comparison.csv"
                  className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded-[6px] transition-colors hover:opacity-80"
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2", color: isDark ? "#c8c9cc" : "#4b5563" }}
                >
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
                    <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: "20px" }} />
                    <Bar dataKey="airportRoad" name="Airport Road" fill={CHART_COLORS.blue} fillOpacity={0.8} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="amman" name="Amman" fill={CHART_COLORS.purple} fillOpacity={0.8} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-[300px] flex items-center justify-center text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ════════════════════════════════════════════
            SECTION DIVIDER: HISTORICAL ANALYSIS
        ════════════════════════════════════════════ */}
        <div className="mb-5">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: isDark ? "rgba(255,255,255,0.12)" : "#e5e5e5" }} />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              Historical Analysis · 2022–2026 · Amman Network (99 Sensors)
            </span>
            <div className="flex-1 h-px" style={{ background: isDark ? "rgba(255,255,255,0.12)" : "#e5e5e5" }} />
          </div>
        </div>

        {/* ── Monthly Trend ── */}
        <div className="mb-4">
          <Card>
            <CardHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Monthly Traffic Trend — Amman (Daily Average)</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Average daily vehicle detections across all Amman sensors · Feb 2022 – Mar 2026
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {monthlyLoading ? (
                <Skeleton className="w-full h-[300px]" />
              ) : monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300} debounce={0}>
                  <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} tickMargin={10} interval={3} />
                    <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} tickMargin={10} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
                    <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: "20px" }} />
                    <ReferenceLine x="Oct '23" stroke={CHART_COLORS.red} strokeDasharray="4 3" strokeWidth={2} label={{ value: "War starts", fill: CHART_COLORS.red, fontSize: 11 }} />
                    <Line type="monotone" dataKey="ammanDailyAvg" name="Amman Daily Avg" stroke={CHART_COLORS.purple} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-[300px] flex items-center justify-center text-muted-foreground">Loading historical data…</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Analysis Cards: Ramadan + War ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">

          {/* Ramadan Impact */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-base">🌙 Ramadan Impact on Traffic</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Daily average vehicle count during Ramadan vs normal days · Amman network
              </p>
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
                      <Legend content={<CustomLegend />} wrapperStyle={{ paddingTop: "12px" }} />
                      <Bar dataKey="Ramadan Avg" fill={CHART_COLORS.amber} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="Normal Day Avg" fill={CHART_COLORS.blue} fillOpacity={0.7} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 grid grid-cols-5 gap-1">
                    {ramadanData.map((r) => (
                      <div key={r.year} className="text-center p-1.5 rounded-md" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f5f5f5" }}>
                        <div className="text-xs text-muted-foreground font-medium">{r.year}</div>
                        <div className="flex items-center justify-center gap-0.5 mt-0.5">
                          {r.changePercent > 0
                            ? <TrendingUp className="w-3 h-3" style={{ color: CHART_COLORS.green }} />
                            : <TrendingDown className="w-3 h-3" style={{ color: CHART_COLORS.red }} />}
                          <span className="text-xs font-bold" style={{ color: r.changePercent > 0 ? CHART_COLORS.green : CHART_COLORS.red }}>
                            {r.changePercent > 0 ? "+" : ""}{r.changePercent}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    % change = Ramadan avg vs rest-of-year avg
                  </p>
                </>
              ) : (
                <div className="w-full h-[280px] flex items-center justify-center text-muted-foreground">Loading…</div>
              )}
            </CardContent>
          </Card>

          {/* War Impact */}
          <Card>
            <CardHeader className="px-4 pt-4 pb-2">
              <CardTitle className="text-base">⚔️ Gaza War Impact on Jordan Traffic</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Amman daily avg before and after Oct 7, 2023 — Gaza conflict escalation
              </p>
            </CardHeader>
            <CardContent>
              {analysisLoading ? (
                <Skeleton className="w-full h-[280px]" />
              ) : war ? (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="p-3 rounded-lg text-center" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f5f5f5" }}>
                      <div className="text-xs text-muted-foreground">Pre-War Daily Avg</div>
                      <div className="text-lg font-bold mt-1" style={{ color: CHART_COLORS.teal }}>{formatCompact(war.preWarAvgDaily)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{war.preWarDays} days</div>
                    </div>
                    <div className="p-3 rounded-lg text-center" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f5f5f5" }}>
                      <div className="text-xs text-muted-foreground">Post-War Daily Avg</div>
                      <div className="text-lg font-bold mt-1" style={{ color: CHART_COLORS.amber }}>{formatCompact(war.postWarAvgDaily)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{war.postWarDays} days</div>
                    </div>
                    <div className="p-3 rounded-lg text-center" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f5f5f5" }}>
                      <div className="text-xs text-muted-foreground">Overall Change</div>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {war.changePercent > 0
                          ? <TrendingUp className="w-4 h-4" style={{ color: CHART_COLORS.green }} />
                          : <TrendingDown className="w-4 h-4" style={{ color: CHART_COLORS.red }} />}
                        <span className="text-lg font-bold" style={{ color: war.changePercent > 0 ? CHART_COLORS.green : CHART_COLORS.red }}>
                          {war.changePercent > 0 ? "+" : ""}{war.changePercent}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">vs pre-war</div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={160} debounce={0}>
                    <AreaChart data={warTimeline} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradWar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART_COLORS.amber} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={CHART_COLORS.amber} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: tickColor }} stroke={tickColor} tickMargin={8} interval={5} />
                      <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10, fill: tickColor }} stroke={tickColor} tickMargin={8} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
                      <Area type="monotone" dataKey="avg" name="Amman Daily Avg" fill="url(#gradWar)" stroke={CHART_COLORS.amber} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Monthly averages Oct 2023 – Mar 2026
                  </p>
                </>
              ) : (
                <div className="w-full h-[280px] flex items-center justify-center text-muted-foreground">Loading…</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Iran-Israel Conflict Analysis ── */}
        {(analysisLoading || iranEvents.length > 0) && (
          <div className="mb-6">
            <Card>
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="text-base">🚀 Iran–Israel Conflict: Impact on Jordan Road Traffic</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Daily vehicle counts ±14 days around each Iranian missile/drone attack through Jordan's airspace
                </p>
              </CardHeader>
              <CardContent>
                {analysisLoading ? (
                  <Skeleton className="w-full h-[400px]" />
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {iranEvents.map((event) => {
                      const dayData = event.dayWindow.map((d, i) => ({
                        day: i - event.beforeDays,
                        date: d.date,
                        amman: d.amman,
                        isEventDay: d.isEventDay,
                        label: d.isEventDay ? "⚡ Attack" : d.date.slice(5),
                      }));

                      return (
                        <div key={event.id}>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="font-semibold text-sm">{event.label} — {event.date}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 max-w-[420px]">{event.description}</div>
                            </div>
                            <div className="flex gap-3 shrink-0 ml-4">
                              <div className="text-center px-3 py-1.5 rounded-md" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f5f5f5" }}>
                                <div className="text-xs text-muted-foreground">Before</div>
                                <div className="text-sm font-bold" style={{ color: CHART_COLORS.teal }}>{formatCompact(event.beforeAvg)}</div>
                              </div>
                              <div className="text-center px-3 py-1.5 rounded-md" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f5f5f5" }}>
                                <div className="text-xs text-muted-foreground">After</div>
                                <div className="text-sm font-bold" style={{ color: CHART_COLORS.amber }}>{formatCompact(event.afterAvg)}</div>
                              </div>
                              <div className="text-center px-3 py-1.5 rounded-md" style={{ background: isDark ? "rgba(255,255,255,0.05)" : "#f5f5f5" }}>
                                <div className="text-xs text-muted-foreground">Change</div>
                                <div className="flex items-center gap-0.5 justify-center">
                                  {event.changePercent > 0
                                    ? <TrendingUp className="w-3 h-3" style={{ color: CHART_COLORS.green }} />
                                    : <TrendingDown className="w-3 h-3" style={{ color: CHART_COLORS.red }} />}
                                  <span className="text-sm font-bold" style={{ color: event.changePercent > 0 ? CHART_COLORS.green : CHART_COLORS.red }}>
                                    {event.changePercent > 0 ? "+" : ""}{event.changePercent}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <ResponsiveContainer width="100%" height={180} debounce={0}>
                            <ComposedChart data={dayData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                              <defs>
                                <linearGradient id={`gradIran${event.id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={CHART_COLORS.teal} stopOpacity={0.4} />
                                  <stop offset="100%" stopColor={CHART_COLORS.teal} stopOpacity={0.02} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: 9, fill: tickColor }}
                                stroke={tickColor}
                                tickMargin={6}
                                interval={4}
                                tickFormatter={(v: string) => v.slice(5)}
                              />
                              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10, fill: tickColor }} stroke={tickColor} tickMargin={6} axisLine={false} tickLine={false} />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (!active || !payload || payload.length === 0) return null;
                                  const entry = dayData.find((d) => d.date === label);
                                  return (
                                    <div style={{ backgroundColor: "#fff", borderRadius: "6px", padding: "8px 12px", border: "1px solid #e0e0e0", color: "#1a1a1a", fontSize: "12px" }}>
                                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}{entry?.isEventDay ? " ⚡ Attack Day" : ""}</div>
                                      <div>Vehicles: <strong>{(payload[0]?.value as number)?.toLocaleString()}</strong></div>
                                    </div>
                                  );
                                }}
                                isAnimationActive={false}
                              />
                              <ReferenceLine
                                x={event.date}
                                stroke={CHART_COLORS.red}
                                strokeDasharray="4 3"
                                strokeWidth={2}
                                label={{ value: "⚡", fill: CHART_COLORS.red, fontSize: 14 }}
                              />
                              <Area
                                type="monotone"
                                dataKey="amman"
                                name="Daily Vehicles"
                                fill={`url(#gradIran${event.id})`}
                                stroke={CHART_COLORS.teal}
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
