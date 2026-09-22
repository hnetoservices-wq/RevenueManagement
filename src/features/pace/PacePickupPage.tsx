import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { calculateLeadTimePaceComparison, calculateMetrics } from "../../domain/analytics";
import type {
  CoverageQuality,
  DashboardFilters,
  ImportSnapshotSummary,
  IsoDate,
  LeadTimeCurvePoint,
  LeadTimePaceComparisonResult,
  Property,
  Reservation,
  SnapshotReservationSet,
} from "../../domain/models";
import { PickupDecompositionPanel } from "./PickupDecompositionPanel";
import "./pace.css";

interface PacePoint {
  snapshotId: string;
  dataAsOf: IsoDate;
  label: string;
  occupancy: number;
  roomRevenue: number;
  roomRevenueCents: number;
  roomNights: number;
  reservations: number;
  adr: number | null;
  revpar: number | null;
  pickupRoomNights: number | null;
  pickupRevenueCents: number | null;
  pickupOccupancyPoints: number | null;
}

interface Props {
  imports: ImportSnapshotSummary[];
  property: Property;
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
  loadSnapshotReservations: (snapshotId: string) => Promise<Reservation[]>;
}

function money(cents: number | null, currency: string) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function signedMoney(cents: number | null, currency: string) {
  if (cents === null) return "—";
  const formatted = money(Math.abs(cents), currency);
  return cents > 0 ? `+${formatted}` : cents < 0 ? `−${formatted}` : formatted;
}

function signedNumber(value: number | null, digits = 0) {
  if (value === null) return "—";
  const formatted = new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}

function percentage(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function tone(value: number | null) {
  return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function qualityLabel(quality: CoverageQuality) {
  if (quality === "reliable") return "Reliable";
  if (quality === "partial") return "Partial";
  return "Insufficient";
}

function qualityClass(quality: CoverageQuality) {
  return `coverage-${quality}`;
}

function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (filters: DashboardFilters) => void }) {
  return <div className="filters"><label>From<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>To<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label><label>Revenue<select value={filters.revenueBasis} onChange={(event) => setFilters({ ...filters, revenueBasis: event.target.value as DashboardFilters["revenueBasis"] })}><option value="inclusive">Incl. tax</option><option value="exclusive">Excl. tax</option></select></label></div>;
}

export function PacePickupPage({ imports, property, filters, setFilters, loadSnapshotReservations }: Props) {
  const [points, setPoints] = useState<PacePoint[]>([]);
  const [leadCurve, setLeadCurve] = useState<LeadTimeCurvePoint[]>([]);
  const [paceComparison, setPaceComparison] = useState<LeadTimePaceComparisonResult | null>(null);
  const [maxCurveLagDays, setMaxCurveLagDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderedImports = useMemo(
    () => [...imports].sort((a, b) => a.dataAsOf.localeCompare(b.dataAsOf) || a.importedAt.localeCompare(b.importedAt)),
    [imports],
  );

  useEffect(() => {
    if (!orderedImports.length) {
      setPoints([]);
      setLeadCurve([]);
      setPaceComparison(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void Promise.all(orderedImports.map(async (snapshot) => {
      const reservations = await loadSnapshotReservations(snapshot.id);
      const metrics = calculateMetrics(property, reservations, filters);
      return { snapshot, reservations, metrics };
    })).then((rows) => {
      if (cancelled) return;
      const next: PacePoint[] = rows.map(({ snapshot, metrics }, index) => {
        const previous = index > 0 ? rows[index - 1].metrics : null;
        return {
          snapshotId: snapshot.id,
          dataAsOf: snapshot.dataAsOf,
          label: snapshot.dataAsOf.slice(5),
          occupancy: (metrics.occupancy ?? 0) * 100,
          roomRevenue: metrics.roomRevenueCents / 100,
          roomRevenueCents: metrics.roomRevenueCents,
          roomNights: metrics.roomNightsSold,
          reservations: metrics.reservations,
          adr: metrics.adrCents,
          revpar: metrics.revparCents,
          pickupRoomNights: previous ? metrics.roomNightsSold - previous.roomNightsSold : null,
          pickupRevenueCents: previous ? metrics.roomRevenueCents - previous.roomRevenueCents : null,
          pickupOccupancyPoints: previous && metrics.occupancy !== null && previous.occupancy !== null
            ? (metrics.occupancy - previous.occupancy) * 100
            : null,
        };
      });
      const snapshotSets: SnapshotReservationSet[] = rows.map(({ snapshot, reservations }) => ({
        snapshotId: snapshot.id,
        dataAsOf: snapshot.dataAsOf,
        reservations,
      }));
      const comparison = calculateLeadTimePaceComparison(property, snapshotSets, filters);
      setPoints(next);
      setLeadCurve(comparison.current.points);
      setPaceComparison(comparison);
      setMaxCurveLagDays(comparison.current.maxSnapshotLagDays);
    }).catch((cause) => {
      if (!cancelled) setError(`Could not build pace timeline: ${String(cause)}`);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [orderedImports, property, filters, loadSnapshotReservations]);

  const latest = points.at(-1);
  const first = points[0];
  const totalRoomNightsPickup = latest && first ? latest.roomNights - first.roomNights : null;
  const totalRevenuePickup = latest && first ? latest.roomRevenueCents - first.roomRevenueCents : null;
  const totalOccupancyPickup = latest && first ? latest.occupancy - first.occupancy : null;
  const reliableThreshold = paceComparison?.reliableCoverageThreshold ?? 0.8;
  const partialThreshold = paceComparison?.partialCoverageThreshold ?? 0.5;
  const currentYear = filters.startDate.slice(0, 4) === filters.endDate.slice(0, 4) ? filters.startDate.slice(0, 4) : "Current";
  const previousYear = /^\d{4}$/.test(currentYear) ? String(Number(currentYear) - 1) : "Prior year";
  const comparisonPoints = paceComparison?.points ?? [];
  const currentReliablePoints = comparisonPoints.filter((point) => point.currentQuality === "reliable").length;
  const currentPartialPoints = comparisonPoints.filter((point) => point.currentQuality === "partial").length;
  const previousReliablePoints = comparisonPoints.filter((point) => point.previousYearQuality === "reliable").length;
  const previousPartialPoints = comparisonPoints.filter((point) => point.previousYearQuality === "partial").length;

  const leadChartData = comparisonPoints.map((point) => {
    const currentPct = point.current.occupancy === null ? null : point.current.occupancy * 100;
    const previousPct = point.previousYear.occupancy === null ? null : point.previousYear.occupancy * 100;
    return {
      label: point.label,
      currentReliablePct: point.currentQuality === "reliable" ? currentPct : null,
      currentPartialPct: point.currentQuality === "partial" ? currentPct : null,
      previousReliablePct: point.previousYearQuality === "reliable" ? previousPct : null,
      previousPartialPct: point.previousYearQuality === "partial" ? previousPct : null,
    };
  });

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">Historical intelligence</p><h1>Pace & Pickup</h1><p>Track how the selected stay period built across every imported booking-position snapshot.</p></div>
      <DateFilters filters={filters} setFilters={setFilters} />
    </div>

    {imports.length < 2 ? <article className="panel pace-empty"><h2>At least two snapshots are required</h2><p>Import historical Amenitiz reports with different data-as-of dates to build a booking pace curve and measure pickup.</p></article> : loading ? <article className="panel pace-empty"><p>Calculating booking pace across {imports.length} snapshots…</p></article> : error ? <div className="alert"><span>{error}</span></div> : <>
      <section className="pace-summary-grid">
        <article className="kpi-card"><div className="kpi-label">Snapshots</div><strong>{points.length}</strong><span className="neutral">{first?.dataAsOf} → {latest?.dataAsOf}</span></article>
        <article className="kpi-card"><div className="kpi-label">Net room-night pickup</div><strong className={tone(totalRoomNightsPickup)}>{signedNumber(totalRoomNightsPickup)}</strong><span className="neutral">first to latest snapshot</span></article>
        <article className="kpi-card"><div className="kpi-label">Net occupancy pickup</div><strong className={tone(totalOccupancyPickup)}>{totalOccupancyPickup === null ? "—" : `${signedNumber(totalOccupancyPickup, 1)} pp`}</strong><span className="neutral">first to latest snapshot</span></article>
        <article className="kpi-card"><div className="kpi-label">Net room-revenue pickup</div><strong className={tone(totalRevenuePickup)}>{signedMoney(totalRevenuePickup, property.currency)}</strong><span className="neutral">first to latest snapshot</span></article>
      </section>

      <section className="pace-grid">
        <article className="panel pace-chart-panel">
          <div className="panel-heading"><div><h2>Booking position over time</h2><p>OTB occupancy and room revenue for the selected stay dates</p></div></div>
          <div className="pace-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis yAxisId="revenue" tickFormatter={(value) => `€${value}`} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis yAxisId="occupancy" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => name === "Occupancy" ? [`${Number(value).toFixed(1)}%`, name] : [`€${Number(value).toFixed(0)}`, name]} /><Bar yAxisId="revenue" dataKey="roomRevenue" name="Room revenue" fill="#dbe9e6" radius={[4, 4, 0, 0]} /><Line yAxisId="occupancy" type="monotone" dataKey="occupancy" name="Occupancy" stroke="#1f6f68" strokeWidth={2.5} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer></div>
        </article>

        <article className="panel pace-latest-panel">
          <div className="panel-heading"><div><h2>Latest booking position</h2><p>{latest?.dataAsOf}</p></div></div>
          {latest && <div className="summary-list"><div><span>Occupancy</span><strong>{latest.occupancy.toFixed(1)}%</strong></div><div><span>Room nights</span><strong>{latest.roomNights}</strong></div><div><span>Room revenue</span><strong>{money(latest.roomRevenueCents, property.currency)}</strong></div><div><span>Reservations</span><strong>{latest.reservations}</strong></div><div><span>ADR</span><strong>{money(latest.adr, property.currency)}</strong></div><div><span>RevPAR</span><strong>{money(latest.revpar, property.currency)}</strong></div></div>}
        </article>
      </section>

      <article className="panel lead-time-panel">
        <div className="lead-time-heading"><div><p className="eyebrow">Days before arrival</p><h2>Lead-time pace vs same time last year</h2><p>Solid points require at least {Math.round(reliableThreshold * 100)}% stay-date coverage. Dashed points represent {Math.round(partialThreshold * 100)}–{Math.round(reliableThreshold * 100) - 1}% coverage. Lower coverage is not plotted. Snapshots more than {maxCurveLagDays} days old are excluded.</p></div><div className="lead-quality-summary"><div><strong>{currentReliablePoints}/{comparisonPoints.length}</strong><span>{currentYear} reliable</span><small>{currentPartialPoints} partial</small></div><div><strong>{previousReliablePoints}/{comparisonPoints.length}</strong><span>{previousYear} reliable</span><small>{previousPartialPoints} partial</small></div></div></div>

        {comparisonPoints.length ? <>
          <div className="pace-curve-legend"><span><i className="curve-current" />{currentYear}</span><span><i className="curve-previous" />{previousYear}</span><span><i className="curve-partial" />Dashed = partial coverage</span></div>
          <div className="lead-time-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={leadChartData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]} /><Line type="monotone" dataKey="previousReliablePct" name={`${previousYear} reliable`} stroke="#6f7f92" strokeWidth={2.2} dot={{ r: 3 }} connectNulls={false} /><Line type="monotone" dataKey="previousPartialPct" name={`${previousYear} partial`} stroke="#6f7f92" strokeWidth={1.7} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls={false} /><Line type="monotone" dataKey="currentReliablePct" name={`${currentYear} reliable`} stroke="#1f6f68" strokeWidth={2.7} dot={{ r: 3 }} connectNulls={false} /><Line type="monotone" dataKey="currentPartialPct" name={`${currentYear} partial`} stroke="#1f6f68" strokeWidth={1.8} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls={false} /></ComposedChart></ResponsiveContainer></div>

          {previousReliablePoints + previousPartialPoints === 0 && <div className="stly-note">No prior-year historical booking-position coverage is available for this stay period. Import snapshots whose <strong>Data as of</strong> dates fall around the equivalent lead dates in {previousYear} to enable the STLY curve.</div>}

          <div className="pace-table-wrap lead-time-table"><table><thead><tr><th>Lead point</th><th>{currentYear} OTB</th><th>{currentYear} coverage</th><th>{previousYear} OTB</th><th>{previousYear} coverage</th><th>vs STLY</th></tr></thead><tbody>{comparisonPoints.map((point) => <tr key={point.daysBeforeArrival}><td><strong>{point.label}</strong></td><td>{percentage(point.current.occupancy)}</td><td className={qualityClass(point.currentQuality)}>{percentage(point.current.coverage)} <small>({point.current.coveredStayDates}/{point.current.totalStayDates}) · {qualityLabel(point.currentQuality)}</small></td><td>{percentage(point.previousYear.occupancy)}</td><td className={qualityClass(point.previousYearQuality)}>{percentage(point.previousYear.coverage)} <small>({point.previousYear.coveredStayDates}/{point.previousYear.totalStayDates}) · {qualityLabel(point.previousYearQuality)}</small></td><td className={tone(point.occupancyPercentagePointChange)}>{point.occupancyPercentagePointChange === null ? "—" : `${signedNumber(point.occupancyPercentagePointChange, 1)} pp`}</td></tr>)}</tbody></table></div>

          <div className="lead-diagnostic-heading"><strong>{currentYear} diagnostic detail</strong><span>Raw values remain visible even when coverage is too low to plot.</span></div>
          <div className="pace-table-wrap lead-time-table lead-diagnostic-table"><table><thead><tr><th>Lead point</th><th>OTB occupancy</th><th>Room nights</th><th>Room revenue</th><th>ADR</th><th>Coverage</th><th>Avg. snapshot lag</th></tr></thead><tbody>{leadCurve.map((point, index) => { const quality = comparisonPoints[index]?.currentQuality ?? "insufficient"; return <tr key={point.daysBeforeArrival}><td><strong>{point.label}</strong></td><td>{percentage(point.occupancy)}</td><td>{point.coveredStayDates ? point.roomNightsSold : "—"}</td><td>{point.coveredStayDates ? money(point.roomRevenueCents, property.currency) : "—"}</td><td>{money(point.adrCents, property.currency)}</td><td className={qualityClass(quality)}>{percentage(point.coverage)} <small>({point.coveredStayDates}/{point.totalStayDates}) · {qualityLabel(quality)}</small></td><td>{point.averageSnapshotLagDays === null ? "—" : `${point.averageSnapshotLagDays.toFixed(1)} days`}</td></tr>; })}</tbody></table></div>
        </> : <div className="lead-time-empty">No lead-time points could be calculated for the selected stay period.</div>}
      </article>

      <PickupDecompositionPanel imports={imports} property={property} filters={filters} loadSnapshotReservations={loadSnapshotReservations} />

      <article className="panel pace-table-panel">
        <div className="panel-heading"><div><h2>Snapshot-by-snapshot pickup</h2><p>Each row compares that booking position with the immediately previous imported snapshot.</p></div></div>
        <div className="pace-table-wrap"><table><thead><tr><th>Data as of</th><th>OTB occupancy</th><th>Room nights</th><th>Room revenue</th><th>ADR</th><th>RN pickup</th><th>Occ. pickup</th><th>Revenue pickup</th></tr></thead><tbody>{points.map((point) => <tr key={point.snapshotId}><td><strong>{point.dataAsOf}</strong></td><td>{point.occupancy.toFixed(1)}%</td><td>{point.roomNights}</td><td>{money(point.roomRevenueCents, property.currency)}</td><td>{money(point.adr, property.currency)}</td><td className={tone(point.pickupRoomNights)}>{signedNumber(point.pickupRoomNights)}</td><td className={tone(point.pickupOccupancyPoints)}>{point.pickupOccupancyPoints === null ? "—" : `${signedNumber(point.pickupOccupancyPoints, 1)} pp`}</td><td className={tone(point.pickupRevenueCents)}>{signedMoney(point.pickupRevenueCents, property.currency)}</td></tr>)}</tbody></table></div>
      </article>
    </>}
  </>;
}
