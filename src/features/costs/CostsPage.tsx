import { useEffect, useMemo, useState } from "react";
import type { Property } from "../../domain/models";
import { YearComparisonPicker } from "../comparison/YearComparisonPicker";
import { comparisonYearsFromDates, keepAvailableComparisonYears } from "../comparison/yearComparison";
import { BulkExpenseEntry } from "./BulkExpenseEntry";
import { CostCharts } from "./CostCharts";
import { costsStore } from "./store";
import {
  calculateCostSummary,
  vatFromGross,
  type CostCategory,
  type ExpenseRecord,
  type SalaryRecord,
  type Supplier,
} from "./types";
import "./costs.css";

type Tab = "resumo" | "despesas" | "salarios" | "fornecedores" | "categorias";
type CostSummary = ReturnType<typeof calculateCostSummary>;
interface YearCostComparison { year:number; month:string; summary:CostSummary; categoryTotals:Map<string,number> }

const euro=(cents:number)=>new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"}).format(cents/100);
const toCents=(value:string)=>Math.round((Number(value.replace(",","."))||0)*100);
const toAmount=(cents:number)=>String((cents/100).toFixed(2));
const signed=(value:number)=>`${value>0?"+":value<0?"−":""}${new Intl.NumberFormat("pt-PT",{maximumFractionDigits:1}).format(Math.abs(value))}%`;
function relativeDelta(current:number,comparison:number){return comparison===0?null:((current-comparison)/Math.abs(comparison))*100}
function deltaTone(value:number|null){return value===null||value===0?"neutral":value>0?"negative":"positive"}

export function CostsPage({ property }: { property: Property }) {
  const [tab,setTab]=useState<Tab>("resumo");
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const baseYear=Number((month||new Date().toISOString().slice(0,7)).slice(0,4));
  const [comparisonYears,setComparisonYears]=useState<number[]>([baseYear-1]);
  const [categoryFilter,setCategoryFilter]=useState("all");
  const [categories,setCategories]=useState<CostCategory[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [expenses,setExpenses]=useState<ExpenseRecord[]>([]);
  const [salaries,setSalaries]=useState<SalaryRecord[]>([]);
  const [error,setError]=useState<string|null>(null);

  async function reload(){
    await costsStore.initialize();
    const [c,s,e,p]=await Promise.all([
      costsStore.listCategories(property.id),
      costsStore.listSuppliers(property.id),
      costsStore.listExpenses(property.id),
      costsStore.listSalaries(property.id),
    ]);
    setCategories(c);setSuppliers(s);setExpenses(e);setSalaries(p);
  }
  useEffect(()=>{void reload().catch((e)=>setError(String(e)));},[property.id]);

  const availableYears=useMemo(()=>comparisonYearsFromDates([...expenses.map(x=>x.date),...salaries.map(x=>`${x.month}-01`)],baseYear),[expenses,salaries,baseYear]);
  useEffect(()=>setComparisonYears(current=>keepAvailableComparisonYears(current,availableYears)),[availableYears]);

  const filteredExpenses=useMemo(()=>expenses.filter(x=>(!month||x.date.startsWith(month))&&(categoryFilter==="all"||x.categoryId===categoryFilter)),[expenses,month,categoryFilter]);
  const filteredSalaries=useMemo(()=>salaries.filter(x=>!month||x.month===month),[salaries,month]);
  const summary=useMemo(()=>calculateCostSummary(filteredExpenses,filteredSalaries),[filteredExpenses,filteredSalaries]);
  const categoryTotals=useMemo(()=>categories.map(c=>({id:c.id,name:c.name,total:filteredExpenses.filter(x=>x.categoryId===c.id).reduce((s,x)=>s+x.grossCents,0)})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total),[categories,filteredExpenses]);
  const comparisons=useMemo<YearCostComparison[]>(()=>{
    if(!month)return [];
    const suffix=month.slice(4);
    return comparisonYears.map(year=>{
      const targetMonth=`${year}${suffix}`;
      const targetExpenses=expenses.filter(x=>x.date.startsWith(targetMonth)&&(categoryFilter==="all"||x.categoryId===categoryFilter));
      const targetSalaries=salaries.filter(x=>x.month===targetMonth);
      return {
        year,
        month:targetMonth,
        summary:calculateCostSummary(targetExpenses,targetSalaries),
        categoryTotals:new Map(categories.map(c=>[c.id,targetExpenses.filter(x=>x.categoryId===c.id).reduce((s,x)=>s+x.grossCents,0)])),
      };
    });
  },[month,comparisonYears,expenses,salaries,categoryFilter,categories]);

  const categoryName=(id:string)=>categories.find(x=>x.id===id)?.name??"Sem categoria";
  const supplierName=(id:string|null)=>suppliers.find(x=>x.id===id)?.name??"—";
  async function act(work:()=>Promise<void>){setError(null);try{await work();await reload();}catch(e){setError(e instanceof Error?e.message:String(e));}}

  const costKpis:[string,number,(s:CostSummary)=>number][]=[
    ["Custos totais",summary.totalCostsCents,s=>s.totalCostsCents],
    ["Despesas",summary.operatingExpensesCents,s=>s.operatingExpensesCents],
    ["Salários",summary.payrollCents,s=>s.payrollCents],
    ["Por pagar",summary.pendingCents,s=>s.pendingCents],
    ["IVA estimado",summary.vatCents,s=>s.vatCents],
  ];

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">Controlo de custos</p><h1>Custos</h1><p>Despesas operacionais, salários, fornecedores e categorias, com comparação mensal entre anos.</p></div>
      <div className="cost-filters">
        <label>Mês<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
        <button className="secondary-button" onClick={()=>setMonth("")}>Todos</button>
        <label>Categoria<select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">Todas</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {month&&<YearComparisonPicker options={availableYears} selected={comparisonYears} onChange={setComparisonYears}/>} 
      </div>
    </div>
    {!month&&<div className="performance-coverage-notice coverage-partial"><strong>Comparação desativada em “Todos”</strong><span>Selecione um mês para comparar exatamente o mesmo mês entre anos.</span></div>}
    {month&&comparisons.length>0&&<div className="performance-comparison-band"><span>Período atual <strong>{month}</strong></span>{comparisons.map(x=><span key={x.year}>Comparação <strong>{x.month}</strong></span>)}</div>}
    {error&&<div className="alert"><span>{error}</span><button onClick={()=>setError(null)}>Fechar</button></div>}
    <div className="cost-tabs">{([['resumo','Resumo'],['despesas','Despesas'],['salarios','Salários'],['fornecedores','Fornecedores'],['categorias','Categorias']] as [Tab,string][]).map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}</div>

    {tab==="resumo"&&<>
      <section className="cost-kpis">{costKpis.map(([label,value,selector])=><CostKpi key={label} label={label} value={euro(value)} comparisons={comparisons.map(x=>({year:x.year,value:relativeDelta(value,selector(x.summary))}))}/>)}</section>
      <CostCharts expenses={expenses} salaries={salaries} periodExpenses={filteredExpenses} periodSalaries={filteredSalaries} categories={categories} baseYear={baseYear} comparisonYears={comparisonYears} categoryFilter={categoryFilter} currency={property.currency}/>
      <article className="panel"><h2>Custos por categoria</h2>{categoryTotals.length?<div className="cost-category-summary">{categoryTotals.map(x=><div key={x.id}><span>{x.name}</span><strong>{euro(x.total)}</strong>{comparisons.length>0&&<small className="multi-year-deltas">{comparisons.map(c=>{const other=c.categoryTotals.get(x.id)??0;const delta=relativeDelta(x.total,other);return <span key={c.year} className={deltaTone(delta)}>{c.year}: {other?`${euro(other)} · ${delta===null?"—":signed(delta)}`:"sem custo registado"}</span>})}</small>}</div>)}</div>:<p className="cost-empty">Sem custos para o período selecionado.</p>}</article>
    </>}
    {tab==="categorias"&&<CategoriesTab propertyId={property.id} categories={categories} act={act}/>} 
    {tab==="fornecedores"&&<SuppliersTab propertyId={property.id} suppliers={suppliers} categories={categories} act={act}/>} 
    {tab==="despesas"&&<ExpensesTab propertyId={property.id} categories={categories} suppliers={suppliers} rows={filteredExpenses} categoryName={categoryName} supplierName={supplierName} act={act}/>} 
    {tab==="salarios"&&<SalariesTab propertyId={property.id} rows={filteredSalaries} act={act}/>} 
  </>;
}

function CostKpi({label,value,comparisons}:{label:string;value:string;comparisons:{year:number;value:number|null}[]}){
  return <article className="kpi-card"><div className="kpi-label">{label}</div><strong>{value}</strong>{comparisons.length?<div className="multi-year-deltas">{comparisons.map(x=><span key={x.year} className={deltaTone(x.value)}>{x.year}: {x.value===null?"sem base comparável":signed(x.value)}</span>)}</div>:<span className="neutral">Sem comparação</span>}</article>;
}

function CategoriesTab({propertyId,categories,act}:{propertyId:string;categories:CostCategory[];act:(w:()=>Promise<void>)=>Promise<void>}){
  const [editing,setEditing]=useState<CostCategory|null>(null);
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  function load(x?:CostCategory){setEditing(x??null);setName(x?.name??"");setDescription(x?.description??"");}
  return <div className="cost-two-column">
    <article className="panel"><h2>{editing?"Editar categoria":"Nova categoria"}</h2><div className="cost-form"><label>Nome<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label><button className="primary-button" disabled={!name.trim()} onClick={()=>void act(async()=>{await costsStore.saveCategory({id:editing?.id??crypto.randomUUID(),propertyId,name:name.trim(),description:description.trim(),active:true});load();})}>Guardar</button>{editing&&<button className="secondary-button" onClick={()=>load()}>Cancelar</button>}</div></article>
    <article className="panel cost-table"><table><thead><tr><th>Categoria</th><th>Descrição</th><th></th></tr></thead><tbody>{categories.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.description||"—"}</td><td><button onClick={()=>load(x)}>Editar</button><button onClick={()=>void act(()=>costsStore.deleteCategory(propertyId,x.id))}>Remover</button></td></tr>)}</tbody></table></article>
  </div>;
}

function SuppliersTab({propertyId,suppliers,categories,act}:{propertyId:string;suppliers:Supplier[];categories:CostCategory[];act:(w:()=>Promise<void>)=>Promise<void>}){
  const empty:Supplier={id:"",propertyId,name:"",defaultCategoryId:null,taxId:"",contactName:"",email:"",phone:"",address:"",website:"",paymentTermsDays:null,notes:"",active:true};
  const [f,setF]=useState<Partial<Supplier>>(empty);
  const edit=(x?:Supplier)=>setF(x??empty);
  const field=(k:keyof Supplier)=>(e:any)=>setF(v=>({...v,[k]:e.target.value}));
  const categoryName=(id:string|null|undefined)=>categories.find(category=>category.id===id)?.name??"—";

  return <div className="cost-two-column">
    <article className="panel"><h2>{f.id?"Editar fornecedor":"Novo fornecedor"}</h2><div className="cost-form cost-form-grid">
      <label>Nome<input value={f.name??""} onChange={field("name")}/></label>
      <label>Categoria predefinida<select value={f.defaultCategoryId??""} onChange={e=>setF(v=>({...v,defaultCategoryId:e.target.value||null}))}><option value="">Sem categoria predefinida</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>NIF / VAT<input value={f.taxId??""} onChange={field("taxId")}/></label>
      <label>Contacto<input value={f.contactName??""} onChange={field("contactName")}/></label>
      <label>Email<input value={f.email??""} onChange={field("email")}/></label>
      <label>Telefone<input value={f.phone??""} onChange={field("phone")}/></label>
      <label>Website<input value={f.website??""} onChange={field("website")}/></label>
      <label>Prazo pagamento (dias)<input type="number" value={f.paymentTermsDays??""} onChange={e=>setF(v=>({...v,paymentTermsDays:e.target.value?Number(e.target.value):null}))}/></label>
      <label className="wide">Morada<input value={f.address??""} onChange={field("address")}/></label>
      <label className="wide">Notas<textarea value={f.notes??""} onChange={field("notes")}/></label>
      <button className="primary-button" disabled={!f.name?.trim()} onClick={()=>void act(async()=>{await costsStore.saveSupplier({...empty,...f,id:f.id||crypto.randomUUID(),propertyId,name:f.name!.trim(),defaultCategoryId:f.defaultCategoryId||null} as Supplier);edit();})}>Guardar</button>
      {f.id&&<button className="secondary-button" onClick={()=>edit()}>Cancelar</button>}
    </div></article>
    <article className="panel cost-table"><table><thead><tr><th>Fornecedor</th><th>Categoria predefinida</th><th>Contacto</th><th>NIF</th><th></th></tr></thead><tbody>{suppliers.map(x=><tr key={x.id}><td><strong>{x.name}</strong><br/><small>{x.email}</small></td><td>{categoryName(x.defaultCategoryId)}</td><td>{x.contactName||x.phone||"—"}</td><td>{x.taxId||"—"}</td><td><button onClick={()=>edit(x)}>Editar</button><button onClick={()=>void act(()=>costsStore.deleteSupplier(propertyId,x.id))}>Remover</button></td></tr>)}</tbody></table></article>
  </div>;
}

function ExpensesTab({propertyId,categories,suppliers,rows,categoryName,supplierName,act}:{propertyId:string;categories:CostCategory[];suppliers:Supplier[];rows:ExpenseRecord[];categoryName:(id:string)=>string;supplierName:(id:string|null)=>string;act:(w:()=>Promise<void>)=>Promise<void>}){
  const [bulkMode,setBulkMode]=useState(false);
  const [edit,setEdit]=useState<ExpenseRecord|null>(null);
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [desc,setDesc]=useState("");
  const [cat,setCat]=useState("");
  const [sup,setSup]=useState("");
  const [amount,setAmount]=useState("");
  const [vat,setVat]=useState("23");
  const [status,setStatus]=useState<"paid"|"pending">("paid");
  const [rec,setRec]=useState(false);
  const [invoice,setInvoice]=useState("");
  const [notes,setNotes]=useState("");

  function load(x?:ExpenseRecord){setBulkMode(false);setEdit(x??null);setDate(x?.date??new Date().toISOString().slice(0,10));setDesc(x?.description??"");setCat(x?.categoryId??categories[0]?.id??"");setSup(x?.supplierId??"");setAmount(x?toAmount(x.grossCents):"");setVat(x?.vatRate===null?"":String(x?.vatRate??23));setStatus(x?.paymentStatus??"paid");setRec(x?.recurring??false);setInvoice(x?.invoiceNumber??"");setNotes(x?.notes??"");}
  useEffect(()=>{if(!cat&&categories[0])setCat(categories[0].id)},[categories,cat]);
  function toggleBulk(checked:boolean){setBulkMode(checked);if(checked)setEdit(null)}
  function selectSupplier(supplierId:string){
    setSup(supplierId);
    const supplier=suppliers.find(item=>item.id===supplierId);
    if(supplier?.defaultCategoryId)setCat(supplier.defaultCategoryId);
  }

  return <>
    <article className="panel"><div className="cost-entry-heading"><h2>{bulkMode?"Entrada em massa":edit?"Editar despesa":"Nova despesa"}</h2><label className="cost-mass-toggle"><input type="checkbox" checked={bulkMode} onChange={e=>toggleBulk(e.target.checked)}/> Entrada em massa</label></div>
      {bulkMode?<BulkExpenseEntry propertyId={propertyId} categories={categories} suppliers={suppliers} act={act}/>:<div className="cost-form cost-form-grid expense-form">
        <label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label>Descrição (opcional)<input value={desc} onChange={e=>setDesc(e.target.value)}/></label>
        <label>Categoria<select value={cat} onChange={e=>setCat(e.target.value)}><option value="">Selecionar</option>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Fornecedor<select value={sup} onChange={e=>selectSupplier(e.target.value)}><option value="">Sem fornecedor</option>{suppliers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Valor total (€)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <label>IVA (%)<input type="number" value={vat} onChange={e=>setVat(e.target.value)}/></label>
        <label>Estado<select value={status} onChange={e=>setStatus(e.target.value as "paid"|"pending")}><option value="paid">Pago</option><option value="pending">Pendente</option></select></label>
        <label>Nº fatura<input value={invoice} onChange={e=>setInvoice(e.target.value)}/></label>
        <label className="checkbox"><input type="checkbox" checked={rec} onChange={e=>setRec(e.target.checked)}/> Custo recorrente</label>
        <label className="wide">Notas<textarea value={notes} onChange={e=>setNotes(e.target.value)}/></label>
        <button className="primary-button" disabled={!cat||toCents(amount)<=0} onClick={()=>void act(async()=>{const gross=toCents(amount);const rate=vat===""?null:Number(vat);await costsStore.saveExpense({id:edit?.id??crypto.randomUUID(),propertyId,date,description:desc.trim(),categoryId:cat,supplierId:sup||null,grossCents:gross,vatRate:rate,vatCents:vatFromGross(gross,rate),paymentStatus:status,recurring:rec,invoiceNumber:invoice,notes});load();})}>Guardar</button>
        {edit&&<button className="secondary-button" onClick={()=>load()}>Cancelar</button>}
      </div>}
    </article>
    <article className="panel cost-table"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th>Estado</th><th>Valor</th><th></th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{x.date}</td><td><strong>{x.description||"—"}</strong>{x.recurring&&<small> · recorrente</small>}</td><td>{categoryName(x.categoryId)}</td><td>{supplierName(x.supplierId)}</td><td>{x.paymentStatus==="paid"?"Pago":"Pendente"}</td><td><strong>{euro(x.grossCents)}</strong></td><td><button onClick={()=>load(x)}>Editar</button><button onClick={()=>void act(()=>costsStore.deleteExpense(propertyId,x.id))}>Remover</button></td></tr>)}</tbody></table></article>
  </>;
}

function SalariesTab({propertyId,rows,act}:{propertyId:string;rows:SalaryRecord[];act:(w:()=>Promise<void>)=>Promise<void>}){
  const [edit,setEdit]=useState<SalaryRecord|null>(null);
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [name,setName]=useState("");
  const [role,setRole]=useState("");
  const [gross,setGross]=useState("");
  const [employer,setEmployer]=useState("");
  const [meal,setMeal]=useState("");
  const [other,setOther]=useState("");
  const [status,setStatus]=useState<"paid"|"pending">("paid");
  const [notes,setNotes]=useState("");
  function load(x?:SalaryRecord){setEdit(x??null);setMonth(x?.month??new Date().toISOString().slice(0,7));setName(x?.employeeName??"");setRole(x?.role??"");setGross(x?toAmount(x.grossSalaryCents):"");setEmployer(x?toAmount(x.employerCostsCents):"");setMeal(x?toAmount(x.mealAllowanceCents):"");setOther(x?toAmount(x.otherCostsCents):"");setStatus(x?.paymentStatus??"paid");setNotes(x?.notes??"");}
  const total=toCents(gross)+toCents(employer)+toCents(meal)+toCents(other);

  return <>
    <article className="panel"><h2>{edit?"Editar salário":"Novo salário"}</h2><div className="cost-form cost-form-grid">
      <label>Mês<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
      <label>Colaborador<input value={name} onChange={e=>setName(e.target.value)}/></label>
      <label>Função<input value={role} onChange={e=>setRole(e.target.value)}/></label>
      <label>Salário bruto (€)<input value={gross} onChange={e=>setGross(e.target.value)}/></label>
      <label>Encargos entidade patronal (€)<input value={employer} onChange={e=>setEmployer(e.target.value)}/></label>
      <label>Subsídio alimentação (€)<input value={meal} onChange={e=>setMeal(e.target.value)}/></label>
      <label>Outros custos (€)<input value={other} onChange={e=>setOther(e.target.value)}/></label>
      <label>Estado<select value={status} onChange={e=>setStatus(e.target.value as "paid"|"pending")}><option value="paid">Pago</option><option value="pending">Pendente</option></select></label>
      <label className="wide">Notas<textarea value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      <div className="salary-total">Custo total <strong>{euro(total)}</strong></div>
      <button className="primary-button" disabled={!name.trim()||total<=0} onClick={()=>void act(async()=>{await costsStore.saveSalary({id:edit?.id??crypto.randomUUID(),propertyId,month,employeeName:name.trim(),role,grossSalaryCents:toCents(gross),employerCostsCents:toCents(employer),mealAllowanceCents:toCents(meal),otherCostsCents:toCents(other),totalCostCents:total,paymentStatus:status,notes});load();})}>Guardar</button>
      {edit&&<button className="secondary-button" onClick={()=>load()}>Cancelar</button>}
    </div></article>
    <article className="panel cost-table"><table><thead><tr><th>Mês</th><th>Colaborador</th><th>Função</th><th>Bruto</th><th>Custo total</th><th>Estado</th><th></th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{x.month}</td><td><strong>{x.employeeName}</strong></td><td>{x.role||"—"}</td><td>{euro(x.grossSalaryCents)}</td><td><strong>{euro(x.totalCostCents)}</strong></td><td>{x.paymentStatus==="paid"?"Pago":"Pendente"}</td><td><button onClick={()=>load(x)}>Editar</button><button onClick={()=>void act(()=>costsStore.deleteSalary(propertyId,x.id))}>Remover</button></td></tr>)}</tbody></table></article>
  </>;
}
