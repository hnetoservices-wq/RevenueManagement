import { useEffect, useMemo, useState } from "react";
import type { IsoDate, Property } from "../../domain/models";
import {
  DEFAULT_NON_REFUNDABLE_DISCOUNT_PCT,
  DEFAULT_OTA_UPLIFT_PCT,
  DISCOUNT_KIND_LABELS,
  averageConfiguredBasePrice,
  buildRoomBasePriceRows,
  calculateDiscountRateResults,
  calculatePeriodReferenceRates,
  configuredBasePriceRange,
  defaultDiscountName,
  discountStackDescription,
  projectPeriodRoomRateRows,
  validatePricePeriod,
} from "./pricing";
import { priceManagementStore } from "./store";
import type { PriceDiscountEntry, PriceDiscountKind, PriceManagementConfig, PricePeriod } from "./types";
import "./pricing.css";

const DISCOUNT_KINDS: PriceDiscountKind[] = [
  "loyalty",
  "mobile",
  "basic_deal",
  "booking_campaign",
  "expedia_campaign",
  "limited_time_deal",
  "direct_last_minute",
  "ota_last_minute",
  "custom",
];

function euro(cents: number | null, currency: string) {
  if (cents === null || cents <= 0) return "—";
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

function percentageInput(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function parsePercentage(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function blankDiscount(): PriceDiscountEntry {
  return { id: crypto.randomUUID(), kind: "custom", name: "", discountPct: 0, active: true };
}

function activeDiscountCount(period: PricePeriod) {
  return period.discounts.filter((item) => item.active).length;
}

export function PriceManagementPage({ property }: { property: Property }) {
  const roomTypes = property.roomTypes.filter((room) => room.inventoryCount > 0);
  const emptyConfig = (): PriceManagementConfig => ({
    propertyId: property.id,
    referenceRoomTypeId: roomTypes[0]?.id ?? null,
    basePricesCents: {},
    periods: [],
    updatedAt: "",
  });

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
  const [periodOtaUplift, setPeriodOtaUplift] = useState(String(DEFAULT_OTA_UPLIFT_PCT));
  const [periodNrDiscount, setPeriodNrDiscount] = useState(String(DEFAULT_NON_REFUNDABLE_DISCOUNT_PCT));
  const [periodDiscounts, setPeriodDiscounts] = useState<PriceDiscountEntry[]>([]);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [matrixPeriodId, setMatrixPeriodId] = useState("");

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
      const next = saved ? { ...saved, referenceRoomTypeId: validReference } : { ...emptyConfig(), referenceRoomTypeId: validReference };
      setConfig(next);
      setInputs(Object.fromEntries(roomTypes.map((room) => [room.id, toInputValue(next.basePricesCents[room.id] ?? 0)])));
      setDirty(false);
      resetPeriodForm();
      setMatrixPeriodId(next.periods[0]?.id ?? "");
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id]);

  const draftConfig = useMemo<PriceManagementConfig>(() => ({
    ...config,
    propertyId: property.id,
    basePricesCents: Object.fromEntries(roomTypes.map((room) => [room.id, toCents(inputs[room.id] ?? "")])),
  }), [config, inputs, property.id, roomTypes]);

  const rows = useMemo(() => buildRoomBasePriceRows(roomTypes, draftConfig), [roomTypes, draftConfig]);
  const average = useMemo(() => averageConfiguredBasePrice(roomTypes, draftConfig.basePricesCents), [roomTypes, draftConfig.basePricesCents]);
  const range = useMemo(() => configuredBasePriceRange(roomTypes, draftConfig.basePricesCents), [roomTypes, draftConfig.basePricesCents]);
  const configuredCount = rows.filter((row) => row.basePriceCents > 0).length;
  const referenceRoom = roomTypes.find((room) => room.id === draftConfig.referenceRoomTypeId);
  const referencePrice = referenceRoom ? draftConfig.basePricesCents[referenceRoom.id] ?? 0 : 0;
  const periods = [...draftConfig.periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const totalActiveDiscounts = periods.reduce((sum, period) => sum + activeDiscountCount(period), 0);
  const matrixPeriod = periods.find((period) => period.id === matrixPeriodId) ?? periods[0] ?? null;
  const matrixRows = matrixPeriod ? projectPeriodRoomRateRows(roomTypes, draftConfig, matrixPeriod) : [];
  const matrixReferenceRates = matrixPeriod ? calculatePeriodReferenceRates(matrixPeriod) : null;
  const matrixDiscountRows = matrixPeriod && matrixReferenceRates
    ? calculateDiscountRateResults(matrixPeriod, matrixReferenceRates.otaFlexCents, matrixReferenceRates.directNonRefundableCents)
    : [];

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
    setPeriodOtaUplift(String(DEFAULT_OTA_UPLIFT_PCT));
    setPeriodNrDiscount(String(DEFAULT_NON_REFUNDABLE_DISCOUNT_PCT));
    setPeriodDiscounts([]);
    setEditingPeriodId(null);
    setPeriodError(null);
  }

  function addDiscount() {
    setPeriodDiscounts((current) => [...current, blankDiscount()]);
    setPeriodError(null);
  }

  function updateDiscount(id: string, patch: Partial<PriceDiscountEntry>) {
    setPeriodDiscounts((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setPeriodError(null);
  }

  function changeDiscountKind(item: PriceDiscountEntry, kind: PriceDiscountKind) {
    const oldDefault = defaultDiscountName(item.kind);
    const shouldRename = !item.name.trim() || item.name === oldDefault;
    updateDiscount(item.id, { kind, name: shouldRename ? defaultDiscountName(kind) : item.name });
  }

  function removeDiscount(id: string) {
    setPeriodDiscounts((current) => current.filter((item) => item.id !== id));
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
      otaUpliftPct: parsePercentage(periodOtaUplift),
      nonRefundableDiscountPct: parsePercentage(periodNrDiscount),
      discounts: periodDiscounts.map((item) => ({ ...item, name: item.name.trim() })),
    };
    const validation = validatePricePeriod(period, draftConfig.periods);
    if (validation) {
      setPeriodError(validation);
      return;
    }
    setConfig((current) => ({
      ...current,
      periods: [...current.periods.filter((item) => item.id !== period.id), period].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    }));
    setMatrixPeriodId(period.id);
    setDirty(true);
    setMessage(null);
    resetPeriodForm();
  }

  function editPeriod(period: PricePeriod) {
    setEditingPeriodId(period.id);
    setPeriodStart(period.startDate);
    setPeriodEnd(period.endDate);
    setPeriodPrice(toInputValue(period.directFlexReferenceCents));
    setPeriodOtaUplift(percentageInput(period.otaUpliftPct));
    setPeriodNrDiscount(percentageInput(period.nonRefundableDiscountPct));
    setPeriodDiscounts(period.discounts.map((item) => ({ ...item })));
    setPeriodError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removePeriod(id: string) {
    const remaining = draftConfig.periods.filter((item) => item.id !== id).sort((a, b) => a.startDate.localeCompare(b.startDate));
    setConfig((current) => ({ ...current, periods: remaining }));
    if (editingPeriodId === id) resetPeriodForm();
    if (matrixPeriodId === id) setMatrixPeriodId(remaining[0]?.id ?? "");
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
        <p>Estrutura base, períodos, incremento OTA e descontos configurados por intervalo de datas.</p>
      </div>
      <button className="primary-button" disabled={!dirty || saving || !roomTypes.length} onClick={() => void save()}>{saving ? "A guardar…" : "Guardar configuração"}</button>
    </div>

    {error && <div className="alert"><span>{error}</span><button onClick={() => setError(null)}>Fechar</button></div>}
    {message && <div className="pricing-success">{message}</div>}

    <section className="pricing-kpis">
      <article className="kpi-card"><div className="kpi-label">Quartos configurados</div><strong>{configuredCount}/{roomTypes.length}</strong><span className="neutral">Tipos de quarto com preço base</span></article>
      <article className="kpi-card"><div className="kpi-label">Quarto de referência</div><strong className="pricing-kpi-name">{referenceRoom?.canonicalName ?? "—"}</strong><span className="neutral">Preço âncora de cada período</span></article>
      <article className="kpi-card"><div className="kpi-label">Preço base de referência</div><strong>{referencePrice > 0 ? euro(referencePrice, property.currency) : "—"}</strong><span className="neutral">Base estrutural</span></article>
      <article className="kpi-card"><div className="kpi-label">Períodos definidos</div><strong>{periods.length}</strong><span className="neutral">Intervalos de preço</span></article>
      <article className="kpi-card"><div className="kpi-label">Descontos ativos</div><strong>{totalActiveDiscounts}</strong><span className="neutral">Somados em todos os períodos</span></article>
    </section>

    <div className="pricing-layout">
      <article className="panel pricing-reference-panel">
        <div className="panel-heading"><div><h2>Quarto de referência</h2><p>O Direct Flex de cada período será introduzido para este quarto.</p></div></div>
        <label className="pricing-reference-select">Quarto<select value={draftConfig.referenceRoomTypeId ?? ""} onChange={(event) => updateReference(event.target.value)}>{roomTypes.map((room) => <option key={room.id} value={room.id}>{room.canonicalName}</option>)}</select></label>
        <div className="pricing-logic-note"><strong>Lógica de Sheet1</strong><span>Os preços base mantêm a relação entre os quartos.</span><span>Os parâmetros comerciais deixam de ser globais: cada período tem o seu incremento OTA e os seus próprios descontos.</span></div>
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
        {range && <div className="pricing-base-footer">Média: <strong>{euro(average, property.currency)}</strong> · Amplitude: <strong>{euro(range.minCents, property.currency)} – {euro(range.maxCents, property.currency)}</strong></div>}
      </article>
    </div>

    <article className="panel pricing-period-editor">
      <div className="panel-heading"><div><h2>{editingPeriodId ? "Editar período" : "Novo período de preço"}</h2><p>Escolha as datas, o preço Direct Flex, o incremento OTA e depois adicione os descontos aplicáveis.</p></div></div>
      <div className="pricing-period-core">
        <label>De<input type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); setPeriodError(null); }} /></label>
        <label>Até<input type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); setPeriodError(null); }} /></label>
        <label>Direct Flex · {referenceRoom?.canonicalName ?? "Referência"}<div className="pricing-period-price"><span>€</span><input inputMode="decimal" placeholder="0,00" value={periodPrice} onChange={(event) => { setPeriodPrice(event.target.value); setPeriodError(null); }} /></div></label>
        <label>Incremento OTA<div className="pricing-percent-input"><input inputMode="decimal" value={periodOtaUplift} onChange={(event) => { setPeriodOtaUplift(event.target.value); setPeriodError(null); }} /><b>%</b></div></label>
        <label>Desconto NR<div className="pricing-percent-input"><input inputMode="decimal" value={periodNrDiscount} onChange={(event) => { setPeriodNrDiscount(event.target.value); setPeriodError(null); }} /><b>%</b></div></label>
      </div>

      <div className="pricing-discount-section">
        <div className="pricing-discount-heading"><div><h3>Descontos do período</h3><p>Cada entrada é independente. A acumulação é determinada automaticamente pela lógica de Sheet1.</p></div><button type="button" className="secondary-button" onClick={addDiscount}>+ Adicionar desconto</button></div>
        {periodDiscounts.length ? <div className="pricing-discount-list">
          {periodDiscounts.map((item) => <div className="pricing-discount-row" key={item.id}>
            <label>Tipo<select value={item.kind} onChange={(event) => changeDiscountKind(item, event.target.value as PriceDiscountKind)}>{DISCOUNT_KINDS.map((kind) => <option key={kind} value={kind}>{DISCOUNT_KIND_LABELS[kind]}</option>)}</select></label>
            <label>Nome<input value={item.name} placeholder={defaultDiscountName(item.kind)} onChange={(event) => updateDiscount(item.id, { name: event.target.value })} /></label>
            <label>Desconto<div className="pricing-percent-input"><input inputMode="decimal" value={percentageInput(item.discountPct)} onChange={(event) => updateDiscount(item.id, { discountPct: parsePercentage(event.target.value) })} /><b>%</b></div></label>
            <label className="pricing-active-toggle">Ativa<input type="checkbox" checked={item.active} onChange={(event) => updateDiscount(item.id, { active: event.target.checked })} /></label>
            <div className="pricing-stack-preview"><span>Acumula com</span><strong>{discountStackDescription(item.kind)}</strong></div>
            <button type="button" className="pricing-remove-discount" onClick={() => removeDiscount(item.id)}>Remover</button>
          </div>)}
        </div> : <div className="pricing-discount-empty">Sem descontos adicionados. O período pode existir apenas com Direct Flex + incremento OTA.</div>}
      </div>

      {periodError && <div className="pricing-period-error">{periodError}</div>}
      <div className="pricing-period-editor-actions"><button type="button" className="primary-button" onClick={savePeriodDraft}>{editingPeriodId ? "Atualizar período" : "+ Adicionar período"}</button>{editingPeriodId && <button type="button" className="secondary-button" onClick={resetPeriodForm}>Cancelar</button>}</div>
    </article>

    <article className="panel pricing-period-panel">
      <div className="panel-heading"><div><h2>Períodos configurados</h2><p>Resumo da estratégia comercial definida para cada intervalo.</p></div></div>
      {periods.length ? <div className="pricing-period-table-wrap"><table className="pricing-period-table pricing-period-summary"><thead><tr><th>Período</th><th>Direct Flex</th><th>Incremento OTA</th><th>NR</th><th>Descontos ativos</th><th>OTA público</th><th></th></tr></thead><tbody>
        {periods.map((period) => {
          const rates = calculatePeriodReferenceRates(period);
          return <tr key={period.id}>
            <td><strong>{formatDate(period.startDate)}</strong><span> → {formatDate(period.endDate)}</span></td>
            <td>{euro(period.directFlexReferenceCents, property.currency)}</td>
            <td>{percentageInput(period.otaUpliftPct)}%</td>
            <td>{percentageInput(period.nonRefundableDiscountPct)}%</td>
            <td><strong>{activeDiscountCount(period)}</strong> / {period.discounts.length}</td>
            <td>{euro(rates?.otaFlexCents ?? null, property.currency)}</td>
            <td className="pricing-period-actions"><button type="button" onClick={() => { setMatrixPeriodId(period.id); editPeriod(period); }}>Editar</button><button type="button" onClick={() => setMatrixPeriodId(period.id)}>Ver</button><button type="button" onClick={() => removePeriod(period.id)}>Remover</button></td>
          </tr>;
        })}
      </tbody></table></div> : <div className="pricing-period-empty">Ainda não existem períodos de preço.</div>}
    </article>

    {matrixPeriod && matrixReferenceRates && <>
      <article className="panel pricing-discount-simulation">
        <div className="pricing-matrix-header"><div><h2>Simulação de descontos · {referenceRoom?.canonicalName ?? "Referência"}</h2><p>{formatDate(matrixPeriod.startDate)} → {formatDate(matrixPeriod.endDate)} · OTA público {euro(matrixReferenceRates.otaFlexCents, property.currency)}</p></div><label>Período<select value={matrixPeriod.id} onChange={(event) => setMatrixPeriodId(event.target.value)}>{periods.map((period) => <option key={period.id} value={period.id}>{formatDate(period.startDate)} → {formatDate(period.endDate)}</option>)}</select></label></div>
        <div className="pricing-period-table-wrap"><table className="pricing-discount-results"><thead><tr><th>Desconto</th><th>%</th><th>Acumulação automática</th><th>Directa</th><th>Booking Flex</th><th>Booking NR</th><th>Expedia Flex</th><th>Expedia NR</th></tr></thead><tbody>
          {matrixDiscountRows.map((item) => <tr key={item.discountId} className={!item.active ? "pricing-inactive-discount" : ""}>
            <td><strong>{item.name}</strong>{!item.active && <span>Inativa</span>}</td><td>{percentageInput(item.discountPct)}%</td><td>{item.stackDescription}</td><td>{euro(item.directCents, property.currency)}</td><td>{euro(item.bookingFlexCents, property.currency)}</td><td>{euro(item.bookingNonRefundableCents, property.currency)}</td><td>{euro(item.expediaFlexCents, property.currency)}</td><td>{euro(item.expediaNonRefundableCents, property.currency)}</td>
          </tr>)}
          {!matrixDiscountRows.length && <tr><td colSpan={8} className="pricing-no-results">Este período não tem descontos.</td></tr>}
        </tbody></table></div>
      </article>

      <article className="panel pricing-matrix-panel">
        <div className="pricing-matrix-header"><div><h2>Matriz de preços por quarto</h2><p>Preços resultantes da estrutura do período selecionado.</p></div></div>
        <div className="pricing-period-table-wrap"><table className="pricing-room-matrix"><thead><tr><th>Quarto</th><th>Direct Flex</th><th>Direct NR</th><th>OTA Flex público</th><th>OTA NR público</th><th>Menor Booking</th><th>Menor Expedia</th></tr></thead><tbody>
          {matrixRows.map((row) => <tr key={row.roomTypeId} className={row.isReference ? "pricing-reference-row" : ""}><td><strong>{row.roomName}</strong>{row.isReference && <span className="pricing-reference-badge">Referência</span>}</td><td>{euro(row.directFlexCents, property.currency)}</td><td>{euro(row.directNonRefundableCents, property.currency)}</td><td>{euro(row.otaFlexCents, property.currency)}</td><td>{euro(row.otaNonRefundableCents, property.currency)}</td><td><strong>{euro(row.lowestBookingCents, property.currency)}</strong></td><td><strong>{euro(row.lowestExpediaCents, property.currency)}</strong></td></tr>)}
        </tbody></table></div>
        <div className="pricing-matrix-footnote">A construção do preço OTA absorve a maior Fidelização ativa e o Basic Deal ativo. Móveis acumula com Fidelização; Basic Deal acumula com Fidelização + Móveis; a campanha Booking acumula com Fidelização; campanha Expedia e Limited Time Deal são independentes; Last Minute OTA aplica-se ao menor preço OTA NR ativo.</div>
      </article>
    </>}
  </>;
}
