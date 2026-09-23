import { useMemo, useState } from "react";
import { BulkCategoryEntry, BulkSupplierEntry } from "./BulkMasterDataEntry";
import { costsStore } from "./store";
import type { CostCategory, Supplier } from "./types";

type SupplierSortKey = "name" | "category" | "contact" | "taxId";
type SortDirection = "asc" | "desc";

const normalizedSearch = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-PT")
  .trim();

interface CategoryTabProps {
  propertyId: string;
  categories: CostCategory[];
  act: (work: () => Promise<void>) => Promise<void>;
}

export function CostCategoriesTab({ propertyId, categories, act }: CategoryTabProps) {
  const [bulkMode, setBulkMode] = useState(false);
  const [editing, setEditing] = useState<CostCategory | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function load(item?: CostCategory) {
    setBulkMode(false);
    setEditing(item ?? null);
    setName(item?.name ?? "");
    setDescription(item?.description ?? "");
  }

  function toggleBulk(checked: boolean) {
    setBulkMode(checked);
    if (checked) {
      setEditing(null);
      setName("");
      setDescription("");
    }
  }

  return <div className="cost-two-column">
    <article className="panel master-data-editor">
      <div className="cost-entry-heading">
        <h2>{bulkMode ? "Categorias em massa" : editing ? "Editar categoria" : "Nova categoria"}</h2>
        <label className="cost-mass-toggle"><input type="checkbox" checked={bulkMode} onChange={(event) => toggleBulk(event.target.checked)} /> Entrada em massa</label>
      </div>
      {bulkMode
        ? <BulkCategoryEntry propertyId={propertyId} categories={categories} act={act} />
        : <div className="cost-form">
            <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <button className="primary-button" disabled={!name.trim()} onClick={() => void act(async () => {
              await costsStore.saveCategory({ id: editing?.id ?? crypto.randomUUID(), propertyId, name: name.trim(), description: description.trim(), active: true });
              load();
            })}>Guardar</button>
            {editing && <button className="secondary-button" onClick={() => load()}>Cancelar</button>}
          </div>}
    </article>
    <article className="panel cost-table"><table><thead><tr><th>Categoria</th><th>Descrição</th><th></th></tr></thead><tbody>{categories.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.description || "—"}</td><td><button onClick={() => load(item)}>Editar</button><button onClick={() => void act(() => costsStore.deleteCategory(propertyId, item.id))}>Remover</button></td></tr>)}</tbody></table></article>
  </div>;
}

interface SupplierTabProps {
  propertyId: string;
  suppliers: Supplier[];
  categories: CostCategory[];
  act: (work: () => Promise<void>) => Promise<void>;
}

export function CostSuppliersTab({ propertyId, suppliers, categories, act }: SupplierTabProps) {
  const empty: Supplier = { id: "", propertyId, name: "", defaultCategoryId: null, taxId: "", contactName: "", email: "", phone: "", address: "", website: "", paymentTermsDays: null, notes: "", active: true };
  const [bulkMode, setBulkMode] = useState(false);
  const [form, setForm] = useState<Partial<Supplier>>(empty);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SupplierSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const categoryName = (id: string | null | undefined) => categories.find((category) => category.id === id)?.name ?? "—";
  const field = (key: keyof Supplier) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function edit(item?: Supplier) {
    setBulkMode(false);
    setForm(item ?? empty);
  }

  function toggleBulk(checked: boolean) {
    setBulkMode(checked);
    if (checked) setForm(empty);
  }

  const visibleSuppliers = useMemo(() => {
    const needle = normalizedSearch(query);
    const filtered = suppliers.filter((supplier) => {
      if (!needle) return true;
      return [supplier.name, categoryName(supplier.defaultCategoryId), supplier.contactName, supplier.email, supplier.phone, supplier.taxId]
        .some((value) => normalizedSearch(value ?? "").includes(needle));
    });
    const valueFor = (supplier: Supplier) => {
      if (sortKey === "category") return categoryName(supplier.defaultCategoryId);
      if (sortKey === "contact") return supplier.contactName || supplier.email || supplier.phone || "";
      if (sortKey === "taxId") return supplier.taxId || "";
      return supplier.name;
    };
    return [...filtered].sort((a, b) => {
      const result = valueFor(a).localeCompare(valueFor(b), "pt-PT", { sensitivity: "base", numeric: true });
      return sortDirection === "asc" ? result : -result;
    });
  }, [suppliers, categories, query, sortKey, sortDirection]);

  function toggleSort(key: SupplierSortKey) {
    if (sortKey === key) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
  }
  const indicator = (key: SupplierSortKey) => sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : "";

  return <div className="cost-two-column supplier-layout">
    <article className="panel supplier-form-sticky">
      <div className="cost-entry-heading">
        <h2>{bulkMode ? "Fornecedores em massa" : form.id ? "Editar fornecedor" : "Novo fornecedor"}</h2>
        <label className="cost-mass-toggle"><input type="checkbox" checked={bulkMode} onChange={(event) => toggleBulk(event.target.checked)} /> Entrada em massa</label>
      </div>
      {bulkMode
        ? <BulkSupplierEntry propertyId={propertyId} categories={categories} suppliers={suppliers} act={act} />
        : <div className="cost-form cost-form-grid">
            <label>Nome<input value={form.name ?? ""} onChange={field("name")} /></label>
            <label>Categoria predefinida<select value={form.defaultCategoryId ?? ""} onChange={(event) => setForm((current) => ({ ...current, defaultCategoryId: event.target.value || null }))}><option value="">Sem categoria predefinida</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label>NIF / VAT<input value={form.taxId ?? ""} onChange={field("taxId")} /></label>
            <label>Contacto<input value={form.contactName ?? ""} onChange={field("contactName")} /></label>
            <label>Email<input value={form.email ?? ""} onChange={field("email")} /></label>
            <label>Telefone<input value={form.phone ?? ""} onChange={field("phone")} /></label>
            <label>Website<input value={form.website ?? ""} onChange={field("website")} /></label>
            <label>Prazo pagamento (dias)<input type="number" value={form.paymentTermsDays ?? ""} onChange={(event) => setForm((current) => ({ ...current, paymentTermsDays: event.target.value ? Number(event.target.value) : null }))} /></label>
            <label className="wide">Morada<input value={form.address ?? ""} onChange={field("address")} /></label>
            <label className="wide">Notas<textarea value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            <button className="primary-button" disabled={!form.name?.trim()} onClick={() => void act(async () => {
              await costsStore.saveSupplier({ ...empty, ...form, id: form.id || crypto.randomUUID(), propertyId, name: form.name!.trim(), defaultCategoryId: form.defaultCategoryId || null } as Supplier);
              edit();
            })}>Guardar</button>
            {form.id && <button className="secondary-button" onClick={() => edit()}>Cancelar</button>}
          </div>}
    </article>
    <article className="panel cost-table supplier-list-panel">
      <div className="supplier-list-toolbar">
        <label>Pesquisar fornecedores<input type="search" value={query} placeholder="Nome, categoria, contacto, email, NIF..." onChange={(event) => setQuery(event.target.value)} /></label>
        <span>{visibleSuppliers.length} de {suppliers.length}</span>
      </div>
      <div className="supplier-table-scroll"><table><thead><tr>
        <th><button type="button" className="supplier-sort" onClick={() => toggleSort("name")}>Fornecedor{indicator("name")}</button></th>
        <th><button type="button" className="supplier-sort" onClick={() => toggleSort("category")}>Categoria predefinida{indicator("category")}</button></th>
        <th><button type="button" className="supplier-sort" onClick={() => toggleSort("contact")}>Contacto{indicator("contact")}</button></th>
        <th><button type="button" className="supplier-sort" onClick={() => toggleSort("taxId")}>NIF{indicator("taxId")}</button></th>
        <th></th>
      </tr></thead><tbody>{visibleSuppliers.length ? visibleSuppliers.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><br/><small>{item.email}</small></td><td>{categoryName(item.defaultCategoryId)}</td><td>{item.contactName || item.phone || "—"}</td><td>{item.taxId || "—"}</td><td><button onClick={() => edit(item)}>Editar</button><button onClick={() => void act(() => costsStore.deleteSupplier(propertyId, item.id))}>Remover</button></td></tr>) : <tr><td colSpan={5}><p className="supplier-empty">Nenhum fornecedor corresponde à pesquisa.</p></td></tr>}</tbody></table></div>
    </article>
  </div>;
}
