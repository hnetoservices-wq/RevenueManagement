import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CoverageQuality, DashboardFilters, DashboardMetrics, IsoDate, Property, Reservation } from "../../domain/models";
import { YearComparisonPicker } from "../comparison/YearComparisonPicker";
import { availableComparisonYears, comparisonFiltersForYear, keepAvailableComparisonYears } from "../comparison/yearComparison";
import { calculateReservationDescriptiveMetrics } from "../filters/descriptiveMetrics";
import type { AnalysisStatusFilter } from "../filters/analysisFilters";
import { calculatePerformanceAnalysis, type PerformanceAnalysis } from "./performance";
import "./performance.css";

interface Props {
  property: Property;
  reservations: Reservation[];
  coverageReservations?: Reservation[];
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
  statusFilter?: AnalysisStatusFilter;
}

interface YearPerformance {
  year: number;
  filters: DashboardFilters;
  analysis: PerformanceAnalysis;
}

interface DeltaValue { text: string; value: number | null }

const COMPARE_COLORS = ["#6f7f92", "#9b8062", "#845d80", "#79905d", "#ba6c57"];

function money(cents: number | null, currency: string) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function number(value: number | null, digits = 0) {
  return value === null ? "—" : new Intl.NumberFormat("pt-PT", { maximumFractionDigits: digits }).format(value);
}

function percent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("pt-PT", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function tone(value: number | null) {
  return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function qualityClass(quality: CoverageQuality | undefined) {
  return quality ? `coverage-${quality}` : "coverage-insufficient";
}

function signed(value: number | null, digits = 1) {
  if (value === null) return "—";
  const formatted = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: digits }).format(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}

function rateDelta(current: number | null, comparison: number | null): DeltaValue {
  if (current === null || comparison === null) return { text: "sem comparação", value: null };
  const points = (current - comparison) * 100;
  return { text: `${signed(points, 1)} pp`, value: points };
}

function relativeDelta(current: number | null, comparison: number | null): DeltaValue {
  if (current === null || comparison === null || comparison === 0) return { text: "sem base comparável", value: null };
  const value = ((current - comparison) / Math.abs(comparison)) * 100;
  return { text: `${signed(value, 1)}%`, value };
}

function absoluteDelta(current: number | null, comparison: number | null, unit: string): DeltaValue {
  if (current === null || comparison === null) return { text: "sem comparação", value: null };
  const value = current - comparison;
  return { text: `${signed(value, 1)} ${unit}`, value };
}

function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (filters: DashboardFilters) => void }) {
  return <div className="filters"><label>De<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>Até<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label><label>Receita<select value={filters.revenueBasis} onChange={(event) => setFilters({ ...filters, revenueBasis: event.target.value as DashboardFilters["revenueBasis"] })}><option value="inclusive">Incl. impostos</option><option value="exclusive">Excl. impostos</option></select></label></div>;
}

function comparisonRows<T>(years: YearPerformance[], selector: (item: YearPerformance) => T | null, delta: (value: T | null) => DeltaValue) {
  return years.map((item) => ({ year: item.year, ...delta(selector(item)) }));
}

function reliableMetrics(item: YearPerformance): DashboardMetrics | null {
  return item.analysis.currentCoverage.coverage >= item.analysis.reliableCoverageThreshold ? item.analysis.current : null;
}

export function PerformancePage({ property, reservations, coverageReservations = reservations, filters, setFilters, statusFilter }: Props) {
  const baseYear = Number(filters.startDate.slice(0, 4));
  const [comparisonYears, setComparisonYears] = useState<number[]>([baseYear - 1]);
  const availableYears = useMemo(() => availableComparisonYears(coverageReservations, filters), [coverageReservations, filters]);

  useEffect(() => {
    setComparisonYears((current) => keepAvailableComparisonYears(current, availableYears));
  }, [availableYears]);

  const analysis = useMemo(
    () => calculatePerformanceAnalysis(property, reservations, filters, "none", coverageReservations),
    [property, reservations, coverageReservations, filters],
  );
  const comparisons = useMemo<YearPerformance[]>(() => comparisonYears.map((year) => {
    const comparisonFilters = comparisonFiltersForYear(filters, year);
    return {
      year,
      filters: comparisonFilters,
      analysis: calculatePerformanceAnalysis(property, reservations, comparisonFilters, "none", coverageReservations),
    };
  }), [comparisonYears, filters, property, reservations, coverageReservations]);

  const cancelledMode = statusFilter === "cancelled" || (
    statusFilter === undefined && reservations.length > 0 && reservations.every((reservation) => reservation.status === "cancelled")
  );
  const currentCancelled = useMemo(
    () => cancelledMode ? calculateReservationDescriptiveMetrics(reservations, filters) : null,
    [cancelledMode, reservations, filters],
  );
  const cancelledComparisons = useMemo(() => new Map(comparisons.map((item) => [
    item.year,
    item.analysis.currentCoverage.coverage >= item.analysis.reliableCoverageThreshold
      ? calculateReservationDescriptiveMetrics(reservations, item.filters)
      : null,
  ])), [cancelledMode, comparisons, reservations]);

  const current = analysis.current;
  const reservationsValue = cancelledMode ? currentCancelled?.reservations ?? 0 : current.reservations;
  const averageLosValue = cancelledMode ? currentCancelled?.averageLengthOfStay ?? null : current.averageLengthOfStay;
  const averageLeadValue = cancelledMode ? currentCancelled?.averageLeadTime ?? null : current.averageLeadTime;

  const metric = (item: YearPerformance, selector: (m: DashboardMetrics) => number | null) => {
    const metrics = reliableMetrics(item);
    return metrics ? selector(metrics) : null;
  };
  const cancelledMetric = (item: YearPerformance, selector: (m: NonNullable<typeof currentCancelled>) => number | null) => {
    const metrics = cancelledComparisons.get(item.year);
    return metrics ? selector(metrics) : null;
  };

  const kpis = [
    { label: "Ocupação", value: percent(current.occupancy), comparisons: comparisonRows(comparisons, (item) => metric(item, (m) => m.occupancy), (v) => rateDelta(current.occupancy, v as number | null)) },
    { label: "Tarifa média diária", value: money(current.adrCents, property.currency), comparisons: comparisonRows(comparisons, (item) => metric(item, (m) => m.adrCents), (v) => relativeDelta(current.adrCents, v as number | null)) },
    { label: "Receita por quarto disponível", value: money(current.revparCents, property.currency), comparisons: comparisonRows(comparisons, (item) => metric(item, (m) => m.revparCents), (v) => relativeDelta(current.revparCents, v as number | null)) },
    { label: "Receita de quartos", value: money(current.roomRevenueCents, property.currency), comparisons: comparisonRows(comparisons, (item) => metric(item, (m) => m.roomRevenueCents), (v) => relativeDelta(current.roomRevenueCents, v as number | null)) },
    { label: "Noites-quarto", value: number(current.roomNightsSold), comparisons: comparisonRows(comparisons, (item) => metric(item, (m) => m.roomNightsSold), (v) => relativeDelta(current.roomNightsSold, v as number | null)) },
    { label: "Reservas", value: number(reservationsValue), comparisons: comparisonRows(comparisons, (item) => cancelledMode ? cancelledMetric(item, (m) => m.reservations) : metric(item, (m) => m.reservations), (v) => relativeDelta(reservationsValue, v as number | null)) },
    { label: "Estadia média", value: `${number(averageLosValue, 1)} noites`, comparisons: comparisonRows(comparisons, (item) => cancelledMode ? cancelledMetric(item, (m) => m.averageLengthOfStay) : metric(item, (m) => m.averageLengthOfStay), (v) => absoluteDelta(averageLosValue, v as number | null, "noites")) },
    { label: "Antecedência média", value: `${number(averageLeadValue, 1)} dias`, comparisons: comparisonRows(comparisons, (item) => cancelledMode ? cancelledMetric(item, (m) => m.averageLeadTime) : metric(item, (m) => m.averageLeadTime), (v) => absoluteDelta(averageLeadValue, v as number | null, "dias")) },
  ];

  const occupancyTrend = useMemo(() => analysis.trend.map((point, index) => {
    const row: Record<string, string | number | null> = { label: point.label, current: point.currentOccupancy === null ? null : point.currentOccupancy * 100 };
    for (const item of comparisons) {
      const value = item.analysis.trend[index]?.currentOccupancy ?? null;
      row[`year_${item.year}`] = value === null ? null : value * 100;
    }
    return row;
  }), [analysis.trend, comparisons]);

  const rateTrend = useMemo(() => analysis.trend.map((point, index) => {
    const row: Record<string, string | number | null> = { label: point.label, adr: point.currentAdrCents, revpar: point.currentRevparCents };
    for (const item of comparisons) {
      const other = item.analysis.trend[index];
      row[`adr_${item.year}`] = other?.currentAdrCents ?? null;
      row[`revpar_${item.year}`] = other?.currentRevparCents ?? null;
    }
    return row;
  }), [analysis.trend, comparisons]);

  return <>
    <div className="page-heading performance-heading">
      <div><p className="eyebrow">Análise por data de estadia</p><h1>Desempenho</h1><p>Analise ocupação, tarifa e receita e compare o mesmo período com um ou vários anos.</p></div>
      <div className="performance-header-controls"><DateFilters filters={filters} setFilters={setFilters} /><YearComparisonPicker options={availableYears} selected={comparisonYears} onChange={setComparisonYears} /></div>
    </div>

    {comparisonYears.length > 0 && <div className="performance-comparison-band"><span>Período selecionado <strong>{filters.startDate} → {filters.endDate}</strong></span>{comparisons.map((item) => <span key={item.year}>{item.year} <strong>{item.filters.startDate} → {item.filters.endDate}</strong> · cobertura <strong>{percent(item.analysis.currentCoverage.coverage)}</strong></span>)}</div>}

    {cancelledMode && <div className="performance-coverage-notice coverage-partial"><strong>Análise de reservas canceladas</strong><span>A contagem de reservas, estadia e antecedência descrevem cancelamentos. As reservas canceladas continuam excluídas da ocupação e receita.</span></div>}

    {analysis.currentCoverage.coverage < 1 && <div className={`performance-coverage-notice ${qualityClass(analysis.currentCoverage.quality)}`}><strong>Dados incompletos no período selecionado</strong><span>A cobertura disponível é {percent(analysis.currentCoverage.coverage)}.</span></div>}

    {comparisons.filter((item) => item.analysis.currentCoverage.coverage < item.analysis.reliableCoverageThreshold).map((item) => <div key={item.year} className={`performance-coverage-notice ${qualityClass(item.analysis.currentCoverage.quality)}`}><strong>{item.year}: dados insuficientes para comparação</strong><span>Apenas {percent(item.analysis.currentCoverage.coverage)} do período equivalente está coberto. Os deltas principais exigem pelo menos {Math.round(item.analysis.reliableCoverageThreshold * 100)}%.</span></div>)}

    <section className="performance-kpi-grid">
      {kpis.map((kpi) => <article className="kpi-card" key={kpi.label}><div className="kpi-label">{kpi.label}</div><strong>{kpi.value}</strong>{kpi.comparisons.length ? <div className="multi-year-deltas">{kpi.comparisons.map((row) => <span key={row.year} className={tone(row.value)}>{row.year}: {row.text}</span>)}</div> : <span className="neutral">Sem comparação</span>}</article>)}
    </section>

    <section className="performance-chart-grid">
      <article className="panel performance-chart-panel">
        <div className="panel-heading"><div><h2>Tendência de ocupação</h2><p>{analysis.granularity} · período selecionado{comparisonYears.length ? ` · ${comparisonYears.join(", ")}` : ""}</p></div></div>
        <div className="performance-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={occupancyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]} /><Line type="monotone" dataKey="current" name="Ocupação atual" stroke="#1f6f68" strokeWidth={2.5} dot={false} connectNulls={false} />{comparisons.map((item, index) => <Line key={item.year} type="monotone" dataKey={`year_${item.year}`} name={`Ocupação ${item.year}`} stroke={COMPARE_COLORS[index % COMPARE_COLORS.length]} strokeWidth={1.8} strokeDasharray="5 4" dot={false} connectNulls={false} />)}</LineChart></ResponsiveContainer></div>
      </article>

      <article className="panel performance-chart-panel">
        <div className="panel-heading"><div><h2>Tarifa média diária e receita por quarto disponível</h2><p>{analysis.granularity} · apenas receita de quartos</p></div></div>
        <div className="performance-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rateTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7e9ed" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} /><YAxis tickFormatter={(value) => `€${Math.round(Number(value) / 100)}`} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => [money(Number(value), property.currency), name]} /><Line type="monotone" dataKey="adr" name="Tarifa média diária" stroke="#1f6f68" strokeWidth={2.4} dot={false} connectNulls={false} /><Line type="monotone" dataKey="revpar" name="Receita por quarto disponível" stroke="#c08a3e" strokeWidth={2.2} dot={false} connectNulls={false} />{comparisons.map((item, index) => <Line key={`adr-${item.year}`} type="monotone" dataKey={`adr_${item.year}`} name={`Tarifa média ${item.year}`} stroke={COMPARE_COLORS[index % COMPARE_COLORS.length]} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls={false} />)}</LineChart></ResponsiveContainer></div>
      </article>
    </section>

    <article className="panel performance-table-panel">
      <div className="panel-heading"><div><h2>Desempenho mensal</h2><p>Comparações equivalentes por mês para todos os anos selecionados.</p></div></div>
      <div className="performance-table-wrap"><table><thead><tr><th>Mês</th><th>Ocupação</th><th>Tarifa média diária</th><th>Receita/quarto disponível</th><th>Noites-quarto</th><th>Receita quartos</th>{comparisons.map((item) => <th key={item.year}>Δ {item.year}</th>)}</tr></thead><tbody>{analysis.monthly.map((row, index) => {
        const currentCovered = row.currentCoverage.coveredDays > 0;
        return <tr key={row.startDate}><td><strong>{row.label}</strong><small>{row.startDate} → {row.endDate}</small></td><td>{currentCovered ? percent(row.current.occupancy) : "—"}</td><td>{currentCovered ? money(row.current.adrCents, property.currency) : "—"}</td><td>{currentCovered ? money(row.current.revparCents, property.currency) : "—"}</td><td>{currentCovered ? number(row.current.roomNightsSold) : "—"}</td><td>{currentCovered ? money(row.current.roomRevenueCents, property.currency) : "—"}</td>{comparisons.map((item) => {
          const other = item.analysis.monthly[index];
          const reliable = other && other.currentCoverage.coverage >= item.analysis.reliableCoverageThreshold;
          const occ = reliable ? rateDelta(row.current.occupancy, other.current.occupancy) : { text: "—", value: null };
          const revenue = reliable ? relativeDelta(row.current.roomRevenueCents, other.current.roomRevenueCents) : { text: "—", value: null };
          return <td key={item.year}><span className={tone(occ.value)}>Ocup. {occ.text}</span><br/><span className={tone(revenue.value)}>Receita {revenue.text}</span></td>;
        })}</tr>;
      })}</tbody></table></div>
    </article>
  </>;
}
