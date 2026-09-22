import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CoverageQuality, DashboardFilters, IsoDate, Property, Reservation } from "../../domain/models";
import { calculatePerformanceAnalysis, type PerformanceComparisonMode } from "./performance";
import "./performance.css";

interface Props {
  property: Property;
  reservations: Reservation[];
  coverageReservations?: Reservation[];
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
}

function money(cents: number | null, currency: string) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function number(value: number | null, digits = 0) {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(value);
}

function percent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function tone(value: number | null) {
  return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function qualityClass(quality: CoverageQuality | undefined) {
  return quality ? `coverage-${quality}` : "coverage-insufficient";
}

function signed(value: number | null, digits = 1) {
  if (value === null) return "—";
  const formatted = new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}

function rateDelta(current: number | null, comparison: number | null) {
  if (current === null || comparison === null) return { text: "No comparison", value: null };
  const points = (current - comparison) * 100;
  return { text: `${signed(points, 1)} pp`, value: points };
}

function relativeDelta(current: number | null, comparison: number | null) {
  if (current === null || comparison === null || comparison === 0) return { text: "No comparable base", value: null };
  const value = ((current - comparison) / Math.abs(comparison)) * 100;
  return { text: `${signed(value, 1)}%`, value };
}

function absoluteDelta(current: number | null, comparison: number | null, unit: string) {
  if (current === null || comparison === null) return { text: "No comparison", value: null };
  const value = current - comparison;
  return { text: `${signed(value, 1)} ${unit}`, value };
}

function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (filters: DashboardFilters) => void }) {
  return <div className="filters"><label>From<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>To<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label><label>Revenue<select value={filters.revenueBasis} onChange={(event) => setFilters({ ...filters, revenueBasis: event.target.value as DashboardFilters["revenueBasis"] })}><option value="inclusive">Incl. tax</option><option value="exclusive">Excl. tax</option></select></label></div>;
}

export function PerformancePage({ property, reservations, coverageReservations = reservations, filters, setFilters }: Props) {
  const [comparisonMode, setComparisonMode] = useState<PerformanceComparisonMode>("previous_year");
  const analysis = useMemo(
    () => calculatePerformanceAnalysis(property, reservations, filters, comparisonMode, coverageReservations),
    [property, reservations, coverageReservations, filters, comparisonMode],
  );

  const comparisonName = comparisonMode === "previous_year" ? "PY" : comparisonMode === "previous_period" ? "Prev. period" : "Comparison";
  const current = analysis.current;
  const comparison = analysis.comparisonReliable ? analysis.comparison : null;
  const unavailableDelta = comparisonMode === "none"
    ? { text: "No comparison", value: null }
    : { text: "Insufficient comparison data", value: null };

  const kpis = [
    { label: "Occupancy", value: percent(current.occupancy), delta: comparison ? rateDelta(current.occupancy, comparison.occupancy) : unavailableDelta },
    { label: "ADR", value: money(current.adrCents, property.currency), delta: comparison ? relativeDelta(current.adrCents, comparison.adrCents) : unavailableDelta },
    { label: "RevPAR", value: money(current.revparCents, property.currency), delta: comparison ? relativeDelta(current.revparCents, comparison.revparCents) : unavailableDelta },
    { label: "Room revenue", value: money(current.roomRevenueCents, property.currency), delta: comparison ? relativeDelta(current.roomRevenueCents, comparison.roomRevenueCents) : unavailableDelta },
    { label: "Room nights", value: number(current.roomNightsSold), delta: comparison ? relativeDelta(current.roomNightsSold, comparison.roomNightsSold) : unavailableDelta },
    { label: "Reservations", value: number(current.reservations), delta: comparison ? relativeDelta(current.reservations, comparison.reservations) : unavailableDelta },
    { label: "Average LOS", value: `${number(current.averageLengthOfStay, 1)} nights`, delta: comparison ? absoluteDelta(current.averageLengthOfStay, comparison.averageLengthOfStay, "nights") : unavailableDelta },
    { label: "Average lead time", value: `${number(current.averageLeadTime, 1)} days`, delta: comparison ? absoluteDelta(current.averageLeadTime, comparison.averageLeadTime, "days") : unavailableDelta },
  ];

  return <>
    <div className="page-heading performance-heading">
      <div><p className="eyebrow">Stay-date analysis</p><h1>Performance</h1><p>Analyse occupancy, rate and revenue performance for the latest booking-position snapshot.</p></div>
      <div className="performance-header-controls"><DateFilters filters={filters} setFilters={setFilters} /><label className="comparison-control">Compare<select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value as PerformanceComparisonMode)}><option value="previous_year">Previous year</option><option value="previous_period">Previous period</option><option value="none">None</option></select></label></div>
    </div>

    {analysis.comparisonFilters && <div className="performance-comparison-band"><span>Selected period <strong>{filters.startDate} → {filters.endDate}</strong></span><span>Compared with <strong>{analysis.comparisonFilters.startDate} → {analysis.comparisonFilters.endDate}</strong></span><span>Comparison coverage <strong>{percent(analysis.comparisonCoverage?.coverage ?? 0)}</strong></span></div>}

    {analysis.currentCoverage.coverage < 1 && <div className={`performance-coverage-notice ${qualityClass(analysis.currentCoverage.quality)}`}><strong>Selected-period data is incomplete</strong><span>Available stay data begins at <b>{analysis.dataAvailabilityStartDate ?? "an unknown date"}</b>. Metrics use only the covered part of the selected range ({percent(analysis.currentCoverage.coverage)} coverage).</span></div>}

    {comparisonMode !== "none" && analysis.comparisonCoverage && analysis.comparisonCoverage.coverage < 1 && <div className={`performance-coverage-notice ${qualityClass(analysis.comparisonCoverage.quality)}`}><strong>{analysis.comparisonReliable ? "Comparison period is partially covered" : "Comparison data is insufficient"}</strong><span>Historical stay data is conservatively available from <b>{analysis.dataAvailabilityStartDate ?? "an unknown date"}</b>. Only {percent(analysis.comparisonCoverage.coverage)} of the requested comparison period is covered. Headline deltas require at least {Math.round(analysis.reliableCoverageThreshold * 100)}% coverage; uncovered trend and monthly segments are left blank.</span></div>}

    <section className="performance-kpi-grid">
      {kpis.map((kpi) => <article className="kpi-card" key={kpi.label}><div className="kpi-label">{kpi.label}</div><strong>{kpi.value}</strong><span className={tone(kpi.delta.value)}>{kpi.delta.text}{comparison ? ` vs ${comparisonName}` : ""}</span></article>)}
    </section>

    <section className="performance-chart-grid">
      <article className="panel performance-chart-panel">
        <div className="panel-heading"><div><h2>Occupancy trend</h2><p>{analysis.granularity} view · selected stay dates</p></div></div>
        <div className="performance-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={analysis.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]} /><Line type="monotone" dataKey={(point) => point.currentOccupancy === null ? null : point.currentOccupancy * 100} name="Current occupancy" stroke="#1f6f68" strokeWidth={2.5} dot={false} connectNulls={false} />{comparisonMode !== "none" && <Line type="monotone" dataKey={(point) => point.comparisonOccupancy === null ? null : point.comparisonOccupancy * 100} name={comparisonName} stroke="#7a8793" strokeWidth={1.8} strokeDasharray="5 4" dot={false} connectNulls={false} />}</LineChart></ResponsiveContainer></div>
      </article>

      <article className="panel performance-chart-panel">
        <div className="panel-heading"><div><h2>ADR & RevPAR trend</h2><p>{analysis.granularity} view · room revenue only</p></div></div>
        <div className="performance-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={analysis.trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} /><YAxis tickFormatter={(value) => `€${Math.round(Number(value) / 100)}`} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => [money(Number(value), property.currency), name]} /><Line type="monotone" dataKey={(point) => point.currentAdrCents} name="ADR" stroke="#1f6f68" strokeWidth={2.4} dot={false} connectNulls={false} /><Line type="monotone" dataKey={(point) => point.currentRevparCents} name="RevPAR" stroke="#c08a3e" strokeWidth={2.2} dot={false} connectNulls={false} />{comparisonMode !== "none" && <Line type="monotone" dataKey={(point) => point.comparisonAdrCents} name={`${comparisonName} ADR`} stroke="#6f7f92" strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls={false} />}{comparisonMode !== "none" && <Line type="monotone" dataKey={(point) => point.comparisonRevparCents} name={`${comparisonName} RevPAR`} stroke="#9b8062" strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls={false} />}</LineChart></ResponsiveContainer></div>
      </article>
    </section>

    <article className="panel performance-table-panel">
      <div className="panel-heading"><div><h2>Monthly performance</h2><p>Calendar-month segments within the selected stay period. Comparison deltas require reliable coverage.</p></div></div>
      <div className="performance-table-wrap"><table><thead><tr><th>Month</th><th>Occupancy</th><th>Occ. Δ</th><th>ADR</th><th>ADR Δ</th><th>RevPAR</th><th>RevPAR Δ</th><th>Room nights</th><th>Room revenue</th><th>Revenue Δ</th><th>Comp. coverage</th></tr></thead><tbody>{analysis.monthly.map((row) => {
        const comparable = row.comparisonReliable ? row.comparison : null;
        const occDelta = comparable ? rateDelta(row.current.occupancy, comparable.occupancy) : { text: "—", value: null };
        const adrDelta = comparable ? relativeDelta(row.current.adrCents, comparable.adrCents) : { text: "—", value: null };
        const revparDelta = comparable ? relativeDelta(row.current.revparCents, comparable.revparCents) : { text: "—", value: null };
        const revenueDelta = comparable ? relativeDelta(row.current.roomRevenueCents, comparable.roomRevenueCents) : { text: "—", value: null };
        const currentCovered = row.currentCoverage.coveredDays > 0;
        return <tr key={row.startDate}><td><strong>{row.label}</strong><small>{row.startDate} → {row.endDate}</small></td><td>{currentCovered ? percent(row.current.occupancy) : "—"}</td><td className={tone(occDelta.value)}>{occDelta.text}</td><td>{currentCovered ? money(row.current.adrCents, property.currency) : "—"}</td><td className={tone(adrDelta.value)}>{adrDelta.text}</td><td>{currentCovered ? money(row.current.revparCents, property.currency) : "—"}</td><td className={tone(revparDelta.value)}>{revparDelta.text}</td><td>{currentCovered ? number(row.current.roomNightsSold) : "—"}</td><td>{currentCovered ? money(row.current.roomRevenueCents, property.currency) : "—"}</td><td className={tone(revenueDelta.value)}>{revenueDelta.text}</td><td className={qualityClass(row.comparisonCoverage?.quality)}>{row.comparisonCoverage ? percent(row.comparisonCoverage.coverage) : "—"}</td></tr>;
      })}</tbody></table></div>
    </article>
  </>;
}
