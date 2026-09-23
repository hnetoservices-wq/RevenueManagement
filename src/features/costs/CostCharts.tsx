import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CostCategory, ExpenseRecord, SalaryRecord } from "./types";

interface Props {
  expenses: ExpenseRecord[];
  salaries: SalaryRecord[];
  periodExpenses: ExpenseRecord[];
  periodSalaries: SalaryRecord[];
  categories: CostCategory[];
  baseYear: number;
  comparisonYears: number[];
  categoryFilter: string;
  currency: string;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const COLORS = ["#1f6f68", "#c08a3e", "#4d6b94", "#845d80", "#79905d", "#ba6c57"];

type TrendPoint = { month: string; [key: string]: string | number };

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function expenseMatchesCategory(expense: ExpenseRecord, categoryFilter: string) {
  return categoryFilter === "all" || expense.categoryId === categoryFilter;
}

export function CostCharts({ expenses, salaries, periodExpenses, periodSalaries, categories, baseYear, comparisonYears, categoryFilter, currency }: Props) {
  const years = useMemo(() => [baseYear, ...comparisonYears.filter((year) => year !== baseYear)], [baseYear, comparisonYears]);

  const trend = useMemo<TrendPoint[]>(() => MONTHS.map((month, index) => {
    const point: TrendPoint = { month };
    const monthNumber = String(index + 1).padStart(2, "0");
    for (const year of years) {
      const monthKey = `${year}-${monthNumber}`;
      const operating = expenses
        .filter((item) => item.date.startsWith(monthKey) && expenseMatchesCategory(item, categoryFilter))
        .reduce((sum, item) => sum + item.grossCents, 0);
      const payroll = salaries
        .filter((item) => item.month === monthKey)
        .reduce((sum, item) => sum + item.totalCostCents, 0);
      point[`year_${year}`] = operating + payroll;
    }
    return point;
  }), [expenses, salaries, years, categoryFilter]);

  const categoryData = useMemo(() => categories
    .map((category) => ({
      category: category.name,
      value: periodExpenses.filter((item) => item.categoryId === category.id).reduce((sum, item) => sum + item.grossCents, 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value), [categories, periodExpenses]);

  const paymentData = useMemo(() => {
    const paid = periodExpenses.filter((item) => item.paymentStatus === "paid").reduce((sum, item) => sum + item.grossCents, 0)
      + periodSalaries.filter((item) => item.paymentStatus === "paid").reduce((sum, item) => sum + item.totalCostCents, 0);
    const pending = periodExpenses.filter((item) => item.paymentStatus === "pending").reduce((sum, item) => sum + item.grossCents, 0)
      + periodSalaries.filter((item) => item.paymentStatus === "pending").reduce((sum, item) => sum + item.totalCostCents, 0);
    return [{ name: "Pago", value: paid }, { name: "Pendente", value: pending }].filter((item) => item.value > 0);
  }, [periodExpenses, periodSalaries]);

  const compositionData = useMemo(() => {
    const operating = periodExpenses.reduce((sum, item) => sum + item.grossCents, 0);
    const payroll = periodSalaries.reduce((sum, item) => sum + item.totalCostCents, 0);
    return [{ name: "Despesas", value: operating }, { name: "Salários", value: payroll }].filter((item) => item.value > 0);
  }, [periodExpenses, periodSalaries]);

  const trendHasData = trend.some((point) => years.some((year) => Number(point[`year_${year}`] ?? 0) > 0));
  const periodHasData = compositionData.length > 0;

  return <section className="cost-chart-grid">
    <article className="panel cost-chart-panel cost-chart-wide">
      <div className="panel-heading"><div><h2>Evolução mensal dos custos</h2><p>Total mensal · {years.join(" vs ")}</p></div></div>
      {trendHasData ? <div className="cost-trend-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 14, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="#e7e9ed" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(value) => `€${Math.round(Number(value) / 100)}`} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} width={56} />
        <Tooltip formatter={(value, name) => [money(Number(value), currency), String(name)]} />
        <Legend />
        {years.map((year, index) => <Line key={year} type="monotone" dataKey={`year_${year}`} name={String(year)} stroke={COLORS[index % COLORS.length]} strokeWidth={index === 0 ? 2.5 : 1.7} strokeDasharray={index === 0 ? undefined : "5 4"} dot={false} connectNulls={false} />)}
      </LineChart></ResponsiveContainer></div> : <p className="cost-empty">Ainda não existem custos suficientes para mostrar uma tendência mensal.</p>}
    </article>

    <article className="panel cost-chart-panel">
      <div className="panel-heading"><div><h2>Composição dos custos</h2><p>Despesas operacionais vs salários</p></div></div>
      {periodHasData ? <div className="cost-pie-wrap"><div className="cost-pie-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={compositionData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={2}>{compositionData.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value), currency)} /></PieChart></ResponsiveContainer></div><div className="cost-chart-legend">{compositionData.map((item, index) => <div key={item.name}><span style={{ background: COLORS[index % COLORS.length] }} /><strong>{item.name}</strong><em>{money(item.value, currency)}</em></div>)}</div></div> : <p className="cost-empty">Sem custos no período selecionado.</p>}
    </article>

    <article className="panel cost-chart-panel">
      <div className="panel-heading"><div><h2>Estado dos pagamentos</h2><p>Pago vs ainda por pagar</p></div></div>
      {paymentData.length ? <div className="cost-pie-wrap"><div className="cost-pie-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={2}>{paymentData.map((item, index) => <Cell key={item.name} fill={COLORS[(index + 2) % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value), currency)} /></PieChart></ResponsiveContainer></div><div className="cost-chart-legend">{paymentData.map((item, index) => <div key={item.name}><span style={{ background: COLORS[(index + 2) % COLORS.length] }} /><strong>{item.name}</strong><em>{money(item.value, currency)}</em></div>)}</div></div> : <p className="cost-empty">Sem pagamentos registados no período selecionado.</p>}
    </article>

    <article className="panel cost-chart-panel cost-chart-wide">
      <div className="panel-heading"><div><h2>Despesas por categoria</h2><p>Distribuição das despesas operacionais no período selecionado</p></div></div>
      {categoryData.length ? <div className="cost-category-chart"><ResponsiveContainer width="100%" height={Math.max(230, categoryData.length * 38)}><BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
        <CartesianGrid stroke="#e7e9ed" horizontal={false} />
        <XAxis type="number" tickFormatter={(value) => `€${Math.round(Number(value) / 100)}`} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="category" width={130} tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value) => money(Number(value), currency)} />
        <Bar dataKey="value" name="Despesa" fill="#7eaaa4" radius={[0, 4, 4, 0]} />
      </BarChart></ResponsiveContainer></div> : <p className="cost-empty">Sem despesas por categoria no período selecionado.</p>}
    </article>
  </section>;
}
