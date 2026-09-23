import { useMemo, useState } from "react";
import Papa from "papaparse";
import { costsStore } from "./store";
import type { CostCategory, Supplier } from "./types";
import "./bulkSupplier.css";

interface CommonProps {
  propertyId: string;
  act: (work: () => Promise<void>) => Promise<void>;
}

interface CategoryProps extends CommonProps {
  categories: CostCategory[];
}

interface SupplierProps extends CommonProps {
  categories: CostCategory[];
  suppliers: Supplier[];
}

interface CategoryDraft {
  name: string;
  description: string;
  issue: string | null;
}

interface SupplierDraft {
  key: string;
  name: string;
  defaultCategoryId: string;
  notes: string;
}

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("pt-PT");

function parseRows(text: string): string[][] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!cleaned) return [];
  const delimiter = cleaned.includes("\t") ? "\t" : cleaned.split("\n").some((line) => line.includes(";")) ? ";" : undefined;
  if (!delimiter) return cleaned.split("\n").map((line) => [line.trim()]).filter((row) => row[0]);
  const result = Papa.parse<string[]>(cleaned, { delimiter, skipEmptyLines: "greedy" });
  return (result.data ?? []).map((row) => row.map((value) => String(value ?? "").trim()));
}

function looksLikeCategoryHeader(row: string[]): boolean {
  const first = normalize(row[0] ?? "");
  return first === "nome" || first === "categoria" || first === "name" || first === "category";
}

export function BulkCategoryEntry({ propertyId, categories, act }: CategoryProps) {
  const [text, setText] = useState("");

  const rows = useMemo<CategoryDraft[]>(() => {
    const parsed = parseRows(text);
    const data = parsed.length && looksLikeCategoryHeader(parsed[0]) ? parsed.slice(1) : parsed;
    const existing = new Set(categories.map((category) => normalize(category.name)));
    const seen = new Set<string>();
    return data.map((row) => {
      const name = (row[0] ?? "").trim();
      const description = (row[1] ?? "").trim();
      const key = normalize(name);
      let issue: string | null = null;
      if (!name) issue = "Nome em falta";
      else if (existing.has(key)) issue = "Já existe";
      else if (seen.has(key)) issue = "Duplicada neste lote";
      seen.add(key);
      return { name, description, issue };
    });
  }, [text, categories]);

  const validRows = rows.filter((row) => !row.issue);

  async function saveAll() {
    if (!validRows.length) return;
    await act(async () => {
      for (const row of validRows) {
        await costsStore.saveCategory({
          id: crypto.randomUUID(),
          propertyId,
          name: row.name,
          description: row.description,
          active: true,
        });
      }
    });
    setText("");
  }

  return <div className="bulk-master-entry">
    <div className="bulk-expense-help">
      <strong>Colar categorias em massa</strong>
      <span>Copie do Excel/Sheets: <b>Nome</b> e, opcionalmente, <b>Descrição</b>. Também pode colar apenas um nome por linha.</span>
    </div>
    <textarea
      className="bulk-master-paste"
      value={text}
      onChange={(event) => setText(event.target.value)}
      placeholder={"Nome\tDescrição\nLimpeza\tProdutos e serviços de limpeza\nSoftware\tLicenças e subscrições"}
    />
    {rows.length > 0 && <div className="bulk-master-preview">
      <div className="bulk-master-summary"><strong>{validRows.length} prontas a guardar</strong><span>{rows.length - validRows.length} ignoradas</span></div>
      <div className="bulk-master-preview-scroll"><table><thead><tr><th>Nome</th><th>Descrição</th><th>Estado</th></tr></thead><tbody>
        {rows.slice(0, 12).map((row, index) => <tr key={`${row.name}-${index}`}><td><strong>{row.name || "—"}</strong></td><td>{row.description || "—"}</td><td className={row.issue ? "bulk-invalid" : "bulk-valid"}>{row.issue ?? "Pronta"}</td></tr>)}
      </tbody></table></div>
      {rows.length > 12 && <small>Pré-visualização das primeiras 12 de {rows.length} linhas.</small>}
    </div>}
    <div className="bulk-master-actions"><button type="button" className="secondary-button" disabled={!text} onClick={() => setText("")}>Limpar</button><button type="button" className="primary-button" disabled={!validRows.length} onClick={() => void saveAll()}>Guardar {validRows.length || ""} categorias</button></div>
  </div>;
}

function blankSupplier(): SupplierDraft {
  return {
    key: crypto.randomUUID(),
    name: "",
    defaultCategoryId: "",
    notes: "",
  };
}

export function BulkSupplierEntry({ propertyId, categories, suppliers, act }: SupplierProps) {
  const [rows, setRows] = useState<SupplierDraft[]>(() => [blankSupplier()]);

  const existingNames = useMemo(() => new Set(suppliers.map((supplier) => normalize(supplier.name))), [suppliers]);
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = normalize(row.name);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }, [rows]);

  function issueFor(row: SupplierDraft): string | null {
    const key = normalize(row.name);
    if (!key) return null;
    if (existingNames.has(key)) return "Já existe";
    if (duplicateNames.has(key)) return "Duplicado neste lote";
    return null;
  }

  const validRows = rows.filter((row) => row.name.trim() && !issueFor(row));

  function updateRow(index: number, patch: Partial<SupplierDraft>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function addRow() {
    setRows((current) => [...current, blankSupplier()]);
  }

  function removeRow(index: number) {
    setRows((current) => current.length === 1 ? [blankSupplier()] : current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function saveAll() {
    if (!validRows.length) return;
    await act(async () => {
      for (const row of validRows) {
        await costsStore.saveSupplier({
          id: crypto.randomUUID(),
          propertyId,
          name: row.name.trim(),
          defaultCategoryId: row.defaultCategoryId || null,
          taxId: "",
          contactName: "",
          email: "",
          phone: "",
          website: "",
          paymentTermsDays: null,
          address: "",
          notes: row.notes.trim(),
          active: true,
        });
      }
    });
    setRows([blankSupplier()]);
  }

  return <div className="bulk-master-entry supplier-bulk-entry">
    <div className="bulk-expense-help">
      <strong>Entrada rápida de fornecedores</strong>
      <span>Crie apenas o essencial agora. Os restantes dados do fornecedor podem ser preenchidos mais tarde através de <b>Editar</b>.</span>
    </div>

    <div className="supplier-bulk-list">
      {rows.map((row, index) => {
        const issue = issueFor(row);
        return <div className="supplier-bulk-row" key={row.key}>
          <span className="bulk-expense-index">{index + 1}</span>
          <label>Nome<input value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} /></label>
          <label>Categoria<select value={row.defaultCategoryId} onChange={(event) => updateRow(index, { defaultCategoryId: event.target.value })}><option value="">Sem categoria predefinida</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Notas<input value={row.notes} onChange={(event) => updateRow(index, { notes: event.target.value })} /></label>
          <div className="supplier-bulk-row-actions">
            {issue && <span className="bulk-invalid">{issue}</span>}
            <button type="button" className="bulk-expense-remove" onClick={() => removeRow(index)}>Remover</button>
          </div>
        </div>;
      })}
    </div>

    <div className="bulk-master-actions supplier-bulk-actions">
      <button type="button" className="secondary-button" onClick={addRow}>+ Adicionar entrada</button>
      <span>{validRows.length} {validRows.length === 1 ? "fornecedor pronto" : "fornecedores prontos"}</span>
      <button type="button" className="primary-button" disabled={!validRows.length} onClick={() => void saveAll()}>Guardar {validRows.length || ""} fornecedores</button>
    </div>
  </div>;
}
