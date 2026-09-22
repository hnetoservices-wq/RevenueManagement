import { useMemo, useState } from "react";
import { format, getDay } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { parseIsoDate } from "../../domain/dates";
import type { DashboardFilters, DailyPerformance, IsoDate, Property, Reservation } from "../../domain/models";
import { calculateOccupancyAnalysis } from "./occupancy";
import type { PerformanceComparisonMode } from "../performance/performance";
import "./occupancy.css";

interface Props {
  property: Property;
  reservations: Reservation[];
  coverageReservations?: Reservation[];
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
}

function number(value: number | null, digits = 0) {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(value);
}

function percent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function signed(value: number | null, digits = 1) {
  if (value === null) return "—";
  const formatted = number(Math.abs(value), digits);
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}

function tone(value: number | null) {
  return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (filters: DashboardFilters) => void }) {
  return <div className="filters"><label>From<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>To<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label></div>;
}

function occupancyBand(occupancy: number | null) {
  if (occupancy === null) return "occ-none";
  if (occupancy >= 1) return "occ-full";
  if (occupancy >= 0.8) return "occ-high";
  if (occupancy >= 0.5) return "occ-medium";
  return "occ-low";
}

function Calendar({ daily }: { daily: DailyPerformance[] }) {
  const months = useMemo(() => {
    const grouped = new Map<string, DailyPerformance[]>();
    for (const day of daily) {
      const key = day.date.slice(0, 7);
      const rows = grouped.get(key) ?? [];
      rows.push(day);
      grouped.set(key, rows);
    }
    return Array.from(grouped.entries());
  }, [daily]);

  return <div className="occupancy-calendar-grid">
    {months.map(([month, days]) => {
      const first = days[0];
      const leading = getDay(parseIsoDate(first.date));
      return <section className="occupancy-month" key={month}>
        <h3>{format(parseIsoDate(`${month}-01` as IsoDate), "MMMM yyyy")}</h3>
        <div className="occupancy-weekdays">{["S", "M", "T", "W", "T", "F", "S"].map((label, index) => <span key={`${month}-${label}-${index}`}>{label}</span>)}</div>
        <div className="occupancy-month-days">
          {Array.from({ length: leading }).map((_, index) => <span className="occupancy-day empty" key={`empty-${index}`} />)}
          {days.map((day) => {
            const closureText = day.unavailableRoomNights ? ` · ${day.unavailableRoomNights} indisponível${day.unavailableRoomNights === 1 ? "" : "is"}` : "";
            return <span className={`occupancy-day ${occupancyBand(day.occupancy)} ${day.unavailableRoomNights ? "has-closure" : ""}`} key={day.date} title={`${day.date}: ${percent(day.occupancy)} · ${day.roomNightsSold}/${day.availableRoomNights} noites-quarto${closureText}`}><b>{Number(day.date.slice(8))}</b><small>{day.occupancy === null ? "—" : `${Math.round(day.occupancy * 100)}%`}</small>{day.unavailableRoomNights > 0 && <i className="occupancy-closure-marker" aria-label={`${day.unavailableRoomNights} noites-quarto indisponíveis`} />}</span>;
          })}
        </div>
      </section>;
    })}
  </div>;
}

export function OccupancyPage({ property, reservations, coverageReservations = reservations, filters, setFilters }: Props) {
  const [comparisonMode, setComparisonMode] = useState<PerformanceComparisonMode>("previous_year");
  const analysis = useMemo(
    () => calculateOccupancyAnalysis(property, reservations, filters, comparisonMode, coverageReservations),
    [property, reservations, coverageReservations, filters, comparisonMode],
  );

  const comparisonName = comparisonMode === "previous_year" ? "PY" : comparisonMode === "previous_period" ? "Prev. period" : "Comparison";
  const comparison = analysis.comparisonReliable ? analysis.comparison : null;
  const cancelledOnly = reservations.length > 0 && reservations.every((reservation) => reservation.status === "cancelled");

  const occupancyDelta = comparison && analysis.current.occupancy !== null && comparison.occupancy !== null
    ? (analysis.current.occupancy - comparison.occupancy) * 100
    : null;
  const roomNightDelta = comparison && comparison.roomNightsSold !== 0
    ? ((analysis.current.roomNightsSold - comparison.roomNightsSold) / Math.abs(comparison.roomNightsSold)) * 100
    : null;
  const averageDailySold = analysis.current.daily.length
    ? analysis.current.roomNightsSold / analysis.current.daily.length
    : null;

  const kpis = [
    { label: "Occupancy", value: percent(analysis.current.occupancy), detail: comparison ? `${signed(occupancyDelta, 1)} pp vs ${comparisonName}` : comparisonMode === "none" ? "No comparison" : "Insufficient comparison data", delta: occupancyDelta },
    { label: "Room nights sold", value: number(analysis.current.roomNightsSold), detail: comparison ? `${signed(roomNightDelta, 1)}% vs ${comparisonName}` : comparisonMode === "none" ? "No comparison" : "Insufficient comparison data", delta: roomNightDelta },
    { label: "Available room nights", value: number(analysis.current.availableRoomNights), detail: analysis.current.unavailableRoomNights ? `${number(analysis.current.unavailableRoomNights)} noites-quarto indisponíveis` : "Sem indisponibilidades de inventário", delta: null },
    { label: "80%+ occupancy days", value: number(analysis.daysAtOrAbove80), detail: `${analysis.soldOutDays} sold-out day${analysis.soldOutDays === 1 ? "" : "s"}`, delta: null },
    { label: "Average rooms sold / day", value: number(averageDailySold, 1), detail: `${analysis.current.daily.length} covered stay dates`, delta: null },
  ];

  return <>
    <div className="page-heading occupancy-heading">
      <div><p className="eyebrow">Demand analysis</p><h1>Occupancy</h1><p>Analyse room-night utilisation and on-the-books demand across the selected stay dates.</p></div>
      <div className="occupancy-header-controls"><DateFilters filters={filters} setFilters={setFilters} /><label className="comparison-control">Compare<select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value as PerformanceComparisonMode)}><option value="previous_year">Previous year</option><option value="previous_period">Previous period</option><option value="none">None</option></select></label></div>
    </div>

    {analysis.comparisonFilters && <div className="performance-comparison-band"><span>Selected period <strong>{filters.startDate} → {filters.endDate}</strong></span><span>Compared with <strong>{analysis.comparisonFilters.startDate} → {analysis.comparisonFilters.endDate}</strong></span><span>Comparison coverage <strong>{percent(analysis.comparisonCoverage?.coverage ?? 0)}</strong></span></div>}

    {cancelledOnly && <div className="occupancy-notice"><strong>Cancelled-only filter</strong><span>Cancelled reservations do not consume sold room nights. Occupancy therefore remains 0%; use Active only or All statuses for operational occupancy analysis.</span></div>}

    {comparisonMode !== "none" && analysis.comparisonCoverage && !analysis.comparisonReliable && <div className="performance-coverage-notice coverage-insufficient"><strong>Comparison data is insufficient</strong><span>Only {percent(analysis.comparisonCoverage.coverage)} of the requested comparison period is covered. Occupancy deltas and comparison lines require at least 80% coverage.</span></div>}

    <section className="occupancy-kpi-grid">{kpis.map((kpi) => <article className="kpi-card" key={kpi.label}><div className="kpi-label">{kpi.label}</div><strong>{kpi.value}</strong><span className={tone(kpi.delta)}>{kpi.detail}</span></article>)}</section>

    <section className="occupancy-main-grid">
      <article className="panel occupancy-demand-panel">
        <div className="panel-heading"><div><h2>Room-night demand trend</h2><p>{analysis.granularity} view · current booking position</p></div></div>
        <div className="occupancy-demand-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={analysis.demandTrend} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} /><YAxis yAxisId="rooms" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} /><YAxis yAxisId="occ" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => name === "Rooms sold" ? [number(Number(value)), name] : [`${Number(value).toFixed(1)}%`, name]} /><Bar yAxisId="rooms" dataKey="roomNightsSold" name="Rooms sold" fill="#cfe3df" radius={[3, 3, 0, 0]} /><Line yAxisId="occ" type="monotone" dataKey={(point) => point.occupancy === null ? null : point.occupancy * 100} name="Occupancy" stroke="#1f6f68" strokeWidth={2.4} dot={false} />{comparisonMode !== "none" && <Line yAxisId="occ" type="monotone" dataKey={(point) => point.comparisonOccupancy === null ? null : point.comparisonOccupancy * 100} name={`${comparisonName} occupancy`} stroke="#7a8793" strokeWidth={1.7} strokeDasharray="5 4" dot={false} connectNulls={false} />}</ComposedChart></ResponsiveContainer></div>
      </article>

      <article className="panel occupancy-weekday-panel">
        <div className="panel-heading"><div><h2>Weekday pattern</h2><p>Occupancy by stay-night weekday</p></div></div>
        <div className="occupancy-weekday-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={analysis.weekdays} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="weekday" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#6b7280", fontSize: 9 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Occupancy"]} /><Bar dataKey={(point) => point.occupancy === null ? 0 : point.occupancy * 100} name="Occupancy" fill="#7eaaa4" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </article>
    </section>

    <article className="panel occupancy-room-type-panel">
      <div className="panel-heading"><div><h2>Occupancy by room type</h2><p>Exact room-night utilisation using each room type's sellable inventory after closures.</p></div></div>
      <div className="occupancy-room-table"><table><thead><tr><th>Room type</th><th>Occupancy</th><th>Sold</th><th>Available</th><th>{comparisonMode === "none" ? "Comparison" : `${comparisonName} occupancy`}</th><th>Occ. Δ</th></tr></thead><tbody>{analysis.roomTypes.map((row) => {
        const delta = row.comparisonOccupancy !== null && row.occupancy !== null ? (row.occupancy - row.comparisonOccupancy) * 100 : null;
        return <tr key={row.roomType}><td><strong>{row.roomType}</strong></td><td><strong>{percent(row.occupancy)}</strong></td><td>{number(row.roomNightsSold)}</td><td>{number(row.availableRoomNights)}</td><td>{row.comparisonOccupancy === null ? "—" : percent(row.comparisonOccupancy)}</td><td className={tone(delta)}>{delta === null ? "—" : `${signed(delta, 1)} pp`}</td></tr>;
      })}</tbody></table></div>
    </article>

    <section className="occupancy-demand-dates-grid">
      <article className="panel"><div className="panel-heading"><div><h2>Highest-demand dates</h2><p>Top OTB occupancy in the selected period</p></div></div><div className="occupancy-date-list">{analysis.highestDates.map((day) => <div key={day.date}><span>{format(parseIsoDate(day.date), "EEE, dd MMM yyyy")}</span><strong>{percent(day.occupancy)}</strong><small>{day.roomNightsSold}/{day.availableRoomNights} rooms</small></div>)}</div></article>
      <article className="panel"><div className="panel-heading"><div><h2>Lowest-demand dates</h2><p>Lowest OTB occupancy in the selected period</p></div></div><div className="occupancy-date-list">{analysis.lowestDates.map((day) => <div key={day.date}><span>{format(parseIsoDate(day.date), "EEE, dd MMM yyyy")}</span><strong>{percent(day.occupancy)}</strong><small>{day.roomNightsSold}/{day.availableRoomNights} rooms</small></div>)}</div></article>
    </section>

    <article className="panel occupancy-calendar-panel">
      <div className="panel-heading"><div><h2>Daily occupancy calendar</h2><p>On-the-books occupancy using sellable inventory for each covered stay date. A dot marks dates with unavailable rooms.</p></div><div className="occupancy-calendar-legend"><span className="occ-low">&lt;50%</span><span className="occ-medium">50–79%</span><span className="occ-high">80–99%</span><span className="occ-full">100%</span><span className="occ-closure-legend"><i />Indisponibilidade</span></div></div>
      <Calendar daily={analysis.current.daily} />
    </article>
  </>;
}
