import { useEffect, useMemo, useState } from "react";
import { costsStore } from "./store";
import { vatFromGross, type CostCategory, type ExpenseRecord, type Supplier } from "./types";

interface Props {
  propertyId: string;
  categories: CostCategory[];
  suppliers: Supplier[];
  act: (work: () => Promise<void>) => Promise<void>;
}

interface BulkExpenseDraft {
  key: string;
  date: string;
  description: string;
  categoryId: string;
  supplierId: string;
  amount: string;
  vat: string;
  paymentStatus: "paid" | "pending";
  recurring: boolean;
  invoiceNumber: string;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const toCents = (value: string) => Math.round((Number(value.replace(",", ".")) || 0) * 100);

function blankRow(categoryId = ""): BulkExpenseDraft {
  return {
    key: crypto.randomUUID(),
    date: today(),
    description: "",
    categoryId,
    supplierId: "",
    amount: "",
    vat: "23",
    paymentStatus: "paid",
    recurring: false,
    invoiceNumber: "",
    notes: "",
  };
}

function cloneRow(row: BulkExpenseDraft): BulkExpenseDraft {
  return { ...row, key: crypto.randomUUID() };
}

export function BulkExpenseEntry({ propertyId, categories, suppliers, act }: Props) {
  const [rows, setRows] = useState<BulkExpenseDraft[]>(() => [blankRow(categories[0]?.id)]);

  useEffect(() => {
    if (!categories[0]) return;
    setRows((current) => current.map((row) => row.categoryId ? row : { ...row, categoryId: categories[0].id }));
  }, [categories]);

  const valid = useMemo(
    () => rows.length > 0 && rows.every((row) => row.date && row.categoryId && toCents(row.amount) > 0),
    [rows],
  );
  const totalCents = useMemo(() => rows.reduce((sum, row) => sum + toCents(row.amount), 0), [rows]);

  function update(index: number, patch: Partial<BulkExpenseDraft>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function selectSupplier(index:number,supplierId:string){
    const supplier=suppliers.find(item=>item.id===supplierId);
    update(index, supplier?.defaultCategoryId
      ? { supplierId, categoryId:supplier.defaultCategoryId }
      : { supplierId });
  }

  function addRow() {
    setRows((current) => [...current, cloneRow(current[current.length - 1] ?? blankRow(categories[0]?.id))]);
  }

  function removeRow(index: number) {
    setRows((current) => current.length === 1 ? current : current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function saveAll() {
    if (!valid) return;
    await act(async () => {
      for (const row of rows) {
        const grossCents = toCents(row.amount);
        const vatRate = row.vat === "" ? null : Number(row.vat);
        const expense: ExpenseRecord = {
          id: crypto.randomUUID(),
          propertyId,
          date: row.date,
          description: row.description.trim(),
          categoryId: row.categoryId,
          supplierId: row.supplierId || null,
          grossCents,
          vatRate,
          vatCents: vatFromGross(grossCents, vatRate),
          paymentStatus: row.paymentStatus,
          recurring: row.recurring,
          invoiceNumber: row.invoiceNumber.trim(),
          notes: row.notes.trim(),
        };
        await costsStore.saveExpense(expense);
      }
    });
    setRows([blankRow(categories[0]?.id)]);
  }

  return <div className="bulk-expense-entry">
    <div className="bulk-expense-help">
      <strong>Entrada em massa</strong>
      <span>Preencha a primeira linha. Cada nova linha copia todos os dados da anterior — normalmente só precisa de alterar a data.</span>
    </div>

    <div className="bulk-expense-list">
      {rows.map((row, index) => <article className="bulk-expense-row" key={row.key}>
        <div className="bulk-expense-row-main">
          <span className="bulk-expense-index">{index + 1}</span>
          <label>Data<input type="date" value={row.date} onChange={(event) => update(index, { date: event.target.value })} /></label>
          <label>Descrição<input value={row.description} placeholder="Opcional" onChange={(event) => update(index, { description: event.target.value })} /></label>
          <label>Categoria<select value={row.categoryId} onChange={(event) => update(index, { categoryId: event.target.value })}><option value="">Selecionar</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Fornecedor<select value={row.supplierId} onChange={(event) => selectSupplier(index,event.target.value)}><option value="">Sem fornecedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label className="bulk-expense-amount">Valor (€)<input inputMode="decimal" value={row.amount} onChange={(event) => update(index, { amount: event.target.value })} /></label>
          <button type="button" className="bulk-expense-remove" disabled={rows.length === 1} onClick={() => removeRow(index)}>Remover</button>
        </div>

        <details className="bulk-expense-details">
          <summary>Mais detalhes</summary>
          <div>
            <label>IVA (%)<input type="number" value={row.vat} onChange={(event) => update(index, { vat: event.target.value })} /></label>
            <label>Estado<select value={row.paymentStatus} onChange={(event) => update(index, { paymentStatus: event.target.value as "paid" | "pending" })}><option value="paid">Pago</option><option value="pending">Pendente</option></select></label>
            <label>Nº fatura<input value={row.invoiceNumber} onChange={(event) => update(index, { invoiceNumber: event.target.value })} /></label>
            <label className="checkbox"><input type="checkbox" checked={row.recurring} onChange={(event) => update(index, { recurring: event.target.checked })} /> Custo recorrente</label>
            <label className="bulk-expense-notes">Notas<textarea value={row.notes} onChange={(event) => update(index, { notes: event.target.value })} /></label>
          </div>
        </details>
      </article>)}
    </div>

    <div className="bulk-expense-actions">
      <button type="button" className="secondary-button" onClick={addRow}>+ Adicionar linha (copiar anterior)</button>
      <div className="bulk-expense-total"><span>{rows.length} {rows.length === 1 ? "entrada" : "entradas"}</span><strong>{new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(totalCents / 100)}</strong></div>
      <button type="button" className="primary-button" disabled={!valid} onClick={() => void saveAll()}>Guardar todas</button>
    </div>
  </div>;
}
