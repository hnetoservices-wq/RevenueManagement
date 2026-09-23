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

const STACK_COLORS = ["blue", "yellow", "green", "grey", "pink"] as const;

function euro(cents: number | null | undefined, currency: string) {
  if (cents === null || cents === undefined || cents <= 0) return "";
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

function coefficient(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function blankDiscount(): PriceDiscountEntry {
  return { id: crypto.randomUUID(), kind: "custom", name: "", discountPct: 0, active: true };
}

function isLastMinute(kind: PriceDiscountKind) {
  return kind === "direct_last_minute" || kind === "ota_last_minute";
}

function normalizedDiscount(item: PriceDiscountEntry): PriceDiscountEntry {
  const name = item.name.trim() || defaultDiscountName(item.kind);
  return { ...item, name };
}

function stackSlots(kind: PriceDiscountKind): number[] {
  switch (kind) {
    case "loyalty": return [0, 1, 2];
    case "mobile": return [1, 2];
    case "basic_deal": return [1];
    case "booking_campaign": return [0];
    case "expedia_campaign": return [3];
    case "limited_time_deal": return [4];
    case "ota_last_minute": return [2];
    case "custom": return [3];
    default: return [];
  }
}

function selectedDiscountLabel(item: PriceDiscountEntry) {
  if (item.kind === "loyalty" && item.discountPct > 0) return `Fidelização ${percentageInput(item.discountPct)}%`;
  return item.name.trim() || DISCOUNT_KIND_LABELS[item.kind];
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
      if (next.periods[0]) loadPeriod(next.periods[0]); else resetPeriodForm();
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
  const referenceRoom = roomTypes.find((room) => room.id === draftConfig.referenceRoomTypeId);
  const referencePrice = referenceRoom ? draftConfig.basePricesCents[referenceRoom.id] ?? 0 : 0;
  const periods = [...draftConfig.periods].sort((a, b) => a.startDate.localeCompare(b.startDate));

  const previewPeriod = useMemo<PricePeriod>(() => ({
    id: editingPeriodId ?? "preview",
    startDate: (periodStart || "2000-01-01") as IsoDate,
    endDate: (periodEnd || periodStart || "2000-01-01") as IsoDate,
    directFlexReferenceCents: toCents(periodPrice),
    otaUpliftPct: parsePercentage(periodOtaUplift),
    nonRefundableDiscountPct: parsePercentage(periodNrDiscount),
    discounts: periodDiscounts.map(normalizedDiscount),
  }), [editingPeriodId, periodDiscounts, periodEnd, periodNrDiscount, periodOtaUplift, periodPrice, periodStart]);

  const previewRates = calculatePeriodReferenceRates(previewPeriod);
  const previewResults = previewRates
    ? calculateDiscountRateResults(previewPeriod, previewRates.otaFlexCents, previewRates.directNonRefundableCents)
    : [];
  const resultById = new Map(previewResults.map((item) => [item.discountId, item]));
  const regularDiscounts = periodDiscounts.filter((item) => !isLastMinute(item.kind));
  const lastMinuteDiscounts = periodDiscounts.filter((item) => isLastMinute(item.kind));
  const directCoefficient = previewRates && referencePrice > 0 ? previewRates.directFlexCents / referencePrice : null;
  const otaCoefficient = previewRates && referencePrice > 0 ? previewRates.otaFlexCents / referencePrice : null;
  const stackCounts = STACK_COLORS.map((_, index) => periodDiscounts.filter((item) => item.active && stackSlots(item.kind).includes(index)).length);
  const dateRowSpan = regularDiscounts.length + lastMinuteDiscounts.length + 3;
  const roomPreviewRows = previewRates ? projectPeriodRoomRateRows(roomTypes, draftConfig, previewPeriod) : [];

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

  function loadPeriod(period: PricePeriod) {
    setEditingPeriodId(period.id);
    setPeriodStart(period.startDate);
    setPeriodEnd(period.endDate);
    setPeriodPrice(toInputValue(period.directFlexReferenceCents));
    setPeriodOtaUplift(percentageInput(period.otaUpliftPct));
    setPeriodNrDiscount(percentageInput(period.nonRefundableDiscountPct));
    setPeriodDiscounts(period.discounts.map((item) => ({ ...item })));
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
    updateDiscount(item.id, { kind, name: defaultDiscountName(kind) });
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
      ...previewPeriod,
      id: editingPeriodId ?? crypto.randomUUID(),
      startDate: periodStart as IsoDate,
      endDate: periodEnd as IsoDate,
      discounts: periodDiscounts.map(normalizedDiscount),
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
    setEditingPeriodId(period.id);
    setPeriodDiscounts(period.discounts.map((item) => ({ ...item })));
    setDirty(true);
    setMessage(null);
    setPeriodError(null);
  }

  function removePeriod(id: string) {
    const remaining = draftConfig.periods.filter((item) => item.id !== id).sort((a, b) => a.startDate.localeCompare(b.startDate));
    setConfig((current) => ({ ...current, periods: remaining }));
    setDirty(true);
    setMessage(null);
    if (editingPeriodId === id) {
      if (remaining[0]) loadPeriod(remaining[0]); else resetPeriodForm();
    }
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

  function renderStackCells(item: PriceDiscountEntry) {
    const slots = stackSlots(item.kind);
    return STACK_COLORS.map((color, index) => <td
      key={`${item.id}-${color}`}
      className={`sheet-stack-cell ${slots.includes(index) ? `sheet-stack-${color}` : ""}`}
      title={discountStackDescription(item.kind)}
    >{item.active && slots.includes(index) ? "✓" : ""}</td>);
  }

  function renderRateCells(item: PriceDiscountEntry) {
    const result = resultById.get(item.id);
    if (item.kind === "direct_last_minute") {
      return <><td colSpan={2} className="sheet-rate sheet-rate-merged">{euro(result?.directCents, property.currency)}</td><td colSpan={2}></td><td colSpan={2}></td></>;
    }
    if (item.kind === "ota_last_minute") {
      return <><td colSpan={2}></td><td colSpan={2} className="sheet-rate sheet-rate-merged">{euro(result?.bookingFlexCents, property.currency)}</td><td colSpan={2} className="sheet-rate sheet-rate-merged">{euro(result?.expediaFlexCents, property.currency)}</td></>;
    }
    return <>
      <td className="sheet-rate">{euro(result?.directCents, property.currency)}</td>
      <td className="sheet-rate"></td>
      <td className="sheet-rate">{euro(result?.bookingFlexCents, property.currency)}</td>
      <td className="sheet-rate">{euro(result?.bookingNonRefundableCents, property.currency)}</td>
      <td className="sheet-rate">{euro(result?.expediaFlexCents, property.currency)}</td>
      <td className="sheet-rate">{euro(result?.expediaNonRefundableCents, property.currency)}</td>
    </>;
  }

  function renderDiscountRow(item: PriceDiscountEntry) {
    return <tr key={item.id} className={!item.active ? "sheet-inactive-row" : ""}>
      <td colSpan={2} className="sheet-discount-name">
        {item.kind === "custom" ? <div className="sheet-custom-discount">
          <select value={item.kind} onChange={(event) => changeDiscountKind(item, event.target.value as PriceDiscountKind)}>{DISCOUNT_KINDS.map((kind) => <option key={kind} value={kind}>{DISCOUNT_KIND_LABELS[kind]}</option>)}</select>
          <input value={item.name} placeholder="Nome do desconto" onChange={(event) => updateDiscount(item.id, { name: event.target.value })} />
        </div> : <select value={item.kind} onChange={(event) => changeDiscountKind(item, event.target.value as PriceDiscountKind)}>
          {DISCOUNT_KINDS.map((kind) => <option key={kind} value={kind}>{kind === item.kind ? selectedDiscountLabel(item) : DISCOUNT_KIND_LABELS[kind]}</option>)}
        </select>}
        <button type="button" className="sheet-remove-row" title="Remover desconto" onClick={() => removeDiscount(item.id)}>×</button>
      </td>
      <td className="sheet-percent-cell"><input inputMode="decimal" value={percentageInput(item.discountPct)} onChange={(event) => updateDiscount(item.id, { discountPct: parsePercentage(event.target.value) })} /><span>%</span></td>
      <td className="sheet-active-cell"><input type="checkbox" checked={item.active} onChange={(event) => updateDiscount(item.id, { active: event.target.checked })} /></td>
      {renderStackCells(item)}
      {renderRateCells(item)}
    </tr>;
  }

  if (loading) return <div className="pricing-loading">A carregar configuração de preços…</div>;

  return <>
    <div className="page-heading pricing-heading">
      <div>
        <p className="eyebrow">Gestão de preços</p>
        <h1>Price Manager</h1>
        <p>Plano de preços baseado na lógica da Sheet1.</p>
      </div>
      <button className="primary-button" disabled={!dirty || saving || !roomTypes.length} onClick={() => void save()}>{saving ? "A guardar…" : "Guardar tudo"}</button>
    </div>

    {error && <div className="alert"><span>{error}</span><button onClick={() => setError(null)}>Fechar</button></div>}
    {message && <div className="pricing-success">{message}</div>}

    <div className="pricing-layout">
      <article className="panel pricing-reference-panel">
        <div className="panel-heading"><div><h2>Quarto de referência</h2><p>O quarto usado como âncora do plano.</p></div></div>
        <label className="pricing-reference-select">Quarto<select value={draftConfig.referenceRoomTypeId ?? ""} onChange={(event) => updateReference(event.target.value)}>{roomTypes.map((room) => <option key={room.id} value={room.id}>{room.canonicalName}</option>)}</select></label>
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

    <article className="panel pricing-sheet-panel">
      <div className="pricing-sheet-controls">
        <label>Período<select value={editingPeriodId ?? ""} onChange={(event) => {
          const period = periods.find((item) => item.id === event.target.value);
          if (period) loadPeriod(period); else resetPeriodForm();
        }}><option value="">Novo período</option>{periods.map((period) => <option key={period.id} value={period.id}>{formatDate(period.startDate)} → {formatDate(period.endDate)}</option>)}</select></label>
        <button type="button" className="secondary-button" onClick={resetPeriodForm}>+ Novo período</button>
        <label className="sheet-inline-percent">Incremento OTA<div><input inputMode="decimal" value={periodOtaUplift} onChange={(event) => { setPeriodOtaUplift(event.target.value); setPeriodError(null); }} /><span>%</span></div></label>
        <label className="sheet-inline-percent">NR<div><input inputMode="decimal" value={periodNrDiscount} onChange={(event) => { setPeriodNrDiscount(event.target.value); setPeriodError(null); }} /><span>%</span></div></label>
        {editingPeriodId && <button type="button" className="pricing-danger-button" onClick={() => removePeriod(editingPeriodId)}>Remover período</button>}
      </div>

      <div className="pricing-sheet-title"><strong>{referenceRoom?.canonicalName ?? "Quarto de referência"}</strong><b>{euro(referencePrice, property.currency) || "—"}</b></div>

      <div className="pricing-sheet-wrap">
        <table className="pricing-sheet-grid">
          <thead>
            <tr>
              <th rowSpan={2} className="sheet-dates-head">DATAS</th>
              <th colSpan={2}>Coeficiente</th>
              <th rowSpan={2}>Desconto</th>
              <th rowSpan={2} className="sheet-active-head">Promoção<br/>Ativa</th>
              <th colSpan={5}>Acumulo<br/>Desconto OTAS</th>
              <th colSpan={2} className="sheet-direct-head">Directas</th>
              <th colSpan={2} className="sheet-booking-head">Booking</th>
              <th colSpan={2} className="sheet-expedia-head">Expedia</th>
            </tr>
            <tr>
              <th>Directa</th><th>OTA</th>
              {STACK_COLORS.map((color) => <th key={color} className={`sheet-stack-head sheet-stack-${color}`}></th>)}
              <th>Flex</th><th>NR</th><th>Flex</th><th>NR</th><th>Flex</th><th>NR</th>
            </tr>
          </thead>
          <tbody>
            <tr className="sheet-base-row">
              <td rowSpan={dateRowSpan} className="sheet-dates-cell">
                <input type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); setPeriodError(null); }} />
                <span>A</span>
                <input type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); setPeriodError(null); }} />
              </td>
              <td>{coefficient(directCoefficient)}</td>
              <td>{coefficient(otaCoefficient)}</td>
              <td></td><td></td>
              {STACK_COLORS.map((color) => <td key={`base-${color}`}></td>)}
              <td className="sheet-money-input"><span>€</span><input inputMode="decimal" value={periodPrice} placeholder="0,00" onChange={(event) => { setPeriodPrice(event.target.value); setPeriodError(null); }} /></td>
              <td className="sheet-rate">{euro(previewRates?.directNonRefundableCents, property.currency)}</td>
              <td className="sheet-rate">{euro(previewRates?.otaFlexCents, property.currency)}</td>
              <td className="sheet-rate">{euro(previewRates?.otaNonRefundableCents, property.currency)}</td>
              <td className="sheet-rate">{euro(previewRates?.otaFlexCents, property.currency)}</td>
              <td className="sheet-rate">{euro(previewRates?.otaNonRefundableCents, property.currency)}</td>
            </tr>

            {regularDiscounts.map(renderDiscountRow)}

            <tr className="sheet-last-minute-divider"><td colSpan={15}>Last Minute</td></tr>

            {lastMinuteDiscounts.map(renderDiscountRow)}

            <tr className="sheet-accumulation-row">
              <td colSpan={2}>Acumulo de Descontos</td><td></td><td></td>
              {stackCounts.map((count, index) => <td key={`count-${STACK_COLORS[index]}`} className={`sheet-stack-${STACK_COLORS[index]}`}>{count || ""}</td>)}
              <td colSpan={6}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pricing-sheet-actions">
        <button type="button" className="secondary-button" onClick={addDiscount}>+ Adicionar entrada</button>
        <span>{regularDiscounts.length + lastMinuteDiscounts.length} descontos</span>
        <button type="button" className="primary-button" onClick={savePeriodDraft}>{editingPeriodId ? "Aplicar alterações ao período" : "Adicionar período"}</button>
      </div>
      {periodError && <div className="pricing-period-error">{periodError}</div>}
    </article>

    {roomPreviewRows.length > 0 && <article className="panel pricing-room-preview-panel">
      <div className="panel-heading"><div><h2>Preços resultantes por quarto</h2><p>Pré-visualização do período atualmente aberto.</p></div></div>
      <div className="pricing-table-wrap"><table className="pricing-room-preview"><thead><tr><th>Quarto</th><th>Direct Flex</th><th>Direct NR</th><th>OTA Flex</th><th>OTA NR</th><th>Menor Booking</th><th>Menor Expedia</th></tr></thead><tbody>
        {roomPreviewRows.map((row) => <tr key={row.roomTypeId} className={row.isReference ? "pricing-reference-row" : ""}><td><strong>{row.roomName}</strong>{row.isReference && <span className="pricing-reference-badge">Referência</span>}</td><td>{euro(row.directFlexCents, property.currency)}</td><td>{euro(row.directNonRefundableCents, property.currency)}</td><td>{euro(row.otaFlexCents, property.currency)}</td><td>{euro(row.otaNonRefundableCents, property.currency)}</td><td>{euro(row.lowestBookingCents, property.currency)}</td><td>{euro(row.lowestExpediaCents, property.currency)}</td></tr>)}
      </tbody></table></div>
    </article>}
  </>;
}
