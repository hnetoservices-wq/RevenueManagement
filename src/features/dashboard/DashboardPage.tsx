import { useEffect, useMemo, useState } from "react";
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
import { calculateDashboard, comparison } from "../../domain/analytics";
import type { DashboardFilters, DashboardMetrics, IsoDate, Property, Reservation } from "../../domain/models";
import {
  availableDashboardComparisonYears,
  calculateDashboardYearComparisons,
  type DashboardYearComparison,
} from "./comparison";
import "./dashboard.css";

interface Props {
  property: Property;
  reservations: Reservation[];
  yearSourceReservations: Reservation[];
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
  hasImports: boolean;
  onImport: () => void;
}

interface ChartPoint {
  label: string;
  occupancy: number;
  revenue: number;
  sold: number;
  available: number;
  [key: string]: string | number | null;
}

interface DeltaRow {
  year: number;
  text: string;
  tone: "positive" | "negative" | "neutral";
}

const COLORS = ["#1f6f68", "#d19a4a", "#4d6b94", "#845d80", "#79905d", "#ba6c57"];

function money(cents: number | null, currency = "EUR") {
  if (cents === null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function number(value: number | null, digits = 0) {
  return value === null ? "—" : new Intl.NumberFormat("pt-PT", { maximumFractionDigits: digits }).format(value);
}

function percent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("pt-PT", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function chartData(daily: DashboardMetrics["daily"]): ChartPoint[] {
  if (daily.length <= 70) {
    return daily.map((day) => ({
      label: day.date.slice(5),
      occupancy: (day.occupancy ?? 0) * 100,
      revenue: day.roomRevenueCents / 100,
      sold: day.roomNightsSold,
      available: day.availableRoomNights,
    }));
  }

  const months = new Map<string, ChartPoint>();
  for (const day of daily) {
    const key = day.date.slice(0, 7);
    const point = months.get(key) ?? { label: key.slice(5), occupancy: 0, revenue: 0, sold: 0, available: 0 };
    point.revenue += day.roomRevenueCents / 100;
    point.sold += day.roomNightsSold;
    point.available += day.availableRoomNights;
    months.set(key, point);
  }
  return Array.from(months.values()).map((point) => ({
    ...point,
    occupancy: point.available ? point.sold / point.available * 100 : 0,
  }));
}

function comparisonRows(
  currentValue: number | null,
  comparisons: Array<{ year: number; value: number | null }>,
  rate = false,
): DeltaRow[] {
  return comparisons.map(({ year, value }) => {
    const change = comparison(currentValue, value, rate);
    if (change.absoluteChange === null || value === null) return { year, text: "sem dados comparáveis", tone: "neutral" };
    if (rate) {
      const points = change.absoluteChange * 100;
      return {
        year,
        text: `${points >= 0 ? "+" : ""}${points.toFixed(1)} pp`,
        tone: points > 0 ? "positive" : points < 0 ? "negative" : "neutral",
      };
    }
    if (change.relativeChange === null) return { year, text: "sem base comparável", tone: "neutral" };
    const relative = change.relativeChange * 100;
    return {
      year,
      text: `${relative >= 0 ? "+" : ""}${relative.toFixed(1)}%`,
      tone: relative > 0 ? "positive" : relative < 0 ? "negative" : "neutral",
    };
  });
}

function metricComparisons(
  comparisons: DashboardYearComparison[],
  selector: (metrics: DashboardMetrics) => number | null,
) {
  return comparisons.map((item) => ({ year: item.year, value: selector(item.metrics) }));
}

export function DashboardPage({ property, reservations, yearSourceReservations, filters, setFilters, hasImports, onImport }: Props) {
  const baseYear = Number(filters.startDate.slice(0, 4));
  const [comparisonYears, setComparisonYears] = useState<number[]>([baseYear - 1]);
  const availableYears = useMemo(
    () => availableDashboardComparisonYears(yearSourceReservations, filters),
    [yearSourceReservations, filters],
  );

  useEffect(() => {
    if (!yearSourceReservations.length) return;
    setComparisonYears((current) => current.filter((year) => availableYears.includes(year)));
  }, [availableYears, yearSourceReservations.length]);

  const dashboard = useMemo(
    () => calculateDashboard(property, reservations, filters),
    [property, reservations, filters],
  );
  const comparisons = useMemo(
    () => calculateDashboardYearComparisons(property, reservations, filters, comparisonYears),
    [property, reservations, filters, comparisonYears],
  );

  const performance = useMemo(() => {
    const currentPoints = chartData(dashboard.current.daily);
    const comparisonPoints = comparisons.map((item) => ({ year: item.year, points: chartData(item.metrics.daily) }));
    return currentPoints.map((point, index) => {
      const merged: ChartPoint = { ...point };
      for (const item of comparisonPoints) merged[`revenue_${item.year}`] = item.points[index]?.revenue ?? null;
      return merged;
    });
  }, [dashboard, comparisons]);

  const current = dashboard.current;
  const kpis = [
    {
      label: "Occupancy",
      value: percent(current.occupancy),
      comparisons: comparisonRows(current.occupancy, metricComparisons(comparisons, (m) => m.occupancy), true),
    },
    {
      label: "ADR",
      value: money(current.adrCents, property.currency),
      comparisons: comparisonRows(current.adrCents, metricComparisons(comparisons, (m) => m.adrCents)),
    },
    {
      label: "RevPAR",
      value: money(current.revparCents, property.currency),
      comparisons: comparisonRows(current.revparCents, metricComparisons(comparisons, (m) => m.revparCents)),
    },
    {
      label: "Room revenue",
      value: money(current.roomRevenueCents, property.currency),
      comparisons: comparisonRows(current.roomRevenueCents, metricComparisons(comparisons, (m) => m.roomRevenueCents)),
    },
    {
      label: "Room nights sold",
      value: number(current.roomNightsSold),
      comparisons: comparisonRows(current.roomNightsSold, metricComparisons(comparisons, (m) => m.roomNightsSold)),
    },
    {
      label: "Available room nights",
      value: number(current.availableRoomNights),
      comparisons: comparisonRows(current.availableRoomNights, metricComparisons(comparisons, (m) => m.availableRoomNights)),
      note: current.unavailableRoomNights ? `${number(current.unavailableRoomNights)} noites-quarto indisponíveis` : "Sem indisponibilidades de inventário",
    },
    {
      label: "Reservations",
      value: number(current.reservations),
      comparisons: comparisonRows(current.reservations, metricComparisons(comparisons, (m) => m.reservations)),
    },
    {
      label: "Average lead time",
      value: `${number(current.averageLeadTime, 1)} dias`,
      comparisons: comparisonRows(current.averageLeadTime, metricComparisons(comparisons, (m) => m.averageLeadTime)),
    },
    {
      label: "Average LOS",
      value: `${number(current.averageLengthOfStay, 1)} noites`,
      comparisons: comparisonRows(current.averageLengthOfStay, metricComparisons(comparisons, (m) => m.averageLengthOfStay)),
    },
  ];

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">Revenue overview</p><h1>Dashboard</h1><p>Desempenho por data de estadia com comparação histórica opcional.</p></div>
      <div className="dashboard-heading-controls">
        <DateFilters filters={filters} setFilters={setFilters} />
        <DashboardComparisonPicker options={availableYears} selected={comparisonYears} onChange={setComparisonYears} />
      </div>
    </div>

    {!hasImports ? <EmptyState onImport={onImport} /> : <>
      <section className="kpi-grid">{kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}</section>
      <section className="chart-grid">
        <article className="panel panel-wide">
          <PanelHeading
            title="Revenue and occupancy"
            subtitle={`${performance.length > 70 ? "Vista mensal" : "Vista diária"}${comparisonYears.length ? ` · comparação com ${comparisonYears.join(", ")}` : " · sem comparação"}`}
          />
          <div className="chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={performance} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e7e9ed" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={22} />
            <YAxis yAxisId="revenue" tickFormatter={(value) => `€${value}`} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="occupancy" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb" }} formatter={(value, name) => name === "Occupancy" ? [`${Number(value).toFixed(1)}%`, name] : [`€${Number(value).toFixed(0)}`, name]} />
            <Legend />
            <Bar yAxisId="revenue" dataKey="revenue" name="Room revenue" fill="#cfe3df" radius={[4, 4, 0, 0]} />
            {comparisons.map((item, index) => <Line key={item.year} yAxisId="revenue" type="monotone" dataKey={`revenue_${item.year}`} name={`Receita quartos ${item.year}`} stroke={COLORS[(index + 2) % COLORS.length]} strokeWidth={1.8} strokeDasharray="5 4" dot={false} connectNulls={false} />)}
            <Line yAxisId="occupancy" type="monotone" dataKey="occupancy" name="Occupancy" stroke="#1f6f68" strokeWidth={2.5} dot={false} />
          </ComposedChart></ResponsiveContainer></div>
        </article>

        <article className="panel">
          <PanelHeading title="Revenue by channel" subtitle={`${current.channels.length} active channels`} />
          <div className="channel-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={current.channels} dataKey="roomRevenueCents" nameKey="channel" innerRadius={58} outerRadius={85} paddingAngle={2}>{current.channels.map((entry, index) => <Cell key={entry.channel} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value), property.currency)} /></PieChart></ResponsiveContainer><div className="channel-legend">{current.channels.slice(0, 5).map((channel, index) => <div key={channel.channel}><span style={{ background: COLORS[index % COLORS.length] }} /><strong>{channel.channel}</strong><em>{money(channel.roomRevenueCents, property.currency)}</em></div>)}</div></div>
        </article>

        <article className="panel">
          <PanelHeading title="Operational summary" subtitle="Selected stay dates" />
          <div className="summary-list"><SummaryRow label="Total revenue" value={money(current.totalRevenueCents, property.currency)} /><SummaryRow label="Extra revenue" value={money(current.extraRevenueCents, property.currency)} /><SummaryRow label="Tourist tax" value={money(current.touristTaxCents, property.currency)} /><SummaryRow label="Median lead time" value={`${number(current.medianLeadTime, 1)} dias`} /><SummaryRow label="Median LOS" value={`${number(current.medianLengthOfStay, 1)} noites`} /><SummaryRow label="Cancellation rate" value={percent(current.cancellationRate)} /></div>
        </article>
      </section>
    </>}
  </>;
}

function DashboardComparisonPicker({ options, selected, onChange }: { options: number[]; selected: number[]; onChange: (years: number[]) => void }) {
  function toggle(year: number) {
    onChange(selected.includes(year)
      ? selected.filter((item) => item !== year)
      : [...selected, year].sort((a, b) => b - a));
  }

  return <details className="dashboard-comparison">
    <summary>{selected.length ? `Comparar: ${selected.join(", ")}` : "Comparar anos"}</summary>
    <div className="dashboard-comparison-menu">
      <span>Pode selecionar vários anos</span>
      {options.length ? options.map((year) => <label className="dashboard-comparison-option" key={year}><input type="checkbox" checked={selected.includes(year)} onChange={() => toggle(year)} />{year}</label>) : <div className="dashboard-comparison-empty">Ainda não existem outros anos com dados para comparar.</div>}
      <button type="button" className="dashboard-comparison-clear" onClick={() => onChange([])}>Sem comparação</button>
    </div>
  </details>;
}

function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (value: DashboardFilters) => void }) {
  return <div className="filters"><label>From<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>To<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label><label>Revenue<select value={filters.revenueBasis} onChange={(event) => setFilters({ ...filters, revenueBasis: event.target.value as DashboardFilters["revenueBasis"] })}><option value="inclusive">Incl. tax</option><option value="exclusive">Excl. tax</option></select></label></div>;
}

function KpiCard({ label, value, comparisons, note }: { label: string; value: string; comparisons: DeltaRow[]; note?: string }) {
  return <article className="kpi-card"><div className="kpi-label">{label}</div><strong>{value}</strong>{comparisons.length ? <div className="kpi-comparisons">{comparisons.map((row) => <span key={row.year} className={row.tone}>{row.year}: {row.text}</span>)}</div> : <span className="neutral">Sem comparação</span>}{note && <small className="kpi-note">{note}</small>}</article>;
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
