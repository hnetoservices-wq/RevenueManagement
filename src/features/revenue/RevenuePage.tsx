import { useEffect, useMemo, useState } from "react";
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
import { calculateDistributionCosts } from "../channels/commission";
import { ChannelCommissionPanel } from "../channels/ChannelCommissionPanel";
import { channelCommissionStore } from "../channels/store";
import type { ChannelCommissionRule } from "../channels/types";
import { YearComparisonPicker } from "../comparison/YearComparisonPicker";
import { availableComparisonYears, comparisonFiltersForYear, keepAvailableComparisonYears } from "../comparison/yearComparison";
import { calculateRevenueAnalysis } from "./revenue";
import "./revenue.css";

interface Props {
  property: Property;
  reservations: Reservation[];
  coverageReservations?: Reservation[];
  filters: DashboardFilters;
  setFilters: (filters: DashboardFilters) => void;
}

type RevenueView = "stay" | "booking" | "channels";
type RevenueAnalysisResult = ReturnType<typeof calculateRevenueAnalysis>;
type DistributionResult = ReturnType<typeof calculateDistributionCosts>;
interface YearRevenue { year: number; filters: DashboardFilters; analysis: RevenueAnalysisResult; distribution: DistributionResult }

const MIX_COLORS = ["#1f6f68", "#c08a3e", "#718096"];
const COMPARE_COLORS = ["#6f7f92", "#9b8062", "#845d80", "#79905d", "#ba6c57"];

function money(cents: number | null, currency: string) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}
function number(value: number | null, digits = 0) { return value === null ? "—" : new Intl.NumberFormat("pt-PT", { maximumFractionDigits: digits }).format(value); }
function percent(value: number | null) { return value === null ? "—" : new Intl.NumberFormat("pt-PT", { style: "percent", maximumFractionDigits: 1 }).format(value); }
function signed(value: number | null, digits = 1) { if (value === null) return "—"; const formatted = number(Math.abs(value), digits); return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted; }
function tone(value: number | null) { return value === null || value === 0 ? "neutral" : value > 0 ? "positive" : "negative"; }
function relativeDelta(current: number | null, comparison: number | null) { if (current === null || comparison === null || comparison === 0) return null; return ((current - comparison) / Math.abs(comparison)) * 100; }

function DateFilters({ filters, setFilters }: { filters: DashboardFilters; setFilters: (filters: DashboardFilters) => void }) {
  return <div className="filters"><label>De<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value as IsoDate })} /></label><label>Até<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value as IsoDate })} /></label><label>Receita<select value={filters.revenueBasis} onChange={(event) => setFilters({ ...filters, revenueBasis: event.target.value as DashboardFilters["revenueBasis"] })}><option value="inclusive">Incl. impostos</option><option value="exclusive">Excl. impostos</option></select></label></div>;
}
function RevenueTabs({ view, setView }: { view: RevenueView; setView: (view: RevenueView) => void }) {
  return <div className="revenue-view-tabs" role="tablist" aria-label="Modo de análise de receita"><button type="button" className={view === "stay" ? "active" : ""} onClick={() => setView("stay")}>Receita por estadia</button><button type="button" className={view === "booking" ? "active" : ""} onClick={() => setView("booking")}>Atividade de reservas</button><button type="button" className={view === "channels" ? "active" : ""} onClick={() => setView("channels")}>Canais e comissões</button></div>;
}
function KpiComparisons({ current, comparisons, selector }: { current: number | null; comparisons: YearRevenue[]; selector: (item: YearRevenue) => number | null }) {
  if (!comparisons.length) return <span className="neutral">Sem comparação</span>;
  return <div className="multi-year-deltas">{comparisons.map((item) => { const delta = relativeDelta(current, selector(item)); return <span key={item.year} className={tone(delta)}>{item.year}: {delta === null ? "sem base comparável" : `${signed(delta,1)}%`}</span>; })}</div>;
}

export function RevenuePage({ property, reservations, coverageReservations = reservations, filters, setFilters }: Props) {
  const [view, setView] = useState<RevenueView>("stay");
  const baseYear = Number(filters.startDate.slice(0,4));
  const [comparisonYears, setComparisonYears] = useState<number[]>([baseYear - 1]);
  const [commissionRules, setCommissionRules] = useState<ChannelCommissionRule[]>([]);
  const availableYears = useMemo(() => availableComparisonYears(coverageReservations, filters), [coverageReservations, filters]);
  useEffect(() => setComparisonYears((current) => keepAvailableComparisonYears(current, availableYears)), [availableYears]);

  const refreshCommissionRules = async () => { await channelCommissionStore.initialize(); setCommissionRules(await channelCommissionStore.list(property.id)); };
  useEffect(() => { void refreshCommissionRules(); }, [property.id]);

  const analysis = useMemo(() => calculateRevenueAnalysis(property, reservations, filters, "none", coverageReservations), [property, reservations, coverageReservations, filters]);
  const distribution = useMemo(() => calculateDistributionCosts(reservations, filters, commissionRules), [reservations, filters, commissionRules]);
  const comparisons = useMemo<YearRevenue[]>(() => comparisonYears.map((year) => {
    const shifted = comparisonFiltersForYear(filters, year);
    return { year, filters: shifted, analysis: calculateRevenueAnalysis(property, reservations, shifted, "none", coverageReservations), distribution: calculateDistributionCosts(reservations, shifted, commissionRules) };
  }), [comparisonYears, filters, property, reservations, coverageReservations, commissionRules]);
  const reliable = (item: YearRevenue) => item.analysis.performance.currentCoverage.coverage >= item.analysis.performance.reliableCoverageThreshold;
  const reliableComparisons = comparisons.map((item) => reliable(item) ? item : { ...item, analysis: { ...item.analysis, current: { ...item.analysis.current, roomRevenueCents: 0 } } }).filter(() => true);

  if (view === "booking") return <><RevenueTabs view={view} setView={setView}/><BookingActivityPage property={property} reservations={reservations} coverageReservations={coverageReservations}/></>;
  if (view === "channels") return <><RevenueTabs view={view} setView={setView}/><ChannelCommissionPanel property={property} reservations={coverageReservations} rules={commissionRules} onRulesChanged={refreshCommissionRules}/></>;

  const cancelledOnly = reservations.length > 0 && reservations.every((reservation) => reservation.status === "cancelled");
  const kpis = [
    { label:"Receita de quartos", value:money(analysis.current.roomRevenueCents,property.currency), current:analysis.current.roomRevenueCents, selector:(x:YearRevenue)=>reliable(x)?x.analysis.current.roomRevenueCents:null },
    { label:"Receita total", value:money(analysis.current.totalRevenueCents,property.currency), current:analysis.current.totalRevenueCents, selector:(x:YearRevenue)=>reliable(x)?x.analysis.current.totalRevenueCents:null },
    { label:"Tarifa média diária", value:money(analysis.current.adrCents,property.currency), current:analysis.current.adrCents, selector:(x:YearRevenue)=>reliable(x)?x.analysis.current.adrCents:null },
    { label:"Receita por quarto disponível", value:money(analysis.current.revparCents,property.currency), current:analysis.current.revparCents, selector:(x:YearRevenue)=>reliable(x)?x.analysis.current.revparCents:null },
    { label:"Receita de extras", value:money(analysis.current.extraRevenueCents,property.currency), current:analysis.current.extraRevenueCents, selector:(x:YearRevenue)=>reliable(x)?x.analysis.current.extraRevenueCents:null },
    { label:"Taxa turística", value:money(analysis.current.touristTaxCents,property.currency), current:analysis.current.touristTaxCents, selector:(x:YearRevenue)=>reliable(x)?x.analysis.current.touristTaxCents:null },
  ];
  const trend = useMemo(() => analysis.trend.map((point,index) => {
    const row: Record<string,string|number|null> = { label:point.label, revenue:point.roomRevenueCents, adr:point.adrCents };
    for (const item of comparisons) { const other=item.analysis.trend[index]; row[`revenue_${item.year}`]=other?.roomRevenueCents??null; row[`adr_${item.year}`]=other?.adrCents??null; }
    return row;
  }), [analysis.trend, comparisons]);

  return <>
    <RevenueTabs view={view} setView={setView}/>
    <div className="page-heading revenue-heading"><div><p className="eyebrow">Análise comercial</p><h1>Receita</h1><p>Analise receita, tarifa, canais e compare o mesmo período com um ou vários anos.</p></div><div className="revenue-header-controls"><DateFilters filters={filters} setFilters={setFilters}/><YearComparisonPicker options={availableYears} selected={comparisonYears} onChange={setComparisonYears}/></div></div>

    {comparisonYears.length>0&&<div className="performance-comparison-band"><span>Período selecionado <strong>{filters.startDate} → {filters.endDate}</strong></span>{comparisons.map((item)=><span key={item.year}>{item.year} <strong>{item.filters.startDate} → {item.filters.endDate}</strong> · cobertura <strong>{percent(item.analysis.performance.currentCoverage.coverage)}</strong></span>)}</div>}
    {cancelledOnly&&<div className="revenue-notice"><strong>Filtro apenas canceladas</strong><span>Reservas canceladas permanecem excluídas da receita operacional.</span></div>}
    {comparisons.filter((item)=>!reliable(item)).map((item)=><div key={item.year} className="performance-coverage-notice coverage-insufficient"><strong>{item.year}: dados insuficientes</strong><span>A cobertura do período equivalente é {percent(item.analysis.performance.currentCoverage.coverage)}.</span></div>)}
    {distribution.unconfiguredRevenueCents>0&&<div className="revenue-notice channel-unconfigured-note"><strong>Comissões por configurar</strong><span>{money(distribution.unconfiguredRevenueCents,property.currency)} de receita de quartos pertence a canais sem regra de comissão e está temporariamente a 0%.</span></div>}

    <section className="distribution-summary-grid">
      <article className="kpi-card"><div className="kpi-label">Receita bruta de quartos</div><strong>{money(distribution.grossRoomRevenueCents,property.currency)}</strong><KpiComparisons current={distribution.grossRoomRevenueCents} comparisons={comparisons} selector={(x)=>reliable(x)?x.distribution.grossRoomRevenueCents:null}/></article>
      <article className="kpi-card"><div className="kpi-label">Custos de distribuição</div><strong>{money(distribution.commissionCents,property.currency)}</strong><KpiComparisons current={distribution.commissionCents} comparisons={comparisons} selector={(x)=>reliable(x)?x.distribution.commissionCents:null}/></article>
      <article className="kpi-card"><div className="kpi-label">Receita líquida de quartos</div><strong className="channel-net-positive">{money(distribution.netRoomRevenueCents,property.currency)}</strong><KpiComparisons current={distribution.netRoomRevenueCents} comparisons={comparisons} selector={(x)=>reliable(x)?x.distribution.netRoomRevenueCents:null}/></article>
    </section>

    <section className="revenue-kpi-grid">{kpis.map((kpi)=><article className="kpi-card" key={kpi.label}><div className="kpi-label">{kpi.label}</div><strong>{kpi.value}</strong><KpiComparisons current={kpi.current} comparisons={comparisons} selector={kpi.selector}/></article>)}</section>

    <section className="revenue-main-grid">
      <article className="panel revenue-trend-panel"><div className="panel-heading"><div><h2>Tendência de receita e tarifa</h2><p>{analysis.granularity} · receita de quartos e tarifa média</p></div></div><div className="revenue-trend-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={trend} margin={{top:8,right:12,left:4,bottom:0}}><CartesianGrid stroke="#e7e9ed" vertical={false}/><XAxis dataKey="label" tick={{fill:"#6b7280",fontSize:10}} tickLine={false} axisLine={false} minTickGap={18}/><YAxis yAxisId="revenue" tickFormatter={(value)=>money(Number(value),property.currency)} tick={{fill:"#6b7280",fontSize:10}} tickLine={false} axisLine={false} width={68}/><YAxis yAxisId="adr" orientation="right" tickFormatter={(value)=>money(Number(value),property.currency)} tick={{fill:"#6b7280",fontSize:10}} tickLine={false} axisLine={false} width={55}/><Tooltip contentStyle={{borderRadius:10,border:"1px solid #e5e7eb"}} formatter={(value,name)=>[money(Number(value),property.currency),name]}/><Legend/><Bar yAxisId="revenue" dataKey="revenue" name="Receita quartos" fill="#cfe3df" radius={[3,3,0,0]}/><Line yAxisId="adr" type="monotone" dataKey="adr" name="Tarifa média diária" stroke="#1f6f68" strokeWidth={2.4} dot={false} connectNulls={false}/>{comparisons.map((item,index)=><Line key={`rev-${item.year}`} yAxisId="revenue" type="monotone" dataKey={`revenue_${item.year}`} name={`Receita ${item.year}`} stroke={COMPARE_COLORS[index%COMPARE_COLORS.length]} strokeWidth={1.7} strokeDasharray="5 4" dot={false} connectNulls={false}/>)}</ComposedChart></ResponsiveContainer></div></article>
      <article className="panel revenue-mix-panel"><div className="panel-heading"><div><h2>Composição da receita</h2><p>Composição do período selecionado</p></div></div><div className="revenue-mix-content"><div className="revenue-mix-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analysis.mix} dataKey="valueCents" nameKey="label" innerRadius={58} outerRadius={84} paddingAngle={2}>{analysis.mix.map((item,index)=><Cell key={item.label} fill={MIX_COLORS[index%MIX_COLORS.length]}/>)}</Pie><Tooltip formatter={(value)=>money(Number(value),property.currency)}/></PieChart></ResponsiveContainer></div><div className="revenue-mix-legend">{analysis.mix.map((item,index)=><div key={item.label}><span style={{background:MIX_COLORS[index%MIX_COLORS.length]}}/><strong>{item.label}</strong><em>{money(item.valueCents,property.currency)}</em><small>{percent(item.share)}</small></div>)}</div></div></article>
    </section>

    <article className="panel revenue-channel-panel"><div className="panel-heading"><div><h2>Contribuição por canal</h2><p>Receita bruta, distribuição e receita líquida; anos selecionados mostram a receita líquida comparável.</p></div></div><div className="revenue-table-wrap"><table><thead><tr><th>Canal / grupo</th><th>Receita bruta</th><th>Comissão efetiva</th><th>Custo distribuição</th><th>Receita líquida</th>{comparisons.map((item)=><th key={item.year}>Líquida {item.year}</th>)}<th>Reservas</th><th>Noites</th><th>Tarifa média</th></tr></thead><tbody>{distribution.rows.map((row)=><tr key={row.groupName}><td><strong>{row.groupName}</strong>{!row.configured&&<small className="channel-rule-aliases">Sem regra configurada</small>}</td><td><strong>{money(row.grossRoomRevenueCents,property.currency)}</strong></td><td>{percent(row.effectiveCommissionRate)}</td><td className="negative">{money(row.commissionCents,property.currency)}</td><td className="channel-net-positive">{money(row.netRoomRevenueCents,property.currency)}</td>{comparisons.map((item)=>{const other=item.distribution.rows.find((x)=>x.groupName===row.groupName);const delta=relativeDelta(row.netRoomRevenueCents,other?.netRoomRevenueCents??null);return <td key={item.year}>{other?money(other.netRoomRevenueCents,property.currency):"—"}<br/><small className={tone(delta)}>{delta===null?"—":`${signed(delta,1)}%`}</small></td>})}<td>{number(row.reservations)}</td><td>{number(row.roomNightsSold)}</td><td>{money(row.adrCents,property.currency)}</td></tr>)}</tbody></table></div></article>

    <section className="revenue-lower-grid">
      <article className="panel revenue-monthly-panel"><div className="panel-heading"><div><h2>Receita mensal</h2><p>Receita, tarifa e comparação com os anos selecionados.</p></div></div><div className="revenue-table-wrap"><table><thead><tr><th>Mês</th><th>Receita quartos</th><th>Tarifa média</th><th>Receita/quarto disponível</th><th>Noites</th>{comparisons.map((item)=><th key={item.year}>Δ {item.year}</th>)}</tr></thead><tbody>{analysis.monthly.map((row,index)=><tr key={row.label}><td><strong>{row.label}</strong></td><td>{money(row.roomRevenueCents,property.currency)}</td><td>{money(row.adrCents,property.currency)}</td><td>{money(row.revparCents,property.currency)}</td><td>{number(row.roomNightsSold)}</td>{comparisons.map((item)=>{const other=item.analysis.monthly[index];const delta=other?relativeDelta(row.roomRevenueCents,other.roomRevenueCents):null;return <td key={item.year} className={tone(delta)}>{delta===null?"—":`${signed(delta,1)}%`}</td>})}</tr>)}</tbody></table></div></article>
      <article className="panel revenue-top-dates-panel"><div className="panel-heading"><div><h2>Datas com maior receita</h2><p>Maior receita de quartos por data de estadia</p></div></div><div className="revenue-date-list">{analysis.topDates.map((day)=><div key={day.date}><span>{format(parseIsoDate(day.date),"EEE, dd MMM yyyy")}</span><strong>{money(day.roomRevenueCents,property.currency)}</strong><small>{number(day.roomNightsSold)} quartos · tarifa média {money(day.adrCents,property.currency)}</small></div>)}</div></article>
    </section>
  </>;
}
