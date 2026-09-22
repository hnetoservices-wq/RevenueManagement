import { useEffect, useMemo, useState } from "react";
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
import { calculateMetrics } from "../../domain/analytics";
import type { DashboardFilters, ImportSnapshotSummary, IsoDate, Property, Reservation } from "../../domain/models";
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

function tone(value: number | null) {
  return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (filters: DashboardFilters) => void }) {
  return <div className="filters"><label>From<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>To<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label><label>Revenue<select value={filters.revenueBasis} onChange={(event) => setFilters({ ...filters, revenueBasis: event.target.value as DashboardFilters["revenueBasis"] })}><option value="inclusive">Incl. tax</option><option value="exclusive">Excl. tax</option></select></label></div>;
}

export function PacePickupPage({ imports, property, filters, setFilters, loadSnapshotReservations }: Props) {
  const [points, setPoints] = useState<PacePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderedImports = useMemo(
    () => [...imports].sort((a, b) => a.dataAsOf.localeCompare(b.dataAsOf) || a.importedAt.localeCompare(b.importedAt)),
    [imports],
  );

  useEffect(() => {
    if (!orderedImports.length) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void Promise.all(orderedImports.map(async (snapshot) => {
      const reservations = await loadSnapshotReservations(snapshot.id);
      const metrics = calculateMetrics(property, reservations, filters);
      return { snapshot, metrics };
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
      setPoints(next);
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
          <div className="pace-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis yAxisId="revenue" tickFormatter={(value) => `€${value}`} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis yAxisId="occupancy" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => name === "Occupancy" ? [`${Number(value).toFixed(1)}%`, name] : [`€${Number(value).toFixed(0)}`, name]} /><Legend /><Bar yAxisId="revenue" dataKey="roomRevenue" name="Room revenue" fill="#dbe9e6" radius={[4, 4, 0, 0]} /><Line yAxisId="occupancy" type="monotone" dataKey="occupancy" name="Occupancy" stroke="#1f6f68" strokeWidth={2.5} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer></div>
        </article>

        <article className="panel pace-latest-panel">
          <div className="panel-heading"><div><h2>Latest booking position</h2><p>{latest?.dataAsOf}</p></div></div>
          {latest && <div className="summary-list"><div><span>Occupancy</span><strong>{latest.occupancy.toFixed(1)}%</strong></div><div><span>Room nights</span><strong>{latest.roomNights}</strong></div><div><span>Room revenue</span><strong>{money(latest.roomRevenueCents, property.currency)}</strong></div><div><span>Reservations</span><strong>{latest.reservations}</strong></div><div><span>ADR</span><strong>{money(latest.adr, property.currency)}</strong></div><div><span>RevPAR</span><strong>{money(latest.revpar, property.currency)}</strong></div></div>}
        </article>
      </section>

      <article className="panel pace-table-panel">
        <div className="panel-heading"><div><h2>Snapshot-by-snapshot pickup</h2><p>Each row compares that booking position with the immediately previous imported snapshot.</p></div></div>
        <div className="pace-table-wrap"><table><thead><tr><th>Data as of</th><th>OTB occupancy</th><th>Room nights</th><th>Room revenue</th><th>ADR</th><th>RN pickup</th><th>Occ. pickup</th><th>Revenue pickup</th></tr></thead><tbody>{points.map((point) => <tr key={point.snapshotId}><td><strong>{point.dataAsOf}</strong></td><td>{point.occupancy.toFixed(1)}%</td><td>{point.roomNights}</td><td>{money(point.roomRevenueCents, property.currency)}</td><td>{money(point.adr, property.currency)}</td><td className={tone(point.pickupRoomNights)}>{signedNumber(point.pickupRoomNights)}</td><td className={tone(point.pickupOccupancyPoints)}>{point.pickupOccupancyPoints === null ? "—" : `${signedNumber(point.pickupOccupancyPoints, 1)} pp`}</td><td className={tone(point.pickupRevenueCents)}>{signedMoney(point.pickupRevenueCents, property.currency)}</td></tr>)}</tbody></table></div>
      </article>
    </>}
  </>;
}
