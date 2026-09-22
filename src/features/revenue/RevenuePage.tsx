import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { parseIsoDate } from "../../domain/dates";
import type { DashboardFilters, IsoDate, Property, Reservation } from "../../domain/models";
import { BookingActivityPage } from "../booking/BookingActivityPage";
import type { PerformanceComparisonMode } from "../performance/performance";
import { calculateRevenueAnalysis } from "./revenue";
import "./revenue.css";

interface Props {
  property: Property;
  reservations: Reservation[];
  coverageReservations?: Reservation[];
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
}

type RevenueView = "stay" | "booking";

const MIX_COLORS = ["#1f6f68", "#c08a3e", "#718096"];

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

function signed(value: number | null, digits = 1) {
  if (value === null) return "—";
  const formatted = number(Math.abs(value), digits);
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}

function tone(value: number | null) {
  return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function relativeDelta(current: number | null, comparison: number | null) {
  if (current === null || comparison === null || comparison === 0) return null;
  return ((current - comparison) / Math.abs(comparison)) * 100;
}

function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (filters: DashboardFilters) => void }) {
  return <div className="filters"><label>From<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>To<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label><label>Revenue<select value={filters.revenueBasis} onChange={(event) => setFilters({ ...filters, revenueBasis: event.target.value as DashboardFilters["revenueBasis"] })}><option value="inclusive">Incl. tax</option><option value="exclusive">Excl. tax</option></select></label></div>;
}

export function RevenuePage({ property, reservations, coverageReservations = reservations, filters, setFilters }: Props) {
  const [view, setView] = useState<RevenueView>("stay");
  const [comparisonMode, setComparisonMode] = useState<PerformanceComparisonMode>("previous_year");
  const analysis = useMemo(
    () => calculateRevenueAnalysis(property, reservations, filters, comparisonMode, coverageReservations),
    [property, reservations, coverageReservations, filters, comparisonMode],
  );

  if (view === "booking") {
    return <>
      <div className="revenue-view-tabs" role="tablist" aria-label="Revenue analysis mode">
        <button type="button" onClick={() => setView("stay")}>Stay-date Revenue</button>
        <button type="button" className="active" onClick={() => setView("booking")}>Booking Activity</button>
      </div>
      <BookingActivityPage property={property} reservations={reservations} coverageReservations={coverageReservations} />
    </>;
  }

  const comparisonName = comparisonMode === "previous_year" ? "PY" : comparisonMode === "previous_period" ? "Prev. period" : "Comparison";
  const comparison = analysis.comparisonReliable ? analysis.comparison : null;
  const cancelledOnly = reservations.length > 0 && reservations.every((reservation) => reservation.status === "cancelled");

  const kpis = [
    { label: "Room revenue", value: money(analysis.current.roomRevenueCents, property.currency), delta: comparison ? relativeDelta(analysis.current.roomRevenueCents, comparison.roomRevenueCents) : null },
    { label: "Total revenue", value: money(analysis.current.totalRevenueCents, property.currency), delta: comparison ? relativeDelta(analysis.current.totalRevenueCents, comparison.totalRevenueCents) : null },
    { label: "ADR", value: money(analysis.current.adrCents, property.currency), delta: comparison ? relativeDelta(analysis.current.adrCents, comparison.adrCents) : null },
    { label: "RevPAR", value: money(analysis.current.revparCents, property.currency), delta: comparison ? relativeDelta(analysis.current.revparCents, comparison.revparCents) : null },
    { label: "Extra revenue", value: money(analysis.current.extraRevenueCents, property.currency), delta: comparison ? relativeDelta(analysis.current.extraRevenueCents, comparison.extraRevenueCents) : null },
    { label: "Tourist tax", value: money(analysis.current.touristTaxCents, property.currency), delta: comparison ? relativeDelta(analysis.current.touristTaxCents, comparison.touristTaxCents) : null },
  ];

  return <>
    <div className="revenue-view-tabs" role="tablist" aria-label="Revenue analysis mode">
      <button type="button" className="active" onClick={() => setView("stay")}>Stay-date Revenue</button>
      <button type="button" onClick={() => setView("booking")}>Booking Activity</button>
    </div>

    <div className="page-heading revenue-heading">
      <div><p className="eyebrow">Commercial analysis</p><h1>Revenue</h1><p>Analyse room revenue, rate, revenue mix, and channel contribution across the selected stay dates.</p></div>
      <div className="revenue-header-controls"><DateFilters filters={filters} setFilters={setFilters} /><label className="comparison-control">Compare<select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value as PerformanceComparisonMode)}><option value="previous_year">Previous year</option><option value="previous_period">Previous period</option><option value="none">None</option></select></label></div>
    </div>

    {analysis.comparisonFilters && <div className="performance-comparison-band"><span>Selected period <strong>{filters.startDate} → {filters.endDate}</strong></span><span>Compared with <strong>{analysis.comparisonFilters.startDate} → {analysis.comparisonFilters.endDate}</strong></span><span>Comparison coverage <strong>{percent(analysis.comparisonCoverage?.coverage ?? 0)}</strong></span></div>}

    {cancelledOnly && <div className="revenue-notice"><strong>Cancelled-only filter</strong><span>Cancelled reservations remain excluded from room revenue, ADR, RevPAR, extras, tourist tax, and total revenue. Use Active only or All statuses for operational revenue analysis.</span></div>}

    {comparisonMode !== "none" && analysis.comparisonCoverage && !analysis.comparisonReliable && <div className="performance-coverage-notice coverage-insufficient"><strong>Comparison data is insufficient</strong><span>Only {percent(analysis.comparisonCoverage.coverage)} of the requested comparison period is covered. Headline revenue deltas require at least 80% coverage; reliable monthly segments may still compare individually.</span></div>}

    <section className="revenue-kpi-grid">
      {kpis.map((kpi) => <article className="kpi-card" key={kpi.label}><div className="kpi-label">{kpi.label}</div><strong>{kpi.value}</strong><span className={tone(kpi.delta)}>{comparison ? (kpi.delta === null ? "No comparable base" : `${signed(kpi.delta, 1)}% vs ${comparisonName}`) : comparisonMode === "none" ? "No comparison" : "Insufficient comparison data"}</span></article>)}
    </section>

    <section className="revenue-main-grid">
      <article className="panel revenue-trend-panel">
        <div className="panel-heading"><div><h2>Revenue & rate trend</h2><p>{analysis.granularity} view · room revenue and ADR</p></div></div>
        <div className="revenue-trend-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={analysis.trend} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} /><YAxis yAxisId="revenue" tickFormatter={(value) => money(Number(value), property.currency)} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} width={68} /><YAxis yAxisId="adr" orientation="right" tickFormatter={(value) => money(Number(value), property.currency)} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} width={55} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => [money(Number(value), property.currency), name]} /><Legend /><Bar yAxisId="revenue" dataKey="roomRevenueCents" name="Room revenue" fill="#cfe3df" radius={[3, 3, 0, 0]} /><Line yAxisId="adr" type="monotone" dataKey="adrCents" name="ADR" stroke="#1f6f68" strokeWidth={2.4} dot={false} connectNulls={false} />{comparisonMode !== "none" && <Line yAxisId="revenue" type="monotone" dataKey="comparisonRoomRevenueCents" name={`${comparisonName} revenue`} stroke="#7a8793" strokeWidth={1.7} strokeDasharray="5 4" dot={false} connectNulls={false} />}{comparisonMode !== "none" && <Line yAxisId="adr" type="monotone" dataKey="comparisonAdrCents" name={`${comparisonName} ADR`} stroke="#9b8062" strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls={false} />}</ComposedChart></ResponsiveContainer></div>
      </article>

      <article className="panel revenue-mix-panel">
        <div className="panel-heading"><div><h2>Revenue mix</h2><p>Composition of selected-period revenue</p></div></div>
        <div className="revenue-mix-content"><div className="revenue-mix-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analysis.mix} dataKey="valueCents" nameKey="label" innerRadius={58} outerRadius={84} paddingAngle={2}>{analysis.mix.map((item, index) => <Cell key={item.label} fill={MIX_COLORS[index % MIX_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value), property.currency)} /></PieChart></ResponsiveContainer></div><div className="revenue-mix-legend">{analysis.mix.map((item, index) => <div key={item.label}><span style={{ background: MIX_COLORS[index % MIX_COLORS.length] }} /><strong>{item.label}</strong><em>{money(item.valueCents, property.currency)}</em><small>{percent(item.share)}</small></div>)}</div></div>
      </article>
    </section>

    <article className="panel revenue-channel-panel">
      <div className="panel-heading"><div><h2>Channel contribution</h2><p>Exact room-revenue contribution from active reservations in the selected period.</p></div></div>
      <div className="revenue-table-wrap"><table><thead><tr><th>Channel</th><th>Room revenue</th><th>Share</th><th>Reservations</th><th>Room nights</th><th>ADR</th></tr></thead><tbody>{analysis.channels.map((row) => <tr key={row.channel}><td><strong>{row.channel}</strong></td><td><strong>{money(row.roomRevenueCents, property.currency)}</strong></td><td>{percent(row.share)}</td><td>{number(row.reservations)}</td><td>{number(row.roomNightsSold)}</td><td>{money(row.adrCents, property.currency)}</td></tr>)}</tbody></table></div>
    </article>

    <section className="revenue-lower-grid">
      <article className="panel revenue-monthly-panel">
        <div className="panel-heading"><div><h2>Monthly revenue</h2><p>Stay-month room revenue, rate, and room nights.</p></div></div>
        <div className="revenue-table-wrap"><table><thead><tr><th>Month</th><th>Room revenue</th><th>Revenue Δ</th><th>ADR</th><th>RevPAR</th><th>Room nights</th><th>Comp. coverage</th></tr></thead><tbody>{analysis.monthly.map((row) => {
          const delta = row.comparisonRoomRevenueCents !== null ? relativeDelta(row.roomRevenueCents, row.comparisonRoomRevenueCents) : null;
          return <tr key={row.label}><td><strong>{row.label}</strong></td><td>{money(row.roomRevenueCents, property.currency)}</td><td className={tone(delta)}>{delta === null ? "—" : `${signed(delta, 1)}%`}</td><td>{money(row.adrCents, property.currency)}</td><td>{money(row.revparCents, property.currency)}</td><td>{number(row.roomNightsSold)}</td><td>{row.comparisonCoverage ? percent(row.comparisonCoverage.coverage) : "—"}</td></tr>;
        })}</tbody></table></div>
      </article>

      <article className="panel revenue-top-dates-panel">
        <div className="panel-heading"><div><h2>Top revenue dates</h2><p>Highest room revenue by stay date</p></div></div>
        <div className="revenue-date-list">{analysis.topDates.map((day) => <div key={day.date}><span>{format(parseIsoDate(day.date), "EEE, dd MMM yyyy")}</span><strong>{money(day.roomRevenueCents, property.currency)}</strong><small>{number(day.roomNightsSold)} rooms · ADR {money(day.adrCents, property.currency)}</small></div>)}</div>
      </article>
    </section>
  </>;
}
