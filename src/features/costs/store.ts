import { isTauri } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import type { CostCategory, ExpenseRecord, SalaryRecord, Supplier } from "./types";

type SqlRow = Record<string, string | number | null>;

interface BrowserCostState {
  categories: CostCategory[];
  suppliers: Supplier[];
  expenses: ExpenseRecord[];
  salaries: SalaryRecord[];
}

const STORAGE_KEY = "local-revenue-manager:costs:v1";

function browserState(): BrowserCostState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { categories: [], suppliers: [], expenses: [], salaries: [] };
  const parsed = JSON.parse(raw) as Partial<BrowserCostState>;
  return {
    categories: parsed.categories ?? [],
    suppliers: parsed.suppliers ?? [],
    expenses: parsed.expenses ?? [],
    salaries: parsed.salaries ?? [],
  };
}

function persistBrowser(state: BrowserCostState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export class CostsStore {
  private db: Database | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (isTauri()) {
      this.db = await Database.load("sqlite:revenue-manager.db");
      await this.db.execute(`CREATE TABLE IF NOT EXISTS cost_categories (
        id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        UNIQUE(property_id, name)
      )`);
      await this.db.execute(`CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        name TEXT NOT NULL,
        tax_id TEXT NOT NULL DEFAULT '',
        contact_name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        website TEXT NOT NULL DEFAULT '',
        payment_terms_days INTEGER,
        notes TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1
      )`);
      await this.db.execute(`CREATE TABLE IF NOT EXISTS expense_records (
        id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        category_id TEXT NOT NULL,
        supplier_id TEXT,
        gross_cents INTEGER NOT NULL,
        vat_rate REAL,
        vat_cents INTEGER NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL,
        recurring INTEGER NOT NULL DEFAULT 0,
        invoice_number TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT ''
      )`);
      await this.db.execute(`CREATE TABLE IF NOT EXISTS salary_records (
        id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL,
        month TEXT NOT NULL,
        employee_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT '',
        gross_salary_cents INTEGER NOT NULL,
        employer_costs_cents INTEGER NOT NULL DEFAULT 0,
        meal_allowance_cents INTEGER NOT NULL DEFAULT 0,
        other_costs_cents INTEGER NOT NULL DEFAULT 0,
        total_cost_cents INTEGER NOT NULL,
        payment_status TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT ''
      )`);
      await this.db.execute("CREATE INDEX IF NOT EXISTS idx_expense_records_property_date ON expense_records(property_id, date)");
      await this.db.execute("CREATE INDEX IF NOT EXISTS idx_salary_records_property_month ON salary_records(property_id, month)");
    }
    this.initialized = true;
  }

  private async database(): Promise<Database> {
    await this.initialize();
    if (!this.db) throw new Error("Base de dados indisponível.");
    return this.db;
  }

  async listCategories(propertyId: string): Promise<CostCategory[]> {
    await this.initialize();
    if (!isTauri()) return browserState().categories.filter((x) => x.propertyId === propertyId).sort((a,b)=>a.name.localeCompare(b.name));
    const rows = await (await this.database()).select<SqlRow[]>("SELECT * FROM cost_categories WHERE property_id = $1 ORDER BY name", [propertyId]);
    return rows.map((r) => ({ id:String(r.id), propertyId:String(r.property_id), name:String(r.name), description:String(r.description ?? ""), active:Boolean(r.active) }));
  }

  async saveCategory(item: CostCategory): Promise<void> {
    await this.initialize();
    if (!isTauri()) { const s=browserState(); const i=s.categories.findIndex(x=>x.id===item.id); if(i<0)s.categories.push(item);else s.categories[i]=item; persistBrowser(s); return; }
    await (await this.database()).execute(`INSERT INTO cost_categories (id,property_id,name,description,active) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, active=excluded.active`, [item.id,item.propertyId,item.name.trim(),item.description.trim(),item.active?1:0]);
  }

  async deleteCategory(propertyId: string, id: string): Promise<void> {
    await this.initialize();
    if (!isTauri()) { const s=browserState(); if(s.expenses.some(x=>x.categoryId===id)) throw new Error("A categoria está a ser utilizada por despesas."); s.categories=s.categories.filter(x=>!(x.propertyId===propertyId&&x.id===id)); persistBrowser(s); return; }
    const used=await (await this.database()).select<SqlRow[]>("SELECT COUNT(*) AS n FROM expense_records WHERE property_id=$1 AND category_id=$2",[propertyId,id]);
    if(Number(used[0]?.n ?? 0)>0) throw new Error("A categoria está a ser utilizada por despesas.");
    await (await this.database()).execute("DELETE FROM cost_categories WHERE property_id=$1 AND id=$2",[propertyId,id]);
  }

  async listSuppliers(propertyId: string): Promise<Supplier[]> {
    await this.initialize();
    if (!isTauri()) return browserState().suppliers.filter((x)=>x.propertyId===propertyId).sort((a,b)=>a.name.localeCompare(b.name));
    const rows=await (await this.database()).select<SqlRow[]>("SELECT * FROM suppliers WHERE property_id=$1 ORDER BY name",[propertyId]);
    return rows.map((r)=>({id:String(r.id),propertyId:String(r.property_id),name:String(r.name),taxId:String(r.tax_id??""),contactName:String(r.contact_name??""),email:String(r.email??""),phone:String(r.phone??""),address:String(r.address??""),website:String(r.website??""),paymentTermsDays:r.payment_terms_days===null?null:Number(r.payment_terms_days),notes:String(r.notes??""),active:Boolean(r.active)}));
  }

  async saveSupplier(item: Supplier): Promise<void> {
    await this.initialize();
    if(!isTauri()){const s=browserState();const i=s.suppliers.findIndex(x=>x.id===item.id);if(i<0)s.suppliers.push(item);else s.suppliers[i]=item;persistBrowser(s);return;}
    await (await this.database()).execute(`INSERT INTO suppliers (id,property_id,name,tax_id,contact_name,email,phone,address,website,payment_terms_days,notes,active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,tax_id=excluded.tax_id,contact_name=excluded.contact_name,email=excluded.email,phone=excluded.phone,address=excluded.address,website=excluded.website,payment_terms_days=excluded.payment_terms_days,notes=excluded.notes,active=excluded.active`,[item.id,item.propertyId,item.name.trim(),item.taxId.trim(),item.contactName.trim(),item.email.trim(),item.phone.trim(),item.address.trim(),item.website.trim(),item.paymentTermsDays,item.notes.trim(),item.active?1:0]);
  }

  async deleteSupplier(propertyId:string,id:string):Promise<void>{
    await this.initialize();
    if(!isTauri()){const s=browserState();if(s.expenses.some(x=>x.supplierId===id))throw new Error("O fornecedor está associado a despesas.");s.suppliers=s.suppliers.filter(x=>!(x.propertyId===propertyId&&x.id===id));persistBrowser(s);return;}
    const used=await (await this.database()).select<SqlRow[]>("SELECT COUNT(*) AS n FROM expense_records WHERE property_id=$1 AND supplier_id=$2",[propertyId,id]);
    if(Number(used[0]?.n??0)>0)throw new Error("O fornecedor está associado a despesas.");
    await (await this.database()).execute("DELETE FROM suppliers WHERE property_id=$1 AND id=$2",[propertyId,id]);
  }

  async listExpenses(propertyId:string):Promise<ExpenseRecord[]>{
    await this.initialize();
    if(!isTauri())return browserState().expenses.filter(x=>x.propertyId===propertyId).sort((a,b)=>b.date.localeCompare(a.date));
    const rows=await (await this.database()).select<SqlRow[]>("SELECT * FROM expense_records WHERE property_id=$1 ORDER BY date DESC, description",[propertyId]);
    return rows.map(r=>({id:String(r.id),propertyId:String(r.property_id),date:String(r.date),description:String(r.description),categoryId:String(r.category_id),supplierId:r.supplier_id?String(r.supplier_id):null,grossCents:Number(r.gross_cents),vatRate:r.vat_rate===null?null:Number(r.vat_rate),vatCents:Number(r.vat_cents),paymentStatus:String(r.payment_status) as ExpenseRecord["paymentStatus"],recurring:Boolean(r.recurring),invoiceNumber:String(r.invoice_number??""),notes:String(r.notes??"")}));
  }

  async saveExpense(item:ExpenseRecord):Promise<void>{
    await this.initialize();
    if(!isTauri()){const s=browserState();const i=s.expenses.findIndex(x=>x.id===item.id);if(i<0)s.expenses.push(item);else s.expenses[i]=item;persistBrowser(s);return;}
    await (await this.database()).execute(`INSERT INTO expense_records (id,property_id,date,description,category_id,supplier_id,gross_cents,vat_rate,vat_cents,payment_status,recurring,invoice_number,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT(id) DO UPDATE SET date=excluded.date,description=excluded.description,category_id=excluded.category_id,supplier_id=excluded.supplier_id,gross_cents=excluded.gross_cents,vat_rate=excluded.vat_rate,vat_cents=excluded.vat_cents,payment_status=excluded.payment_status,recurring=excluded.recurring,invoice_number=excluded.invoice_number,notes=excluded.notes`,[item.id,item.propertyId,item.date,item.description.trim(),item.categoryId,item.supplierId,item.grossCents,item.vatRate,item.vatCents,item.paymentStatus,item.recurring?1:0,item.invoiceNumber.trim(),item.notes.trim()]);
  }

  async deleteExpense(propertyId:string,id:string):Promise<void>{await this.initialize();if(!isTauri()){const s=browserState();s.expenses=s.expenses.filter(x=>!(x.propertyId===propertyId&&x.id===id));persistBrowser(s);return;}await (await this.database()).execute("DELETE FROM expense_records WHERE property_id=$1 AND id=$2",[propertyId,id]);}

  async listSalaries(propertyId:string):Promise<SalaryRecord[]>{
    await this.initialize();
    if(!isTauri())return browserState().salaries.filter(x=>x.propertyId===propertyId).sort((a,b)=>b.month.localeCompare(a.month));
    const rows=await (await this.database()).select<SqlRow[]>("SELECT * FROM salary_records WHERE property_id=$1 ORDER BY month DESC, employee_name",[propertyId]);
    return rows.map(r=>({id:String(r.id),propertyId:String(r.property_id),month:String(r.month),employeeName:String(r.employee_name),role:String(r.role??""),grossSalaryCents:Number(r.gross_salary_cents),employerCostsCents:Number(r.employer_costs_cents),mealAllowanceCents:Number(r.meal_allowance_cents),otherCostsCents:Number(r.other_costs_cents),totalCostCents:Number(r.total_cost_cents),paymentStatus:String(r.payment_status) as SalaryRecord["paymentStatus"],notes:String(r.notes??"")}));
  }

  async saveSalary(item:SalaryRecord):Promise<void>{
    await this.initialize();
    if(!isTauri()){const s=browserState();const i=s.salaries.findIndex(x=>x.id===item.id);if(i<0)s.salaries.push(item);else s.salaries[i]=item;persistBrowser(s);return;}
    await (await this.database()).execute(`INSERT INTO salary_records (id,property_id,month,employee_name,role,gross_salary_cents,employer_costs_cents,meal_allowance_cents,other_costs_cents,total_cost_cents,payment_status,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(id) DO UPDATE SET month=excluded.month,employee_name=excluded.employee_name,role=excluded.role,gross_salary_cents=excluded.gross_salary_cents,employer_costs_cents=excluded.employer_costs_cents,meal_allowance_cents=excluded.meal_allowance_cents,other_costs_cents=excluded.other_costs_cents,total_cost_cents=excluded.total_cost_cents,payment_status=excluded.payment_status,notes=excluded.notes`,[item.id,item.propertyId,item.month,item.employeeName.trim(),item.role.trim(),item.grossSalaryCents,item.employerCostsCents,item.mealAllowanceCents,item.otherCostsCents,item.totalCostCents,item.paymentStatus,item.notes.trim()]);
  }

  async deleteSalary(propertyId:string,id:string):Promise<void>{await this.initialize();if(!isTauri()){const s=browserState();s.salaries=s.salaries.filter(x=>!(x.propertyId===propertyId&&x.id===id));persistBrowser(s);return;}await (await this.database()).execute("DELETE FROM salary_records WHERE property_id=$1 AND id=$2",[propertyId,id]);}
}

export const costsStore = new CostsStore();
