import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
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
import { calculateDashboard, calculateSnapshotComparison, comparison } from "./domain/analytics";
import { DEFAULT_STATUS_MAPPING } from "./domain/property";
import type {
  DashboardFilters,
  ImportPreview,
  ImportSnapshotSummary,
  IsoDate,
  Property,
  Reservation,
  SnapshotComparisonResult,
} from "./domain/models";
import { createRepository } from "./data/createRepository";
import { DuplicateImportError } from "./data/repository";
import { AnalysisFilterBar } from "./features/filters/AnalysisFilterBar";
import {
  DEFAULT_ANALYSIS_FILTERS,
  applyAnalysisFilters,
  type AnalysisFilters,
} from "./features/filters/analysisFilters";
import { parseAmenitizFile } from "./features/import/amenitiz";
import { OccupancyPage } from "./features/occupancy/OccupancyPage";
import { PacePickupPage } from "./features/pace/PacePickupPage";
import { PerformancePage } from "./features/performance/PerformancePage";
import { RevenuePage } from "./features/revenue/RevenuePage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { ReportSummaryPage } from "./features/summary/ReportSummaryPage";

const repository = createRepository();
const COLORS = ["#1f6f68", "#d19a4a", "#4d6b94", "#845d80", "#79905d", "#ba6c57"];

type Page = "dashboard" | "summary" | "performance" | "occupancy" | "revenue" | "pace" | "imports" | "settings";

interface ChartPoint {
  label: string;
  occupancy: number;
  revenue: number;
  sold: number;
  available: number;
}

function money(cents: number | null, currency = "EUR") {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function signedMoney(cents: number | null, currency = "EUR") {
  if (cents === null) return "—";
  const value = money(Math.abs(cents), currency);
  return cents > 0 ? `+${value}` : cents < 0 ? `−${value}` : value;
}

function number(value: number | null, digits = 0) {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(value);
}

function signedNumber(value: number | null, digits = 0) {
  if (value === null) return "—";
  const formatted = number(Math.abs(value), digits);
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}

function percent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function deltaText(current: number | null, previous: number | null, rate = false) {
  const change = comparison(current, previous, rate);
  if (change.absoluteChange === null || previous === null) return { text: "No prior-year data", tone: "neutral" };
  if (rate) {
    const points = change.absoluteChange * 100;
    return { text: `${points >= 0 ? "+" : ""}${points.toFixed(1)} pp vs PY`, tone: points >= 0 ? "positive" : "negative" };
  }
  if (change.relativeChange === null) return { text: "No comparable base", tone: "neutral" };
  const relative = change.relativeChange * 100;
  return { text: `${relative >= 0 ? "+" : ""}${relative.toFixed(1)}% vs PY`, tone: relative >= 0 ? "positive" : "negative" };
}

function chartData(daily: ReturnType<typeof calculateDashboard>["current"]["daily"]): ChartPoint[] {
  if (daily.length <= 70) {
    return daily.map((day) => ({
      label: day.date.slice(5), occupancy: (day.occupancy ?? 0) * 100,
      revenue: day.roomRevenueCents / 100, sold: day.roomNightsSold, available: day.availableRoomNights,
    }));
  }
  const months = new Map<string, ChartPoint>();
  for (const day of daily) {
    const key = day.date.slice(0, 7);
    const point = months.get(key) ?? { label: key, occupancy: 0, revenue: 0, sold: 0, available: 0 };
    point.revenue += day.roomRevenueCents / 100;
    point.sold += day.roomNightsSold;
    point.available += day.availableRoomNights;
    months.set(key, point);
  }
  return Array.from(months.values()).map((point) => ({ ...point, occupancy: point.available ? point.sold / point.available * 100 : 0 }));
}

function App() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("malmerendas");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [imports, setImports] = useState<ImportSnapshotSummary[]>([]);
  const [page, setPage] = useState<Page>("dashboard");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [analysisFilters, setAnalysisFilters] = useState<AnalysisFilters>(DEFAULT_ANALYSIS_FILTERS);
  const inputRef = useRef<HTMLInputElement>(null);
  const year = new Date().getFullYear();
  const [filters, setFilters] = useState<DashboardFilters>({
    startDate: `${year}-01-01` as IsoDate,
    endDate: `${year}-12-31` as IsoDate,
    revenueBasis: "inclusive",
  });

  const property = properties.find((item) => item.id === propertyId) ?? properties[0];
  const filteredAnalysis = useMemo(
    () => property ? applyAnalysisFilters(property, reservations, analysisFilters) : null,
    [property, reservations, analysisFilters],
  );
  const analyticalProperty = filteredAnalysis?.property ?? property;
  const analyticalReservations = filteredAnalysis?.reservations ?? [];

  const refresh = useCallback(async (selectedPropertyId: string) => {
    const [nextReservations, nextImports] = await Promise.all([
      repository.listCurrentReservations(selectedPropertyId),
      repository.listImports(selectedPropertyId),
    ]);
    setReservations(nextReservations);
    setImports(nextImports);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await repository.initialize();
        const nextProperties = await repository.listProperties();
        setProperties(nextProperties);
        if (nextProperties.length) {
          setPropertyId(nextProperties[0].id);
          await refresh(nextProperties[0].id);
        }
      } catch (cause) {
        setError(`Could not initialise local storage: ${String(cause)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dashboard = useMemo(
    () => analyticalProperty ? calculateDashboard(analyticalProperty, analyticalReservations, filters) : null,
    [analyticalProperty, analyticalReservations, filters],
  );
  const performance = useMemo(() => chartData(dashboard?.current.daily ?? []), [dashboard]);

  const loadFilteredSnapshotReservations = useCallback(async (snapshotId: string) => {
    if (!property) return [];
    const snapshotReservations = await repository.listSnapshotReservations(property.id, snapshotId);
    return applyAnalysisFilters(property, snapshotReservations, analysisFilters).reservations;
  }, [property, analysisFilters]);

  async function prepareImport(bytes: Uint8Array, filename: string) {
    if (!property) return;
    setImporting(true);
    setError(null);
    try {
      setPreview(await parseAmenitizFile(bytes, filename, property, DEFAULT_STATUS_MAPPING));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setImporting(false);
    }
  }

  async function chooseFile() {
    if (!isTauri()) {
      inputRef.current?.click();
      return;
    }
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Amenitiz reservation report", extensions: ["xlsx", "csv"] }],
    });
    if (!path) return;
    const bytes = await readFile(path);
    const filename = path.split(/[\\/]/).pop() ?? "Amenitiz report";
    await prepareImport(bytes, filename);
  }

  async function browserFileSelected(file: File | undefined) {
    if (!file) return;
    await prepareImport(new Uint8Array(await file.arrayBuffer()), file.name);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmImport() {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      await repository.saveImport(preview);
      await refresh(preview.propertyId);
      setPreview(null);
      setToast(`${preview.validRowCount} reservations imported successfully.`);
    } catch (cause) {
      setError(cause instanceof DuplicateImportError ? cause.message : `Import failed: ${String(cause)}`);
    } finally {
      setImporting(false);
    }
  }

  async function changeProperty(nextId: string) {
    setPropertyId(nextId);
    setAnalysisFilters(DEFAULT_ANALYSIS_FILTERS);
    setLoading(true);
    try { await refresh(nextId); } finally { setLoading(false); }
  }

  async function savePropertySetup(nextProperty: Property) {
    await repository.saveProperty(nextProperty);
    const nextProperties = await repository.listProperties();
    setProperties(nextProperties);
    setPropertyId(nextProperty.id);
    setAnalysisFilters(DEFAULT_ANALYSIS_FILTERS);
    await refresh(nextProperty.id);
    setToast(`${nextProperty.name} setup saved.`);
  }

  if (loading || !property || !analyticalProperty || !dashboard) {
    return <div className="loading-screen"><div className="spinner" /><p>Opening your local revenue workspace…</p></div>;
  }

  const current = dashboard.current;
  const previous = dashboard.previousYear;
  const kpis = [
    { label: "Occupancy", value: percent(current.occupancy), delta: deltaText(current.occupancy, previous.occupancy, true) },
    { label: "ADR", value: money(current.adrCents, analyticalProperty.currency), delta: deltaText(current.adrCents, previous.adrCents) },
    { label: "RevPAR", value: money(current.revparCents, analyticalProperty.currency), delta: deltaText(current.revparCents, previous.revparCents) },
    { label: "Room revenue", value: money(current.roomRevenueCents, analyticalProperty.currency), delta: deltaText(current.roomRevenueCents, previous.roomRevenueCents) },
    { label: "Room nights sold", value: number(current.roomNightsSold), delta: deltaText(current.roomNightsSold, previous.roomNightsSold) },
    { label: "Available room nights", value: number(current.availableRoomNights), delta: { text: "Configured inventory", tone: "neutral" } },
    { label: "Reservations", value: number(current.reservations), delta: deltaText(current.reservations, previous.reservations) },
    { label: "Average lead time", value: `${number(current.averageLeadTime, 1)} days`, delta: deltaText(current.averageLeadTime, previous.averageLeadTime) },
    { label: "Average LOS", value: `${number(current.averageLengthOfStay, 1)} nights`, delta: deltaText(current.averageLengthOfStay, previous.averageLengthOfStay) },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">RM</span><div><strong>Revenue</strong><small>Local analytics</small></div></div>
        <nav>
          <NavButton active={page === "dashboard"} onClick={() => setPage("dashboard")} icon="grid" label="Dashboard" />
          <NavButton active={page === "summary"} onClick={() => setPage("summary")} icon="trend" label="Report Summary" />
          <NavButton active={page === "performance"} onClick={() => setPage("performance")} icon="trend" label="Performance" />
          <NavButton active={page === "occupancy"} onClick={() => setPage("occupancy")} icon="bed" label="Occupancy" />
          <NavButton active={page === "revenue"} onClick={() => setPage("revenue")} icon="coin" label="Revenue" />
          <NavButton active={page === "pace"} onClick={() => setPage("pace")} icon="pace" label="Pace & Pickup" />
          <div className="nav-divider" />
          <NavButton active={page === "imports"} onClick={() => setPage("imports")} icon="upload" label="Imports" />
          <NavButton active={page === "settings"} onClick={() => setPage("settings")} icon="settings" label="Settings" />
        </nav>
        <div className="privacy-note"><span className="status-dot" /><div><strong>Local & private</strong><small>No data leaves this computer</small></div></div>
      </aside>

      <main>
        <header className="topbar">
          <div className="property-control"><label>Property</label><select value={propertyId} onChange={(event) => void changeProperty(event.target.value)}>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="topbar-actions">
            {imports[0] && <span className="as-of">Data as of <strong>{imports[0].dataAsOf}</strong></span>}
            <button className="primary-button" onClick={() => void chooseFile()} disabled={importing}>{importing ? "Reading report…" : "+ Import report"}</button>
          </div>
        </header>

        <input ref={inputRef} type="file" accept=".xlsx,.csv" hidden onChange={(event) => void browserFileSelected(event.target.files?.[0])} />

        <div className="workspace">
          {error && <div className="alert"><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div>}
          {page !== "imports" && page !== "settings" && <AnalysisFilterBar property={property} reservations={reservations} filters={analysisFilters} setFilters={setAnalysisFilters} roomTypeRevenueEstimated={filteredAnalysis?.roomTypeRevenueEstimated ?? false} estimatedReservationCount={filteredAnalysis?.estimatedReservationCount ?? 0} />}
          {page === "dashboard" ? (
            <>
              <div className="page-heading"><div><p className="eyebrow">Revenue overview</p><h1>Dashboard</h1><p>Stay-date performance and previous-year comparison.</p></div><DateFilters filters={filters} setFilters={setFilters} /></div>
              {!imports.length ? <EmptyState onImport={() => void chooseFile()} /> : (
                <>
                  <section className="kpi-grid">{kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}</section>
                  <section className="chart-grid">
                    <article className="panel panel-wide">
                      <PanelHeading title="Revenue and occupancy" subtitle={performance.length > 70 ? "Monthly view" : "Daily view"} />
                      <div className="chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={performance} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={22} /><YAxis yAxisId="revenue" tickFormatter={(value) => `€${value}`} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis yAxisId="occupancy" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => name === "Occupancy" ? [`${Number(value).toFixed(1)}%`, name] : [`€${Number(value).toFixed(0)}`, name]} /><Legend /><Bar yAxisId="revenue" dataKey="revenue" name="Room revenue" fill="#cfe3df" radius={[4, 4, 0, 0]} /><Line yAxisId="occupancy" type="monotone" dataKey="occupancy" name="Occupancy" stroke="#1f6f68" strokeWidth={2.5} dot={false} /></ComposedChart></ResponsiveContainer></div>
                    </article>
                    <article className="panel">
                      <PanelHeading title="Revenue by channel" subtitle={`${current.channels.length} active channels`} />
                      <div className="channel-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={current.channels} dataKey="roomRevenueCents" nameKey="channel" innerRadius={58} outerRadius={85} paddingAngle={2}>{current.channels.map((entry, index) => <Cell key={entry.channel} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value), analyticalProperty.currency)} /></PieChart></ResponsiveContainer><div className="channel-legend">{current.channels.slice(0, 5).map((channel, index) => <div key={channel.channel}><span style={{ background: COLORS[index % COLORS.length] }} /><strong>{channel.channel}</strong><em>{money(channel.roomRevenueCents, analyticalProperty.currency)}</em></div>)}</div></div>
                    </article>
                    <article className="panel">
                      <PanelHeading title="Operational summary" subtitle="Selected stay dates" />
                      <div className="summary-list"><SummaryRow label="Total revenue" value={money(current.totalRevenueCents, analyticalProperty.currency)} /><SummaryRow label="Extra revenue" value={money(current.extraRevenueCents, analyticalProperty.currency)} /><SummaryRow label="Tourist tax" value={money(current.touristTaxCents, analyticalProperty.currency)} /><SummaryRow label="Median lead time" value={`${number(current.medianLeadTime, 1)} days`} /><SummaryRow label="Median LOS" value={`${number(current.medianLengthOfStay, 1)} nights`} /><SummaryRow label="Cancellation rate" value={percent(current.cancellationRate)} /></div>
                    </article>
                  </section>
                </>
              )}
            </>
          ) : page === "summary" ? <ReportSummaryPage imports={imports} property={analyticalProperty} filters={filters} setFilters={setFilters} loadSnapshotReservations={loadFilteredSnapshotReservations} /> : page === "performance" ? <PerformancePage property={analyticalProperty} reservations={analyticalReservations} coverageReservations={reservations} filters={filters} setFilters={setFilters} /> : page === "occupancy" ? <OccupancyPage property={analyticalProperty} reservations={analyticalReservations} coverageReservations={reservations} filters={filters} setFilters={setFilters} /> : page === "revenue" ? <RevenuePage property={analyticalProperty} reservations={analyticalReservations} coverageReservations={reservations} filters={filters} setFilters={setFilters} /> : page === "pace" ? <PacePickupPage imports={imports} property={analyticalProperty} filters={filters} setFilters={setFilters} loadSnapshotReservations={loadFilteredSnapshotReservations} /> : page === "settings" ? <SettingsPage property={property} importCount={imports.length} onSave={savePropertySetup} /> : <ImportsPage imports={imports} onImport={() => void chooseFile()} property={property} filters={filters} setFilters={setFilters} />}
        </div>
      </main>

      {preview && <ImportModal preview={preview} setPreview={setPreview} onCancel={() => setPreview(null)} onConfirm={() => void confirmImport()} busy={importing} propertyName={property.name} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function NavButton({ active, disabled, icon, label, onClick }: { active?: boolean; disabled?: boolean; icon: string; label: string; onClick?: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} disabled={disabled} onClick={onClick}><span className={`nav-icon icon-${icon}`} />{label}{disabled && <small>Soon</small>}</button>;
}

function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (value: DashboardFilters) => void }) {
  return <div className="filters"><label>From<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>To<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label><label>Revenue<select value={filters.revenueBasis} onChange={(event) => setFilters({ ...filters, revenueBasis: event.target.value as DashboardFilters["revenueBasis"] })}><option value="inclusive">Incl. tax</option><option value="exclusive">Excl. tax</option></select></label></div>;
}

function KpiCard({ label, value, delta }: { label: string; value: string; delta: { text: string; tone: string } }) {
  return <article className="kpi-card"><div className="kpi-label">{label}</div><strong>{value}</strong><span className={delta.tone}>{delta.text}</span></article>;
}

function PanelHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return <section className="empty-state"><div className="empty-graphic"><span /><span /><span /></div><p className="eyebrow">First snapshot</p><h2>Import your Amenitiz reservation report</h2><p>The report will be validated locally. Guest names and contact details will not be saved.</p><button className="primary-button" onClick={onImport}>Choose XLSX or CSV</button><small>Expected file: Amenitiz reservation report</small></section>;
}

function ImportsPage({ imports, onImport, property, filters, setFilters }: { imports: ImportSnapshotSummary[]; onImport: () => void; property: Property; filters: DashboardFilters; setFilters: (value: DashboardFilters) => void }) {
  return <><div className="page-heading"><div><p className="eyebrow">Data history</p><h1>Imports</h1><p>Every import is preserved as an immutable historical snapshot.</p></div><button className="primary-button" onClick={onImport}>+ Import report</button></div><SnapshotComparisonPanel imports={imports} property={property} filters={filters} setFilters={setFilters} /><article className="panel imports-panel">{imports.length ? <table><thead><tr><th>Data as of</th><th>Filename</th><th>Imported</th><th>Rows</th><th>Valid</th><th>Warnings</th><th>Excluded</th></tr></thead><tbody>{imports.map((item) => <tr key={item.id}><td><strong>{item.dataAsOf}</strong></td><td>{item.filename}</td><td>{format(new Date(item.importedAt), "dd MMM yyyy, HH:mm")}</td><td>{item.rowCount}</td><td className="valid-count">{item.validRowCount}</td><td>{item.warningCount}</td><td className={item.excludedRowCount ? "error-count" : ""}>{item.excludedRowCount}</td></tr>)}</tbody></table> : <div className="table-empty">No snapshots imported yet.</div>}</article></>;
}

function SnapshotComparisonPanel({ imports, property, filters, setFilters }: { imports: ImportSnapshotSummary[]; property: Property; filters: DashboardFilters; setFilters: (value: DashboardFilters) => void }) {
  const [currentId, setCurrentId] = useState(imports[0]?.id ?? "");
  const [baselineId, setBaselineId] = useState(imports[1]?.id ?? "");
  const [result, setResult] = useState<SnapshotComparisonResult | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  useEffect(() => {
    if (!imports.some((item) => item.id === currentId)) setCurrentId(imports[0]?.id ?? "");
    if (!imports.some((item) => item.id === baselineId)) setBaselineId(imports[1]?.id ?? "");
  }, [imports, currentId, baselineId]);

  useEffect(() => {
    if (!currentId || !baselineId || currentId === baselineId) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoadingComparison(true);
    setComparisonError(null);
    void Promise.all([
      repository.listSnapshotReservations(property.id, baselineId),
      repository.listSnapshotReservations(property.id, currentId),
    ]).then(([baselineReservations, currentReservations]) => {
      if (!cancelled) setResult(calculateSnapshotComparison(property, baselineReservations, currentReservations, filters));
    }).catch((cause) => {
      if (!cancelled) setComparisonError(`Could not compare snapshots: ${String(cause)}`);
    }).finally(() => {
      if (!cancelled) setLoadingComparison(false);
    });
    return () => { cancelled = true; };
  }, [baselineId, currentId, filters, property]);

  if (imports.length < 2) {
    return <article className="panel snapshot-empty"><PanelHeading title="Snapshot comparison" subtitle="Pickup becomes available after a second import" /><p>Import another Amenitiz report on a later date to measure how room nights, occupancy and revenue changed between booking positions.</p></article>;
  }

  const currentSnapshot = imports.find((item) => item.id === currentId);
  const baselineSnapshot = imports.find((item) => item.id === baselineId);
  const elapsedDays = currentSnapshot && baselineSnapshot ? differenceInCalendarDays(parseISO(currentSnapshot.dataAsOf), parseISO(baselineSnapshot.dataAsOf)) : null;
  const tone = (value: number | null) => value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
  const cards = result ? [
    { label: "Room nights pickup", value: signedNumber(result.pickup.roomNightsSold), detail: `${number(result.baseline.roomNightsSold)} → ${number(result.current.roomNightsSold)}`, tone: tone(result.pickup.roomNightsSold) },
    { label: "Occupancy pickup", value: result.pickup.occupancyPercentagePoints === null ? "—" : `${signedNumber(result.pickup.occupancyPercentagePoints, 1)} pp`, detail: `${percent(result.baseline.occupancy)} → ${percent(result.current.occupancy)}`, tone: tone(result.pickup.occupancyPercentagePoints) },
    { label: "Room revenue pickup", value: signedMoney(result.pickup.roomRevenueCents, property.currency), detail: `${money(result.baseline.roomRevenueCents, property.currency)} → ${money(result.current.roomRevenueCents, property.currency)}`, tone: tone(result.pickup.roomRevenueCents) },
    { label: "Reservations pickup", value: signedNumber(result.pickup.reservations), detail: `${number(result.baseline.reservations)} → ${number(result.current.reservations)}`, tone: tone(result.pickup.reservations) },
    { label: "ADR change", value: signedMoney(result.pickup.adrCents, property.currency), detail: `${money(result.baseline.adrCents, property.currency)} → ${money(result.current.adrCents, property.currency)}`, tone: tone(result.pickup.adrCents) },
    { label: "RevPAR change", value: signedMoney(result.pickup.revparCents, property.currency), detail: `${money(result.baseline.revparCents, property.currency)} → ${money(result.current.revparCents, property.currency)}`, tone: tone(result.pickup.revparCents) },
  ] : [];

  return <article className="panel snapshot-comparison"><div className="snapshot-header"><div><p className="eyebrow">Historical intelligence</p><h2>Snapshot comparison</h2><p>Measure pickup for the same stay dates between two booking positions.</p></div><DateFilters filters={filters} setFilters={setFilters} /></div><div className="snapshot-selectors"><label>Baseline snapshot<select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}>{imports.map((item) => <option key={item.id} value={item.id}>{item.dataAsOf} · {item.filename}</option>)}</select></label><div className="snapshot-arrow">→</div><label>Later snapshot<select value={currentId} onChange={(event) => setCurrentId(event.target.value)}>{imports.map((item) => <option key={item.id} value={item.id}>{item.dataAsOf} · {item.filename}</option>)}</select></label></div>{currentId === baselineId && <div className="alert"><span>Select two different snapshots.</span></div>}{elapsedDays !== null && currentId !== baselineId && <p className="snapshot-period">Booking position moved from <strong>{baselineSnapshot?.dataAsOf}</strong> to <strong>{currentSnapshot?.dataAsOf}</strong>{elapsedDays >= 0 ? ` · ${elapsedDays} day${elapsedDays === 1 ? "" : "s"} of pickup` : " · snapshots selected in reverse order"}</p>}{comparisonError && <div className="alert"><span>{comparisonError}</span></div>}{loadingComparison ? <div className="snapshot-loading">Calculating snapshot pickup…</div> : result && <section className="snapshot-kpi-grid">{cards.map((card) => <div className="snapshot-kpi" key={card.label}><span>{card.label}</span><strong className={card.tone}>{card.value}</strong><small>{card.detail}</small></div>)}</section>}</article>;
}

function ImportModal({ preview, setPreview, onCancel, onConfirm, busy, propertyName }: { preview: ImportPreview; setPreview: (value: ImportPreview) => void; onCancel: () => void; onConfirm: () => void; busy: boolean; propertyName: string }) {
  const errors = preview.issues.filter((item) => item.severity === "error");
  const warnings = preview.issues.filter((item) => item.severity === "warning");
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onCancel()}><section className="modal"><div className="modal-heading"><div><p className="eyebrow">Amenitiz import</p><h2>Review snapshot</h2><p>{preview.filename}</p></div><button className="close-button" onClick={onCancel} aria-label="Close">×</button></div><div className="import-destination"><span>Importing into</span><strong>{propertyName}</strong></div><label className="date-as-of">Data as of<input type="date" value={preview.dataAsOf} onChange={(event) => setPreview({ ...preview, dataAsOf: event.target.value as IsoDate })} /></label><div className="import-stats"><div><strong>{preview.rowCount}</strong><span>Processed</span></div><div className="valid"><strong>{preview.validRowCount}</strong><span>Valid</span></div><div className="warning"><strong>{warnings.length}</strong><span>Warnings</span></div><div className="invalid"><strong>{preview.excludedRowCount}</strong><span>Excluded</span></div></div>{preview.issues.length ? <div className="issues"><div className="issues-heading"><strong>Validation issues</strong><span>{errors.length} errors · {warnings.length} warnings</span></div><div className="issue-list">{preview.issues.slice(0, 10).map((item, index) => <div key={`${item.row}-${item.code}-${index}`} className={item.severity}><span>Row {item.row}</span><strong>{item.message}</strong></div>)}{preview.issues.length > 10 && <p>Plus {preview.issues.length - 10} more issues. Full issue export will be added in the next import iteration.</p>}</div></div> : <div className="clean-import">No validation issues found.</div>}<p className="privacy-line">Only analytics fields will be stored. Guest names, email addresses, phone numbers, addresses, requests, and comments are discarded.</p><footer><button className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy || preview.validRowCount === 0 || !preview.dataAsOf} onClick={onConfirm}>{busy ? "Saving…" : `Import ${preview.validRowCount} reservations`}</button></footer></section></div>;
}

export default App;