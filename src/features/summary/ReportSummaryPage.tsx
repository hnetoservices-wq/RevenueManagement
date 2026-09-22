import { useEffect, useMemo, useState } from "react";
import type { DashboardFilters, ImportSnapshotSummary, IsoDate, Property, Reservation } from "../../domain/models";
import { calculateReportSummary, occupancyRelativeChange, type ReportSummaryResult } from "./reportSummary";
import "./reportSummary.css";

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

function moneyPrecise(cents: number | null, currency: string) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function number(value: number | null, digits = 0) {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(value);
}

function percent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function signed(value: number | null, digits = 1, suffix = "") {
  if (value === null) return "—";
  const formatted = new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.abs(value));
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatted}${suffix}`;
}

function signedMoney(cents: number | null, currency: string) {
  if (cents === null) return "—";
  const formatted = moneyPrecise(Math.abs(cents), currency);
  return `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${formatted}`;
}

function tone(value: number | null) {
  return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (filters: DashboardFilters) => void }) {
  return <div className="filters"><label>From<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>To<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label><label>Revenue<select value={filters.revenueBasis} onChange={(event) => setFilters({ ...filters, revenueBasis: event.target.value as DashboardFilters["revenueBasis"] })}><option value="inclusive">Incl. tax</option><option value="exclusive">Excl. tax</option></select></label></div>;
}

const CATEGORY_LABELS = {
  new: "New bookings",
  cancelled: "Cancellations",
  modified: "Modifications",
  removed: "Removed from report",
} as const;

export function ReportSummaryPage({ imports, property, filters, setFilters, loadSnapshotReservations }: Props) {
  const defaultCurrent = imports[0] ?? null;
  const [currentId, setCurrentId] = useState(defaultCurrent?.id ?? "");
  const currentReport = imports.find((item) => item.id === currentId) ?? defaultCurrent;

  const baselineOptions = useMemo(
    () => currentReport
      ? imports.filter((item) => item.id !== currentReport.id && item.dataAsOf <= currentReport.dataAsOf)
      : [],
    [imports, currentReport],
  );
  const [baselineId, setBaselineId] = useState(baselineOptions[0]?.id ?? "");
  const baseline = imports.find((item) => item.id === baselineId) ?? null;

  const currentOptions = useMemo(
    () => baseline
      ? imports.filter((item) => item.id !== baseline.id && item.dataAsOf >= baseline.dataAsOf)
      : imports,
    [imports, baseline],
  );

  const [result, setResult] = useState<ReportSummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imports.some((item) => item.id === currentId)) setCurrentId(imports[0]?.id ?? "");
  }, [imports, currentId]);

  useEffect(() => {
    if (!baselineOptions.some((item) => item.id === baselineId)) setBaselineId(baselineOptions[0]?.id ?? "");
  }, [baselineOptions, baselineId]);

  useEffect(() => {
    if (baseline && !currentOptions.some((item) => item.id === currentId)) {
      setCurrentId(currentOptions[0]?.id ?? "");
    }
  }, [baseline, currentOptions, currentId]);

  useEffect(() => {
    if (!currentReport || !baseline) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      loadSnapshotReservations(baseline.id),
      loadSnapshotReservations(currentReport.id),
    ]).then(([baselineReservations, currentReservations]) => {
      if (!cancelled) setResult(calculateReportSummary(property, baselineReservations, currentReservations, filters, baseline.dataAsOf));
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [baseline, currentReport, property, filters, loadSnapshotReservations]);

  if (imports.length < 2 || !defaultCurrent) {
    return <>
      <div className="page-heading"><div><p className="eyebrow">Executive comparison</p><h1>Report Summary</h1><p>Compare two imported booking-position reports.</p></div></div>
      <article className="panel report-summary-empty"><h2>A second report is needed</h2><p>Import another report on a later date to unlock the quick report comparison.</p></article>
    </>;
  }

  const headlineOccupancyChange = result
    ? occupancyRelativeChange(result.current.occupancy, result.baseline.occupancy)
    : null;

  const pickupCards = result ? [
    { label: "Occupancy", value: percent(result.current.occupancy), delta: headlineOccupancyChange, detail: `${percent(result.baseline.occupancy)} → ${percent(result.current.occupancy)}`, format: (value: number | null) => signed(value, 1, "%") },
    { label: "ADR", value: money(result.current.adrCents, property.currency), delta: result.pickup.adrCents, detail: `${money(result.baseline.adrCents, property.currency)} → ${money(result.current.adrCents, property.currency)}`, format: (value: number | null) => signedMoney(value, property.currency) },
    { label: "Room revenue", value: money(result.current.roomRevenueCents, property.currency), delta: result.pickup.roomRevenueCents, detail: `${money(result.baseline.roomRevenueCents, property.currency)} → ${money(result.current.roomRevenueCents, property.currency)}`, format: (value: number | null) => signedMoney(value, property.currency) },
    { label: "Room nights", value: number(result.current.roomNightsSold), delta: result.pickup.roomNightsSold, detail: `${number(result.baseline.roomNightsSold)} → ${number(result.current.roomNightsSold)}`, format: (value: number | null) => signed(value, 0) },
  ] : [];

  return <>
    <div className="page-heading report-summary-heading">
      <div><p className="eyebrow">Executive comparison</p><h1>Report Summary</h1><p>See exactly what changed between two selected booking-position reports.</p></div>
      <DateFilters filters={filters} setFilters={setFilters} />
    </div>

    <article className="panel report-summary-selector">
      <div className="report-summary-snapshot"><span>Compare from</span><select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}>{baselineOptions.map((item) => <option key={item.id} value={item.id}>{item.dataAsOf} · {item.filename}</option>)}</select></div>
      <div className="report-summary-arrow">→</div>
      <div className="report-summary-latest"><span>Most recent report</span><select value={currentId} onChange={(event) => setCurrentId(event.target.value)}>{currentOptions.map((item) => <option key={item.id} value={item.id}>{item.dataAsOf} · {item.filename}</option>)}</select><small>Defaults to the latest imported report. Reports older than Compare From are unavailable.</small></div>
    </article>

    {error && <div className="alert"><span>{error}</span></div>}
    {loading && <div className="report-summary-loading">Calculating report changes…</div>}

    {result && <>
      <section className="report-summary-kpis">{pickupCards.map((card) => <article className="kpi-card" key={card.label}><div className="kpi-label">{card.label}</div><strong>{card.value}</strong><span className={tone(card.delta)}>{card.format(card.delta)}</span><small>{card.detail}</small></article>)}</section>

      <section className="report-summary-change-grid">
        {result.decomposition.categories.map((category) => <article className={`report-change-card change-${category.type}`} key={category.type}><span>{CATEGORY_LABELS[category.type]}</span><strong>{category.reservations}</strong><small><b className={tone(category.roomNightsDelta)}>{signed(category.roomNightsDelta, 0)} RN</b><b className={tone(category.roomRevenueCentsDelta)}>{signedMoney(category.roomRevenueCentsDelta, property.currency)}</b></small></article>)}
        <article className="report-change-card change-net"><span>Net pickup</span><strong className={tone(result.decomposition.net.roomRevenueCentsDelta)}>{signedMoney(result.decomposition.net.roomRevenueCentsDelta, property.currency)}</strong><small>{signed(result.decomposition.net.roomNightsDelta, 0)} room nights</small></article>
      </section>

      <article className="panel report-monthly-panel">
        <div className="panel-heading"><div><h2>Monthly report comparison</h2><p>Selected report position with change since the baseline report.</p></div></div>
        <div className="report-summary-table"><table><thead><tr><th>Month</th><th>Occupancy</th><th>Occ. Δ</th><th>ADR</th><th>ADR Δ</th><th>Room revenue</th><th>Revenue Δ</th><th>Observation</th></tr></thead><tbody>{result.months.map((row) => <tr key={row.key}><td><strong>{row.label}</strong></td><td>{percent(row.current.occupancy)}</td><td className={tone(row.occupancyDeltaPercent)}>{row.occupancyDeltaPercent === null ? "—" : signed(row.occupancyDeltaPercent, 1, "%")}</td><td>{moneyPrecise(row.current.adrCents, property.currency)}</td><td className={tone(row.adrDeltaCents)}>{signedMoney(row.adrDeltaCents, property.currency)}</td><td>{moneyPrecise(row.current.roomRevenueCents, property.currency)}</td><td className={tone(row.roomRevenueDeltaCents)}>{signedMoney(row.roomRevenueDeltaCents, property.currency)}</td><td><span className={`report-observation ${row.observation === "Closed" ? "closed" : ""}`}>{row.observation}</span></td></tr>)}</tbody></table></div>
      </article>

      <article className="panel report-channel-panel">
        <div className="panel-heading"><div><h2>Channel position</h2><p>Selected report contribution and movement since the baseline report.</p></div></div>
        <div className="report-summary-table"><table><thead><tr><th>Channel</th><th>Occupancy contribution</th><th>Room revenue</th><th>Revenue Δ</th><th>ADR</th><th>ADR Δ</th><th>Reservations</th><th>Room nights</th></tr></thead><tbody>{result.channels.map((row) => <tr key={row.channel}><td><strong>{row.channel}</strong></td><td>{percent(row.occupancyContribution)}</td><td>{moneyPrecise(row.roomRevenueCents, property.currency)}</td><td className={tone(row.roomRevenueDeltaCents)}>{signedMoney(row.roomRevenueDeltaCents, property.currency)}</td><td>{moneyPrecise(row.adrCents, property.currency)}</td><td className={tone(row.adrDeltaCents)}>{signedMoney(row.adrDeltaCents, property.currency)}</td><td>{number(row.reservations)}</td><td>{number(row.roomNightsSold)}</td></tr>)}</tbody></table></div>
      </article>
    </>}
  </>;
}
