import { useMemo, useState } from "react";
import Papa from "papaparse";
import { costsStore } from "./store";
import type { CostCategory, Supplier } from "./types";

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
  name: string;
  categoryName: string;
  defaultCategoryId: string | null;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  paymentTermsDays: number | null;
  address: string;
  notes: string;
  issue: string | null;
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

function looksLikeSupplierHeader(row: string[]): boolean {
  const first = normalize(row[0] ?? "");
  return first === "nome" || first === "fornecedor" || first === "supplier" || first === "name";
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

export function BulkSupplierEntry({ propertyId, categories, suppliers, act }: SupplierProps) {
  const [text, setText] = useState("");

  const categoryByName = useMemo(() => new Map(categories.map((category) => [normalize(category.name), category])), [categories]);
  const rows = useMemo<SupplierDraft[]>(() => {
    const parsed = parseRows(text);
    const data = parsed.length && looksLikeSupplierHeader(parsed[0]) ? parsed.slice(1) : parsed;
    const existing = new Set(suppliers.map((supplier) => normalize(supplier.name)));
    const seen = new Set<string>();
    return data.map((row) => {
      const name = (row[0] ?? "").trim();
      const categoryName = (row[1] ?? "").trim();
      const category = categoryName ? categoryByName.get(normalize(categoryName)) : undefined;
      const paymentRaw = (row[7] ?? "").trim();
      const paymentNumber = paymentRaw === "" ? null : Number(paymentRaw);
      const key = normalize(name);
      let issue: string | null = null;
      if (!name) issue = "Nome em falta";
      else if (existing.has(key)) issue = "Já existe";
      else if (seen.has(key)) issue = "Duplicado neste lote";
      else if (categoryName && !category) issue = `Categoria desconhecida: ${categoryName}`;
      else if (paymentNumber !== null && (!Number.isInteger(paymentNumber) || paymentNumber < 0)) issue = "Prazo de pagamento inválido";
      seen.add(key);
      return {
        name,
        categoryName,
        defaultCategoryId: category?.id ?? null,
        taxId: (row[2] ?? "").trim(),
        contactName: (row[3] ?? "").trim(),
        email: (row[4] ?? "").trim(),
        phone: (row[5] ?? "").trim(),
        website: (row[6] ?? "").trim(),
        paymentTermsDays: paymentNumber,
        address: (row[8] ?? "").trim(),
        notes: (row[9] ?? "").trim(),
        issue,
      };
    });
  }, [text, suppliers, categoryByName]);

  const validRows = rows.filter((row) => !row.issue);

  async function saveAll() {
    if (!validRows.length) return;
    await act(async () => {
      for (const row of validRows) {
        await costsStore.saveSupplier({
          id: crypto.randomUUID(),
          propertyId,
          name: row.name,
          defaultCategoryId: row.defaultCategoryId,
          taxId: row.taxId,
          contactName: row.contactName,
          email: row.email,
          phone: row.phone,
          website: row.website,
          paymentTermsDays: row.paymentTermsDays,
          address: row.address,
          notes: row.notes,
          active: true,
        });
      }
    });
    setText("");
  }

  return <div className="bulk-master-entry supplier-bulk-entry">
    <div className="bulk-expense-help">
      <strong>Colar fornecedores em massa</strong>
      <span>Ordem das colunas: <b>Nome | Categoria | NIF | Contacto | Email | Telefone | Website | Prazo (dias) | Morada | Notas</b>. Pode deixar colunas vazias ou colar apenas nomes.</span>
    </div>
    <textarea
      className="bulk-master-paste"
      value={text}
      onChange={(event) => setText(event.target.value)}
      placeholder={"Nome\tCategoria\tNIF\tContacto\tEmail\tTelefone\tWebsite\tPrazo (dias)\tMorada\tNotas"}
    />
    {rows.length > 0 && <div className="bulk-master-preview">
      <div className="bulk-master-summary"><strong>{validRows.length} prontos a guardar</strong><span>{rows.length - validRows.length} ignorados</span></div>
      <div className="bulk-master-preview-scroll"><table><thead><tr><th>Fornecedor</th><th>Categoria</th><th>NIF</th><th>Estado</th></tr></thead><tbody>
        {rows.slice(0, 10).map((row, index) => <tr key={`${row.name}-${index}`}><td><strong>{row.name || "—"}</strong><br/><small>{row.email}</small></td><td>{row.categoryName || "—"}</td><td>{row.taxId || "—"}</td><td className={row.issue ? "bulk-invalid" : "bulk-valid"}>{row.issue ?? "Pronto"}</td></tr>)}
      </tbody></table></div>
      {rows.length > 10 && <small>Pré-visualização dos primeiros 10 de {rows.length} fornecedores.</small>}
    </div>}
    <div className="bulk-master-actions"><button type="button" className="secondary-button" disabled={!text} onClick={() => setText("")}>Limpar</button><button type="button" className="primary-button" disabled={!validRows.length} onClick={() => void saveAll()}>Guardar {validRows.length || ""} fornecedores</button></div>
  </div>;
}
