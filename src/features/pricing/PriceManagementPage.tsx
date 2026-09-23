import { useEffect, useMemo, useState } from "react";
import type { IsoDate, Property } from "../../domain/models";
import {
  averageConfiguredBasePrice,
  buildRoomBasePriceRows,
  configuredBasePriceRange,
  projectPeriodRoomPrices,
  validatePricePeriod,
} from "./pricing";
import { priceManagementStore } from "./store";
import type { PriceManagementConfig, PricePeriod } from "./types";
import "./pricing.css";

function euro(cents: number | null, currency: string) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function toInputValue(cents: number) {
  return cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

function toCents(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function PriceManagementPage({ property }: { property: Property }) {
  const roomTypes = property.roomTypes.filter((room) => room.inventoryCount > 0);
  const emptyConfig = (): PriceManagementConfig => ({ propertyId: property.id, referenceRoomTypeId: roomTypes[0]?.id ?? null, basePricesCents: {}, periods: [], updatedAt: "" });
  const [config, setConfig] = useState<PriceManagementConfig>(emptyConfig);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [periodPrice, setPeriodPrice] = useState("");
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);
    void priceManagementStore.get(property.id).then((saved) => {
      if (cancelled) return;
      const validReference = saved?.referenceRoomTypeId && roomTypes.some((room) => room.id === saved.referenceRoomTypeId)
        ? saved.referenceRoomTypeId
        : roomTypes[0]?.id ?? null;
      const next: PriceManagementConfig = saved
        ? { ...saved, referenceRoomTypeId: validReference, periods: saved.periods ?? [] }
        : { ...emptyConfig(), referenceRoomTypeId: validReference };
      setConfig(next);
      setInputs(Object.fromEntries(roomTypes.map((room) => [room.id, toInputValue(next.basePricesCents[room.id] ?? 0)])));
      setDirty(false);
      setPeriodStart("");
      setPeriodEnd("");
      setPeriodPrice("");
      setEditingPeriodId(null);
      setPeriodError(null);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [property.id]);

  const draftConfig = useMemo<PriceManagementConfig>(() => ({
    ...config,
    propertyId: property.id,
    basePricesCents: Object.fromEntries(roomTypes.map((room) => [room.id, toCents(inputs[room.id] ?? "")])),
    periods: config.periods ?? [],
  }), [config, inputs, property.id, roomTypes]);

  const rows = useMemo(() => buildRoomBasePriceRows(roomTypes, draftConfig), [roomTypes, draftConfig]);
  const average = useMemo(() => averageConfiguredBasePrice(roomTypes, draftConfig.basePricesCents), [roomTypes, draftConfig.basePricesCents]);
  const range = useMemo(() => configuredBasePriceRange(roomTypes, draftConfig.basePricesCents), [roomTypes, draftConfig.basePricesCents]);
  const configuredCount = rows.filter((row) => row.basePriceCents > 0).length;
  const referenceRoom = roomTypes.find((room) => room.id === draftConfig.referenceRoomTypeId);
  const referencePrice = referenceRoom ? draftConfig.basePricesCents[referenceRoom.id] ?? 0 : 0;
  const periods = [...(draftConfig.periods ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));

  function updatePrice(roomTypeId: string, value: string) {
    setInputs((current) => ({ ...current, [roomTypeId]: value }));
    setDirty(true);
    setMessage(null);
  }

  function updateReference(roomTypeId: string) {
    setConfig((current) => ({ ...current, referenceRoomTypeId: roomTypeId || null }));
    setDirty(true);
    setMessage(null);
  }

  function resetPeriodForm() {
    setPeriodStart("");
    setPeriodEnd("");
    setPeriodPrice("");
    setEditingPeriodId(null);
    setPeriodError(null);
  }

  function savePeriodDraft() {
    if (!referenceRoom || referencePrice <= 0) {
      setPeriodError("Defina primeiro o quarto de referência e o respetivo preço base.");
      return;
    }
    const period: PricePeriod = {
      id: editingPeriodId ?? crypto.randomUUID(),
      startDate: periodStart as IsoDate,
      endDate: periodEnd as IsoDate,
      directFlexReferenceCents: toCents(periodPrice),
    };
    const validation = validatePricePeriod(period, draftConfig.periods ?? []);
    if (validation) {
      setPeriodError(validation);
      return;
    }
    setConfig((current) => ({
      ...current,
      periods: [...(current.periods ?? []).filter((item) => item.id !== period.id), period].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    }));
    setDirty(true);
    setMessage(null);
    resetPeriodForm();
  }

  function editPeriod(period: PricePeriod) {
    setEditingPeriodId(period.id);
    setPeriodStart(period.startDate);
    setPeriodEnd(period.endDate);
    setPeriodPrice(toInputValue(period.directFlexReferenceCents));
    setPeriodError(null);
  }

  function removePeriod(id: string) {
    setConfig((current) => ({ ...current, periods: (current.periods ?? []).filter((item) => item.id !== id) }));
    if (editingPeriodId === id) resetPeriodForm();
    setDirty(true);
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = { ...draftConfig, updatedAt: new Date().toISOString() };
      await priceManagementStore.save(next);
      setConfig(next);
      setDirty(false);
      setMessage("Configuração de preços guardada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="pricing-loading">A carregar configuração de preços…</div>;

  return <>
    <div className="page-heading pricing-heading">
      <div>
        <p className="eyebrow">Gestão de preços</p>
        <h1>Price Manager</h1>
        <p>Defina os preços base e os períodos de preço Direct Flex da propriedade.</p>
      </div>
      <button className="primary-button" disabled={!dirty || saving || !roomTypes.length} onClick={() => void save()}>{saving ? "A guardar…" : "Guardar configuração"}</button>
    </div>

    {error && <div className="alert"><span>{error}</span><button onClick={() => setError(null)}>Fechar</button></div>}
    {message && <div className="pricing-success">{message}</div>}

    <section className="pricing-kpis">
      <article className="kpi-card"><div className="kpi-label">Quartos configurados</div><strong>{configuredCount}/{roomTypes.length}</strong><span className="neutral">Tipos de quarto com preço base</span></article>
      <article className="kpi-card"><div className="kpi-label">Quarto de referência</div><strong className="pricing-kpi-name">{referenceRoom?.canonicalName ?? "—"}</strong><span className="neutral">Quarto usado para definir cada período</span></article>
      <article className="kpi-card"><div className="kpi-label">Preço base de referência</div><strong>{referencePrice > 0 ? euro(referencePrice, property.currency) : "—"}</strong><span className="neutral">Base estrutural do quarto de referência</span></article>
      <article className="kpi-card"><div className="kpi-label">Média dos preços base</div><strong>{euro(average, property.currency)}</strong><span className="neutral">Média entre tipos configurados</span></article>
      <article className="kpi-card"><div className="kpi-label">Períodos definidos</div><strong>{periods.length}</strong><span className="neutral">Intervalos de preço configurados</span></article>
    </section>

    <div className="pricing-layout">
      <article className="panel pricing-reference-panel">
        <div className="panel-heading"><div><h2>Quarto de referência</h2><p>Escolha o quarto cujo preço Direct Flex será introduzido em cada período.</p></div></div>
        <label className="pricing-reference-select">Quarto<select value={draftConfig.referenceRoomTypeId ?? ""} onChange={(event) => updateReference(event.target.value)}>{roomTypes.map((room) => <option key={room.id} value={room.id}>{room.canonicalName}</option>)}</select></label>
        <div className="pricing-logic-note"><strong>Lógica de Sheet1</strong><span>Os preços base definem a estrutura da propriedade.</span><span>Em cada período introduz apenas o preço Direct Flex do quarto de referência; o Price Manager calcula os restantes preços Direct Flex automaticamente.</span></div>
      </article>

      <article className="panel pricing-base-panel">
        <div className="panel-heading"><div><h2>Preços base por quarto</h2><p>Defina o preço estrutural de cada tipo de quarto.</p></div><span className="pricing-unsaved">{dirty ? "Alterações por guardar" : config.updatedAt ? "Guardado" : "Ainda não configurado"}</span></div>
        {roomTypes.length ? <div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Tipo de quarto</th><th>Inventário</th><th>Preço base</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.roomTypeId} className={row.isReference ? "pricing-reference-row" : ""}>
            <td><strong>{row.roomName}</strong>{row.isReference && <span className="pricing-reference-badge">Referência</span>}</td>
            <td>{row.inventoryCount}</td>
            <td><div className="pricing-price-input"><span>€</span><input inputMode="decimal" placeholder="0,00" value={inputs[row.roomTypeId] ?? ""} onChange={(event) => updatePrice(row.roomTypeId, event.target.value)} /></div></td>
          </tr>)}
        </tbody></table></div> : <p className="cost-empty">A propriedade não tem tipos de quarto configurados.</p>}
        {range && <div className="pricing-base-footer">Amplitude dos preços base: <strong>{euro(range.minCents, property.currency)} – {euro(range.maxCents, property.currency)}</strong></div>}
      </article>
    </div>

    <article className="panel pricing-period-panel">
      <div className="panel-heading"><div><h2>Períodos de preço</h2><p>Defina intervalos de estadia e o preço Direct Flex do quarto de referência.</p></div></div>
      <div className="pricing-period-form">
        <label>De<input type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); setPeriodError(null); }} /></label>
        <label>Até<input type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); setPeriodError(null); }} /></label>
        <label>Direct Flex · {referenceRoom?.canonicalName ?? "Referência"}<div className="pricing-period-price"><span>€</span><input inputMode="decimal" placeholder="0,00" value={periodPrice} onChange={(event) => { setPeriodPrice(event.target.value); setPeriodError(null); }} /></div></label>
        <button type="button" className="primary-button" onClick={savePeriodDraft}>{editingPeriodId ? "Atualizar período" : "+ Adicionar período"}</button>
        {editingPeriodId && <button type="button" className="secondary-button" onClick={resetPeriodForm}>Cancelar</button>}
      </div>
      {periodError && <div className="pricing-period-error">{periodError}</div>}

      {periods.length ? <div className="pricing-period-table-wrap"><table className="pricing-period-table"><thead><tr><th>Período</th><th>Preço referência</th>{roomTypes.map((room) => <th key={room.id} className={room.id === draftConfig.referenceRoomTypeId ? "pricing-period-reference" : ""}>{room.canonicalName}</th>)}<th></th></tr></thead><tbody>
        {periods.map((period) => {
          const projected = projectPeriodRoomPrices(roomTypes, draftConfig, period);
          return <tr key={period.id}>
            <td><strong>{formatDate(period.startDate)}</strong><span> → {formatDate(period.endDate)}</span></td>
            <td><strong>{euro(period.directFlexReferenceCents, property.currency)}</strong></td>
            {roomTypes.map((room) => <td key={room.id} className={room.id === draftConfig.referenceRoomTypeId ? "pricing-period-reference" : ""}>{euro(projected[room.id] ?? null, property.currency)}</td>)}
            <td className="pricing-period-actions"><button type="button" onClick={() => editPeriod(period)}>Editar</button><button type="button" onClick={() => removePeriod(period.id)}>Remover</button></td>
          </tr>;
        })}
      </tbody></table></div> : <div className="pricing-period-empty">Ainda não existem períodos de preço. Adicione o primeiro período acima.</div>}
    </article>
  </>;
}
