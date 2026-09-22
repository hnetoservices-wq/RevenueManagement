import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IsoDate, Property, Reservation } from "../../domain/models";
import {
  calculateBookingActivity,
  defaultBookingRange,
  type BookingComparisonMode,
  type BookingDateRange,
} from "./bookingActivity";
import "./booking.css";

interface Props {
  property: Property;
  reservations: Reservation[];
  coverageReservations?: Reservation[];
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

function relativeDelta(current: number | null, comparison: number | null) {
  if (current === null || comparison === null || comparison === 0) return null;
  return ((current - comparison) / Math.abs(comparison)) * 100;
}

function signed(value: number | null, digits = 1) {
  if (value === null) return "—";
  const formatted = number(Math.abs(value), digits);
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}

function tone(value: number | null) {
  return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function BookingFilters({ range, setRange }: { range: BookingDateRange; setRange: (range: BookingDateRange) => void }) {
  return <div className="filters booking-date-filters">
    <label>Booked from<input type="date" value={range.startDate} onChange={(event) => setRange({ ...range, startDate: event.target.value as IsoDate })} /></label>
    <label>Booked to<input type="date" value={range.endDate} onChange={(event) => setRange({ ...range, endDate: event.target.value as IsoDate })} /></label>
    <label>Revenue<select value={range.revenueBasis} onChange={(event) => setRange({ ...range, revenueBasis: event.target.value as BookingDateRange["revenueBasis"] })}><option value="inclusive">Incl. tax</option><option value="exclusive">Excl. tax</option></select></label>
  </div>;
}

export function BookingActivityPage({ property, reservations, coverageReservations = reservations }: Props) {
  const [range, setRange] = useState<BookingDateRange>(() => defaultBookingRange(coverageReservations));
  const [comparisonMode, setComparisonMode] = useState<BookingComparisonMode>("previous_year");
  const analysis = useMemo(
    () => calculateBookingActivity(property, reservations, range, comparisonMode, coverageReservations),
    [property, reservations, range, comparisonMode, coverageReservations],
  );

  const comparisonName = comparisonMode === "previous_year" ? "PY" : comparisonMode === "previous_period" ? "Prev. period" : "Comparison";
  const comparison = analysis.comparisonReliable ? analysis.comparison : null;
  const metrics = analysis.metrics;
  const cancelledOnly = reservations.length > 0 && reservations.every((reservation) => reservation.status === "cancelled");
  const includesCancelled = metrics.cancelledReservations > 0;

  const kpis = [
    { label: "Bookings created", value: number(metrics.reservations), delta: comparison ? relativeDelta(metrics.reservations, comparison.reservations) : null },
    { label: "Room nights booked", value: number(metrics.roomNightsBooked), delta: comparison ? relativeDelta(metrics.roomNightsBooked, comparison.roomNightsBooked) : null },
    { label: "Room revenue booked", value: money(metrics.roomRevenueCents, property.currency), delta: comparison ? relativeDelta(metrics.roomRevenueCents, comparison.roomRevenueCents) : null },
    { label: "Booked ADR", value: money(metrics.adrCents, property.currency), delta: comparison ? relativeDelta(metrics.adrCents, comparison.adrCents) : null },
    { label: "Average LOS", value: metrics.averageLos === null ? "—" : `${number(metrics.averageLos, 1)} nights`, delta: comparison ? (metrics.averageLos === null || comparison.averageLos === null ? null : metrics.averageLos - comparison.averageLos) : null, absolute: true },
    { label: "Average lead time", value: metrics.averageLeadTime === null ? "—" : `${number(metrics.averageLeadTime, 1)} days`, delta: comparison ? (metrics.averageLeadTime === null || comparison.averageLeadTime === null ? null : metrics.averageLeadTime - comparison.averageLeadTime) : null, absolute: true },
  ];

  return <>
    <div className="page-heading booking-heading">
      <div><p className="eyebrow">Booking-date analysis</p><h1>Booking Activity</h1><p>Reconstruct booking production from reservation booking dates in the latest snapshot.</p></div>
      <div className="booking-header-controls"><BookingFilters range={range} setRange={setRange} /><label className="comparison-control">Compare<select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value as BookingComparisonMode)}><option value="previous_year">Previous year</option><option value="previous_period">Previous period</option><option value="none">None</option></select></label></div>
    </div>

    <div className="booking-method-note"><strong>Reconstructed booking activity</strong><span>Values are attributed to each reservation's current recorded booking date. Later modifications can change the value now associated with the original booking date; this is not a historical snapshot of the reservation at creation.</span></div>

    <div className="booking-coverage-band">
      <span>Requested <strong>{range.startDate} → {range.endDate}</strong></span>
      <span>Observed booking-date coverage <strong>{analysis.currentCoverage.effectiveStartDate ?? "—"} → {analysis.currentCoverage.effectiveEndDate ?? "—"}</strong></span>
      <span>Coverage <strong>{percent(analysis.currentCoverage.coverage)}</strong></span>
      {analysis.missingBookingDateCount > 0 && <span>Missing booking date <strong>{number(analysis.missingBookingDateCount)}</strong></span>}
    </div>

    {analysis.currentCoverage.coverage < 1 && <div className="booking-coverage-notice"><strong>Selected booking period is only partially observed</strong><span>Dates outside the booking-date range present in the latest dataset are treated as unknown, not zero production.</span></div>}
    {comparisonMode !== "none" && analysis.comparisonCoverage && !analysis.comparisonReliable && <div className="performance-coverage-notice coverage-insufficient"><strong>Comparison data is insufficient</strong><span>Only {percent(analysis.comparisonCoverage.coverage)} of the requested comparison booking period is covered. Headline comparison deltas require at least 80% coverage.</span></div>}
    {cancelledOnly && <div className="booking-status-notice"><strong>Cancelled-only filter</strong><span>This view describes bookings that are currently cancelled. Their recorded booking value is historical booking production, not expected realised revenue.</span></div>}
    {!cancelledOnly && includesCancelled && <div className="booking-status-note"><strong>{number(metrics.activeReservations)} active · {number(metrics.cancelledReservations)} cancelled</strong><span>With All statuses selected, booking production includes reservations that were created in the period but are currently cancelled.</span></div>}

    <section className="booking-kpi-grid">
      {kpis.map((kpi) => <article className="kpi-card" key={kpi.label}><div className="kpi-label">{kpi.label}</div><strong>{kpi.value}</strong><span className={tone(kpi.delta)}>{comparison ? (kpi.delta === null ? "No comparable base" : kpi.absolute ? `${signed(kpi.delta, 1)} vs ${comparisonName}` : `${signed(kpi.delta, 1)}% vs ${comparisonName}`) : comparisonMode === "none" ? "No comparison" : "Insufficient comparison data"}</span></article>)}
    </section>

    <section className="booking-main-grid">
      <article className="panel booking-production-panel">
        <div className="panel-heading"><div><h2>Booking production</h2><p>{analysis.granularity} view · production by booking date</p></div></div>
        <div className="booking-production-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={analysis.production} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} /><YAxis yAxisId="revenue" tickFormatter={(value) => money(Number(value), property.currency)} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} width={68} /><YAxis yAxisId="bookings" orientation="right" allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} width={42} /><Tooltip formatter={(value, name) => name === "Room revenue" ? [money(Number(value), property.currency), name] : [number(Number(value)), name]} /><Legend /><Bar yAxisId="revenue" dataKey="roomRevenueCents" name="Room revenue" fill="#cfe3df" radius={[3, 3, 0, 0]} /><Line yAxisId="bookings" type="monotone" dataKey="reservations" name="Bookings" stroke="#1f6f68" strokeWidth={2.2} dot={false} /></ComposedChart></ResponsiveContainer></div>
      </article>

      <article className="panel booking-summary-panel">
        <div className="panel-heading"><div><h2>Booked-value summary</h2><p>Full current recorded value of bookings created in the selected period</p></div></div>
        <div className="booking-summary-list"><div><span>Room revenue</span><strong>{money(metrics.roomRevenueCents, property.currency)}</strong></div><div><span>Extras</span><strong>{money(metrics.extraRevenueCents, property.currency)}</strong></div><div><span>Tourist tax</span><strong>{money(metrics.touristTaxCents, property.currency)}</strong></div><div><span>Total booked value</span><strong>{money(metrics.totalRevenueCents, property.currency)}</strong></div></div>
      </article>
    </section>

    <article className="panel booking-stay-month-panel">
      <div className="panel-heading"><div><h2>Where this production is staying</h2><p>Room revenue and room nights booked in the selected booking period, allocated across actual stay months.</p></div></div>
      <div className="booking-stay-month-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={analysis.stayMonths} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={12} /><YAxis yAxisId="revenue" tickFormatter={(value) => money(Number(value), property.currency)} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} width={68} /><YAxis yAxisId="nights" orientation="right" allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} width={42} /><Tooltip formatter={(value, name) => name === "Room revenue" ? [money(Number(value), property.currency), name] : [number(Number(value)), name]} /><Legend /><Bar yAxisId="revenue" dataKey="roomRevenueCents" name="Room revenue" fill="#d8e8e4" radius={[3, 3, 0, 0]} /><Line yAxisId="nights" type="monotone" dataKey="roomNightsBooked" name="Room nights" stroke="#1f6f68" strokeWidth={2.2} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer></div>
    </article>

    <section className="booking-tables-grid">
      <article className="panel booking-channel-panel">
        <div className="panel-heading"><div><h2>Bookings by channel</h2><p>Full booking value grouped by source channel.</p></div></div>
        <div className="booking-table-wrap"><table><thead><tr><th>Channel</th><th>Bookings</th><th>Room nights</th><th>Room revenue</th><th>Share</th><th>ADR</th></tr></thead><tbody>{analysis.channels.map((row) => <tr key={row.channel}><td><strong>{row.channel}</strong></td><td>{number(row.reservations)}</td><td>{number(row.roomNightsBooked)}</td><td>{money(row.roomRevenueCents, property.currency)}</td><td>{percent(row.share)}</td><td>{money(row.adrCents, property.currency)}</td></tr>)}</tbody></table></div>
      </article>

      <article className="panel booking-room-panel">
        <div className="panel-heading"><div><h2>Room-type mix</h2><p>Exact room-night production by booked room type.</p></div></div>
        <div className="booking-table-wrap"><table><thead><tr><th>Room type</th><th>Room nights</th><th>Share</th></tr></thead><tbody>{analysis.roomTypes.map((row) => <tr key={row.roomType}><td><strong>{row.roomType}</strong></td><td>{number(row.roomNightsBooked)}</td><td>{percent(row.share)}</td></tr>)}</tbody></table></div>
      </article>
    </section>
  </>;
}
