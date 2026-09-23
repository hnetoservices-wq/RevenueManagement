import { useEffect, useMemo, useState } from "react";
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
import { YearComparisonPicker } from "../comparison/YearComparisonPicker";
import { availableComparisonYears, comparisonFiltersForYear, keepAvailableComparisonYears } from "../comparison/yearComparison";
import { calculateOccupancyAnalysis, type OccupancyAnalysis } from "./occupancy";
import "./occupancy.css";

interface Props {
  property: Property;
  reservations: Reservation[];
  coverageReservations?: Reservation[];
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
}

interface YearOccupancy { year: number; filters: DashboardFilters; analysis: OccupancyAnalysis }
const COMPARE_COLORS = ["#6f7f92", "#9b8062", "#845d80", "#79905d", "#ba6c57"];

function number(value: number | null, digits = 0) {
  return value === null ? "—" : new Intl.NumberFormat("pt-PT", { maximumFractionDigits: digits }).format(value);
}
function percent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("pt-PT", { style: "percent", maximumFractionDigits: 1 }).format(value);
}
function signed(value: number | null, digits = 1) {
  if (value === null) return "—";
  const formatted = number(Math.abs(value), digits);
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}
function tone(value: number | null) { return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative"; }
function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (filters: DashboardFilters) => void }) {
  return <div className="filters"><label>De<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>Até<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label></div>;
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
    for (const day of daily) { const key = day.date.slice(0, 7); const rows = grouped.get(key) ?? []; rows.push(day); grouped.set(key, rows); }
    return Array.from(grouped.entries());
  }, [daily]);
  return <div className="occupancy-calendar-grid">{months.map(([month, days]) => {
    const first = days[0]; const leading = getDay(parseIsoDate(first.date));
    return <section className="occupancy-month" key={month}><h3>{format(parseIsoDate(`${month}-01` as IsoDate), "MMMM yyyy")}</h3><div className="occupancy-weekdays">{["D", "S", "T", "Q", "Q", "S", "S"].map((label, index) => <span key={`${month}-${label}-${index}`}>{label}</span>)}</div><div className="occupancy-month-days">{Array.from({ length: leading }).map((_, index) => <span className="occupancy-day empty" key={`empty-${index}`} />)}{days.map((day) => {
      const closureText = day.unavailableRoomNights ? ` · ${day.unavailableRoomNights} indisponível${day.unavailableRoomNights === 1 ? "" : "is"}` : "";
      return <span className={`occupancy-day ${occupancyBand(day.occupancy)} ${day.unavailableRoomNights ? "has-closure" : ""}`} key={day.date} title={`${day.date}: ${percent(day.occupancy)} · ${day.roomNightsSold}/${day.availableRoomNights} noites-quarto${closureText}`}><b>{Number(day.date.slice(8))}</b><small>{day.occupancy === null ? "—" : `${Math.round(day.occupancy * 100)}%`}</small>{day.unavailableRoomNights > 0 && <i className="occupancy-closure-marker" aria-label={`${day.unavailableRoomNights} noites-quarto indisponíveis`} />}</span>;
    })}</div></section>;
  })}</div>;
}

export function OccupancyPage({ property, reservations, coverageReservations = reservations, filters, setFilters }: Props) {
  const baseYear = Number(filters.startDate.slice(0, 4));
  const [comparisonYears, setComparisonYears] = useState<number[]>([baseYear - 1]);
  const availableYears = useMemo(() => availableComparisonYears(coverageReservations, filters), [coverageReservations, filters]);
  useEffect(() => setComparisonYears((current) => keepAvailableComparisonYears(current, availableYears)), [availableYears]);

  const analysis = useMemo(() => calculateOccupancyAnalysis(property, reservations, filters, "none", coverageReservations), [property, reservations, coverageReservations, filters]);
  const comparisons = useMemo<YearOccupancy[]>(() => comparisonYears.map((year) => {
    const shifted = comparisonFiltersForYear(filters, year);
    return { year, filters: shifted, analysis: calculateOccupancyAnalysis(property, reservations, shifted, "none", coverageReservations) };
  }), [comparisonYears, filters, property, reservations, coverageReservations]);

  const cancelledOnly = reservations.length > 0 && reservations.every((reservation) => reservation.status === "cancelled");
  const averageDailySold = analysis.current.daily.length ? analysis.current.roomNightsSold / analysis.current.daily.length : null;
  const reliable = (item: YearOccupancy) => item.analysis.performance.currentCoverage.coverage >= item.analysis.performance.reliableCoverageThreshold;

  const kpis = [
    { label: "Ocupação", value: percent(analysis.current.occupancy), comparisons: comparisons.map((item) => { const other = reliable(item) ? item.analysis.current.occupancy : null; const delta = other !== null && analysis.current.occupancy !== null ? (analysis.current.occupancy - other) * 100 : null; return { year:item.year, text:delta===null?"sem dados comparáveis":`${signed(delta,1)} pp`, delta }; }) },
    { label: "Noites-quarto vendidas", value: number(analysis.current.roomNightsSold), comparisons: comparisons.map((item) => { const other = reliable(item) ? item.analysis.current.roomNightsSold : null; const delta = other ? ((analysis.current.roomNightsSold-other)/Math.abs(other))*100 : null; return { year:item.year, text:delta===null?"sem base comparável":`${signed(delta,1)}%`, delta }; }) },
    { label: "Noites-quarto disponíveis", value: number(analysis.current.availableRoomNights), comparisons: comparisons.map((item) => { const other = reliable(item) ? item.analysis.current.availableRoomNights : null; const delta = other ? ((analysis.current.availableRoomNights-other)/Math.abs(other))*100 : null; return { year:item.year, text:delta===null?"sem base comparável":`${signed(delta,1)}%`, delta }; }), note: analysis.current.unavailableRoomNights ? `${number(analysis.current.unavailableRoomNights)} noites-quarto indisponíveis` : "Sem indisponibilidades de inventário" },
    { label: "Dias com ocupação ≥80%", value: number(analysis.daysAtOrAbove80), comparisons: comparisons.map((item) => { const delta = reliable(item) ? analysis.daysAtOrAbove80-item.analysis.daysAtOrAbove80 : null; return { year:item.year, text:delta===null?"sem dados comparáveis":`${signed(delta,0)} dias`, delta }; }) },
    { label: "Média de quartos vendidos/dia", value: number(averageDailySold, 1), comparisons: comparisons.map((item) => { const other = reliable(item) && item.analysis.current.daily.length ? item.analysis.current.roomNightsSold/item.analysis.current.daily.length : null; const delta = other ? ((averageDailySold!-other)/Math.abs(other))*100 : null; return { year:item.year, text:delta===null?"sem base comparável":`${signed(delta,1)}%`, delta }; }) },
  ];

  const demandTrend = useMemo(() => analysis.demandTrend.map((point,index) => {
    const row: Record<string,string|number|null> = { label:point.label, roomNightsSold:point.roomNightsSold, occupancy:point.occupancy===null?null:point.occupancy*100 };
    for (const item of comparisons) { const other=item.analysis.demandTrend[index]?.occupancy??null; row[`occ_${item.year}`]=other===null?null:other*100; }
    return row;
  }), [analysis.demandTrend, comparisons]);

  return <>
    <div className="page-heading occupancy-heading"><div><p className="eyebrow">Análise da procura</p><h1>Ocupação</h1><p>Analise utilização de inventário e compare o mesmo período com vários anos.</p></div><div className="occupancy-header-controls"><DateFilters filters={filters} setFilters={setFilters} /><YearComparisonPicker options={availableYears} selected={comparisonYears} onChange={setComparisonYears}/></div></div>

    {comparisonYears.length>0&&<div className="performance-comparison-band"><span>Período selecionado <strong>{filters.startDate} → {filters.endDate}</strong></span>{comparisons.map((item)=><span key={item.year}>{item.year} <strong>{item.filters.startDate} → {item.filters.endDate}</strong> · cobertura <strong>{percent(item.analysis.performance.currentCoverage.coverage)}</strong></span>)}</div>}
    {cancelledOnly&&<div className="occupancy-notice"><strong>Filtro apenas canceladas</strong><span>Reservas canceladas não consomem noites-quarto. Use reservas ativas ou todas para análise operacional de ocupação.</span></div>}
    {comparisons.filter((item)=>!reliable(item)).map((item)=><div key={item.year} className="performance-coverage-notice coverage-insufficient"><strong>{item.year}: dados insuficientes</strong><span>A cobertura do período equivalente é {percent(item.analysis.performance.currentCoverage.coverage)}.</span></div>)}

    <section className="occupancy-kpi-grid">{kpis.map((kpi)=><article className="kpi-card" key={kpi.label}><div className="kpi-label">{kpi.label}</div><strong>{kpi.value}</strong>{kpi.comparisons.length?<div className="multi-year-deltas">{kpi.comparisons.map((row)=><span key={row.year} className={tone(row.delta)}>{row.year}: {row.text}</span>)}</div>:<span className="neutral">Sem comparação</span>}{kpi.note&&<small>{kpi.note}</small>}</article>)}</section>

    <section className="occupancy-main-grid">
      <article className="panel occupancy-demand-panel"><div className="panel-heading"><div><h2>Tendência de procura</h2><p>{analysis.granularity} · posição atual{comparisonYears.length?` · ${comparisonYears.join(", ")}`:""}</p></div></div><div className="occupancy-demand-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={demandTrend} margin={{top:8,right:10,left:0,bottom:0}}><CartesianGrid stroke="#e7e9ed" vertical={false}/><XAxis dataKey="label" tick={{fill:"#6b7280",fontSize:10}} tickLine={false} axisLine={false} minTickGap={18}/><YAxis yAxisId="rooms" tick={{fill:"#6b7280",fontSize:10}} tickLine={false} axisLine={false} allowDecimals={false}/><YAxis yAxisId="occ" orientation="right" domain={[0,100]} tickFormatter={(value)=>`${value}%`} tick={{fill:"#6b7280",fontSize:10}} tickLine={false} axisLine={false}/><Tooltip contentStyle={{borderRadius:10,border:"1px solid #e5e7eb"}}/><Bar yAxisId="rooms" dataKey="roomNightsSold" name="Quartos vendidos" fill="#cfe3df" radius={[3,3,0,0]}/><Line yAxisId="occ" type="monotone" dataKey="occupancy" name="Ocupação" stroke="#1f6f68" strokeWidth={2.4} dot={false}/>{comparisons.map((item,index)=><Line key={item.year} yAxisId="occ" type="monotone" dataKey={`occ_${item.year}`} name={`Ocupação ${item.year}`} stroke={COMPARE_COLORS[index%COMPARE_COLORS.length]} strokeWidth={1.7} strokeDasharray="5 4" dot={false} connectNulls={false}/>)}</ComposedChart></ResponsiveContainer></div></article>

      <article className="panel occupancy-weekday-panel"><div className="panel-heading"><div><h2>Padrão por dia da semana</h2><p>Ocupação por dia da semana no período atual</p></div></div><div className="occupancy-weekday-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={analysis.weekdays} margin={{top:8,right:4,left:-18,bottom:0}}><CartesianGrid stroke="#e7e9ed" vertical={false}/><XAxis dataKey="weekday" tick={{fill:"#6b7280",fontSize:10}} tickLine={false} axisLine={false}/><YAxis domain={[0,100]} tickFormatter={(value)=>`${value}%`} tick={{fill:"#6b7280",fontSize:9}} tickLine={false} axisLine={false}/><Tooltip formatter={(value)=>[`${Number(value).toFixed(1)}%`,"Ocupação"]}/><Bar dataKey={(point)=>point.occupancy===null?0:point.occupancy*100} name="Ocupação" fill="#7eaaa4" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></article>
    </section>

    <article className="panel occupancy-room-type-panel"><div className="panel-heading"><div><h2>Ocupação por tipo de quarto</h2><p>Utilização exata do inventário vendável e comparação por ano.</p></div></div><div className="occupancy-room-table"><table><thead><tr><th>Tipo de quarto</th><th>Ocupação</th><th>Vendidas</th><th>Disponíveis</th>{comparisons.map((item)=><th key={item.year}>{item.year}</th>)}</tr></thead><tbody>{analysis.roomTypes.map((row,index)=><tr key={row.roomType}><td><strong>{row.roomType}</strong></td><td><strong>{percent(row.occupancy)}</strong></td><td>{number(row.roomNightsSold)}</td><td>{number(row.availableRoomNights)}</td>{comparisons.map((item)=>{const other=item.analysis.roomTypes[index]?.occupancy??null;const delta=row.occupancy!==null&&other!==null?(row.occupancy-other)*100:null;return <td key={item.year}>{percent(other)}<br/><small className={tone(delta)}>{delta===null?"—":`${signed(delta,1)} pp`}</small></td>})}</tr>)}</tbody></table></div></article>

    <section className="occupancy-demand-dates-grid"><article className="panel"><div className="panel-heading"><div><h2>Datas de maior procura</h2><p>Maior ocupação no período selecionado</p></div></div><div className="occupancy-date-list">{analysis.highestDates.map((day)=><div key={day.date}><span>{format(parseIsoDate(day.date),"EEE, dd MMM yyyy")}</span><strong>{percent(day.occupancy)}</strong><small>{day.roomNightsSold}/{day.availableRoomNights} quartos</small></div>)}</div></article><article className="panel"><div className="panel-heading"><div><h2>Datas de menor procura</h2><p>Menor ocupação no período selecionado</p></div></div><div className="occupancy-date-list">{analysis.lowestDates.map((day)=><div key={day.date}><span>{format(parseIsoDate(day.date),"EEE, dd MMM yyyy")}</span><strong>{percent(day.occupancy)}</strong><small>{day.roomNightsSold}/{day.availableRoomNights} quartos</small></div>)}</div></article></section>

    <article className="panel occupancy-calendar-panel"><div className="panel-heading"><div><h2>Calendário diário de ocupação</h2><p>Ocupação atual usando o inventário vendável de cada data.</p></div><div className="occupancy-calendar-legend"><span className="occ-low">&lt;50%</span><span className="occ-medium">50–79%</span><span className="occ-high">80–99%</span><span className="occ-full">100%</span><span className="occ-closure-legend"><i/>Indisponibilidade</span></div></div><Calendar daily={analysis.current.daily}/></article>
  </>;
}
